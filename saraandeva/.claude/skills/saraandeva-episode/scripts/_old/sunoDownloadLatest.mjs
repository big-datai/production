#!/usr/bin/env node
/**
 * Download the latest finished Suno song(s) by querying Suno's internal feed
 * API from inside the logged-in suno.com tab — no More-options menu dance.
 *
 * Usage:
 *   node sunoDownloadLatest.mjs <out_path.mp3>              # download top song
 *   node sunoDownloadLatest.mjs <out_path.mp3> --match "title substring"
 *   node sunoDownloadLatest.mjs --list                       # just print recent
 *
 * Prereq: Chrome at debug port 9222 with a logged-in suno.com tab open.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const argFlag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const positional = argv.filter((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1]?.startsWith("--")));
const outPath = positional[0] ? path.resolve(positional[0]) : null;
const matchSubstr = argFlag("match");
const listOnly = argv.includes("--list");

if (!listOnly && !outPath) {
  console.error("Usage: sunoDownloadLatest.mjs <out_path.mp3> [--match \"title substring\"]");
  console.error("       sunoDownloadLatest.mjs --list");
  process.exit(1);
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30_000 });
const ctx = browser.contexts()[0];
let page = ctx.pages().find(p => p.url().includes("suno.com"));
if (!page) {
  page = await ctx.newPage();
  await page.goto("https://suno.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
}
await page.bringToFront();
console.log(`Connected to ${page.url()}`);

// Query Suno's feed API from inside the tab. Authoritative endpoint is
// POST https://studio-api-prod.suno.com/api/feed/v3 with Clerk Bearer JWT
// (sniffed from real network traffic 2026-05-07).
const feedJson = await page.evaluate(async () => {
  // Get JWT from Clerk session
  let token = null;
  try { token = await window.Clerk?.session?.getToken({ template: "studio-api" }); } catch {}
  if (!token) { try { token = await window.Clerk?.session?.getToken(); } catch {} }
  if (!token) return { ok: false, err: "no Clerk JWT — is the tab logged in?" };

  const body = {
    cursor: null,
    limit: 50,
    filters: {
      disliked: "False",
      trashed: "False",
      fromStudioProject: { presence: "False" },
      stem: { presence: "False" },
      workspace: { presence: "True", workspaceId: "default" },
    },
  };
  const r = await fetch("https://studio-api-prod.suno.com/api/feed/v3", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) return { ok: false, err: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const j = await r.json();
  return { ok: true, body: j };
});

if (!feedJson.ok) {
  console.error(`Feed fetch failed: ${feedJson.err}`);
  process.exit(1);
}

// v3 shape: { clips: [...], num_total_results, current_page, ...}
const body = feedJson.body;
const clips = body.clips || body.data || body.results || (Array.isArray(body) ? body : []);
if (!clips.length) {
  console.error("Feed returned 0 clips.");
  process.exit(1);
}

const songs = clips.map(c => ({
  id: c.id || c.clip_id,
  title: c.title || c.metadata?.title || "(no title)",
  status: c.status,
  audio_url: c.audio_url || c.audioUrl,
  created_at: c.created_at || c.createdAt,
})).filter(s => s.audio_url && /complete|streamed|sent_to_chat/i.test(s.status || "complete"));

songs.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

if (listOnly) {
  console.log(`Recent ${Math.min(10, songs.length)} songs:`);
  for (const s of songs.slice(0, 10)) {
    console.log(`  ${s.created_at?.slice(0, 19) || "?"}  ${s.title}  ${s.id}`);
  }
  process.exit(0);
}

const target = matchSubstr
  ? songs.find(s => (s.title || "").toLowerCase().includes(matchSubstr.toLowerCase())) || songs[0]
  : songs[0];

console.log(`Downloading: ${target.title}  (${target.id})`);
console.log(`From: ${target.audio_url}`);

// Download from CDN directly via Node (page.evaluate hits CORS on cdn1.suno.ai).
// Suno CDN URLs are signed/public — no auth needed.
const r = await fetch(target.audio_url);
if (!r.ok) throw new Error(`CDN download HTTP ${r.status}`);
const buf = Buffer.from(await r.arrayBuffer());
fs.writeFileSync(outPath, buf);
const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`✓ saved → ${outPath}  (${sizeKB} KB)`);
process.exit(0);
