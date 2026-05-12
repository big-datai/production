#!/usr/bin/env node
/**
 * Download Kling Omni renders by matching prompts in IndexedDB to spec JSONs.
 *
 * THE canonical download method for Sara & Eva episodes. Replaces the older
 * UI-driven download scripts (downloadAllClips.mjs, downloadAllNoWatermark.mjs,
 * downloadClip.mjs, downloadLatestOmni.mjs) which were brittle (asset-page
 * order shuffles, dynamic IDs, watermark uncertainty).
 *
 * How it works:
 *   1. Open Kling tab on /app/omni/new
 *   2. CLEAR IndexedDB.request_data_cache.task-feeds — Kling caches API
 *      responses by pageTime, and stale pages can serve status=5 (rendering)
 *      entries forever even after they finish.
 *   3. Reload the page → fresh API call → fresh task feed in IndexedDB
 *   4. Read every cached task with an output URL (works[0].resource.resource)
 *   5. Match each spec JSON's prompt to a cached task's prompt by
 *      longest-common-prefix on a normalized form (@-tags and ElementN refs
 *      both replaced with X, lowercase, whitespace collapsed)
 *   6. Greedy-assign highest-score pairs first, so two specs can't claim
 *      the same task
 *   7. HTTP-fetch each matched resource URL → save as <N>.mp4
 *
 * Why this beats the asset-page approach:
 *   - Order is deterministic (clip 1 → 1.mp4) instead of last-rendered-first
 *   - No dependency on UI selectors that drift between Kling releases
 *   - Catches every clip, even ones below the user-assets-page fold
 *   - Resource URL is the unwatermarked output by default
 *
 * Usage:
 *   node downloadOmniByPrompt.mjs <spec_dir> <out_dir>
 *
 * Example:
 *   node downloadOmniByPrompt.mjs \
 *     content/saraandeva/episodes/ep06 \
 *     exports/saraandeva/season_01/episode_06/clips
 *
 * Spec dir layout: numeric .json files (1.json, 2.json, ..., 17.json), each
 * with a `clip` field (the integer clip number) and a `prompt` field. The
 * spec's `clip` value becomes the output filename: clip → <clip>.mp4.
 *
 * Output: <out_dir>/<N>.mp4 for each successfully matched clip. Reports any
 * clips that didn't match — those are likely silent-failed at credit cap and
 * need re-submission.
 *
 * Prerequisites:
 *   - Debug-port Chrome running with Kling logged in (port 9222)
 *   - Kling tab open
 *   - Episode's clips already SUBMITTED to Kling and rendered
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const specDir = path.resolve(argv[0] || "");
const outDir = path.resolve(argv[1] || "");
if (!specDir || !outDir) {
  console.error("Usage: downloadOmniByPrompt.mjs <spec_dir> <out_dir>");
  process.exit(1);
}
if (!fs.existsSync(specDir)) { console.error(`❌ spec dir not found: ${specDir}`); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

// ─── LOAD SPECS ─────────────────────────────────────────────────────────────
// Load every numeric .json file from spec_dir. Index by `clip` field.
const specs = {};
for (const f of fs.readdirSync(specDir)) {
  // Accept numeric clip files (1.json, 2.json, ...) AND letter-named
  // music-video specs (A.json, B.json, C.json) AND decimal-numbered
  // insert-clips (3.7.json, 4.5.json, 17.5.json — used for transition
  // beats and music-video segments inserted between numeric clips).
  // Bug fixes: post-ep10 added decimal acceptance after 4 add-on
  // transition clips were silently dropped.
  if (!/^(\d+(\.\d+)?|[A-Z])\.json$/.test(f)) continue;
  const spec = JSON.parse(fs.readFileSync(path.join(specDir, f), "utf8"));
  // Accept numeric clips (1, 2, ...) AND letter-named music-video clips
  // (A, B, C). Both produce <clip>.mp4 outputs. Bug fixed post-ep09:
  // letter-clip music videos were silently skipped because the type check
  // required `typeof spec.clip === "number"`.
  if ((typeof spec.clip !== "number" && typeof spec.clip !== "string") || typeof spec.prompt !== "string") {
    console.warn(`⚠ ${f}: missing clip/prompt — skipping`);
    continue;
  }
  // Normalize for matching: @-tags AND Element\d+ both → X (Kling stores
  // bound elements as Element1/2/3 in the cached prompt, while specs use @Tag).
  // Also consume the optional possessive `'s` after either form — Kling renders
  // chips with a space before `'s` while specs write `@Eva's` tight; without
  // this both shapes would diverge after the X token and tank the prefix score.
  const norm = spec.prompt
    .replace(/@[A-Za-z][A-Za-z0-9_-]*(\s*'s)?/g, "X")
    .replace(/Element\d+(\s*'s)?/g, "X")
    .replace(/[\s,.]+/g, " ")
    .toLowerCase()
    .trim();
  specs[spec.clip] = { spec, norm };
}
console.log(`📋 Loaded ${Object.keys(specs).length} specs from ${specDir}`);

// ─── CONNECT + FORCE-REFRESH CACHE ──────────────────────────────────────────
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

// HARD-RESET cache: clear the task-feeds object store so the Omni page
// refetches fresh on reload. Without this, Kling serves stale cached pages.
console.log(`🧹 Clearing IndexedDB task-feeds cache + reloading...`);
await page.evaluate(async () => {
  await new Promise(r => {
    const req = indexedDB.open("request_data_cache");
    req.onsuccess = () => {
      const tx = req.result.transaction("task-feeds", "readwrite");
      tx.objectStore("task-feeds").clear();
      tx.oncomplete = () => r();
    };
    req.onerror = () => r();
  });
});
await page.reload({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await page.waitForTimeout(5000);

// SCROLL-TO-FETCH: clear+reload alone often fetches only the newest 20
// tasks (page 1). Recent re-renders may be on later pagination pages that
// require scrolling to trigger. Scroll the task feed sidebar 6×.
console.log(`📜 Scrolling task feed to trigger pagination fetches...`);
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, 800).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll('[class*="stream"],[class*="task"],aside,[class*="material"],[class*="feed"]').forEach(el => {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    });
  });
  await page.waitForTimeout(1500);
}

// ─── READ TASKS ─────────────────────────────────────────────────────────────
const cachedTasks = await page.evaluate(async () => {
  const data = await new Promise((resolve, reject) => {
    const req = indexedDB.open("request_data_cache");
    req.onsuccess = () => {
      const tx = req.result.transaction("task-feeds", "readonly");
      const all = tx.objectStore("task-feeds").getAll();
      all.onsuccess = () => resolve(all.result);
      all.onerror = () => reject(all.error);
    };
    req.onerror = () => reject(req.error);
  });
  // Each cache entry is a paginated query response. Flatten to a list of
  // {task, works} items, dedupe by task.id.
  const all = [];
  for (const item of data) if (Array.isArray(item.data)) for (const t of item.data) all.push(t);
  const seen = new Set();
  const unique = [];
  for (const t of all) if (t?.task?.id && !seen.has(t.task.id)) { seen.add(t.task.id); unique.push(t); }
  // Filter to today's Omni video submissions with an output URL. Output URL
  // existence is a cleaner signal than status=99 (catches edge cases where
  // status hasn't propagated yet).
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return unique
    .filter(t => t.task.type === "m2v_omni_video" && t.task.createTime > cutoff)
    .map(t => {
      const args = t.task.taskInfo?.arguments || [];
      const prompt = args.find(a => a.name === "prompt")?.value || "";
      const url = t.works?.[0]?.resource?.resource || null;
      return { taskId: t.task.id, createTime: t.task.createTime, status: t.task.status, prompt, url };
    })
    .filter(t => t.url);
});
await browser.close();
console.log(`📦 ${cachedTasks.length} completed Omni renders in cache (last 24h)\n`);

// ─── MATCH SPECS → TASKS ────────────────────────────────────────────────────
// Normalize cached prompts the same way we did the specs.
// Both `Element\d+` (Kling's chip-rendered form) and `@Tag` (the spec's form)
// can be followed by a possessive `'s`. Kling inserts a space before the
// apostrophe (e.g. `Element1 's face`) but specs write it tight (`@Eva's
// face`). Capture the optional possessive in both regexes so both shapes
// collapse to the same token "X". Without this, prompts with `@Char's`
// score below MIN_SCORE and silently fail to match. (ep08 clips 7, 9)
const normCached = (s) => s
  .replace(/Element\d+(\s*'s)?/g, "X")
  .replace(/@[A-Za-z][A-Za-z0-9_-]*(\s*'s)?/g, "X")
  .replace(/[\s,.]+/g, " ")
  .toLowerCase()
  .trim();

// Score = longest common prefix length (in normalized form). Compare first
// 200 chars — long enough to disambiguate but short enough to not penalize
// minor Kling-side reformatting at the tail.
function score(a, b) {
  let i = 0;
  const max = Math.min(a.length, b.length);
  while (i < max && a[i] === b[i]) i++;
  return i;
}

// Rank ALL spec×task pairs by score, then greedy-assign best matches first.
// This avoids two specs claiming the same task (which happens if you match
// one-spec-at-a-time and an early spec snags a poor partial-match).
const pairs = [];
for (const [clipNum, { norm: specNorm }] of Object.entries(specs)) {
  for (const t of cachedTasks) {
    pairs.push({
      clipNum,
      taskId: t.taskId,
      task: t,
      score: score(specNorm.slice(0, 200), normCached(t.prompt).slice(0, 200)),
    });
  }
}
pairs.sort((a, b) => b.score - a.score);

const matches = {};
const claimedTasks = new Set();
const claimedClips = new Set();
const MIN_SCORE = 30; // shorter than this is too ambiguous — likely a coincidence
for (const p of pairs) {
  if (claimedClips.has(p.clipNum) || claimedTasks.has(p.taskId)) continue;
  if (p.score < MIN_SCORE) break;
  matches[p.clipNum] = { ...p.task, score: p.score };
  claimedClips.add(p.clipNum);
  claimedTasks.add(p.taskId);
  const ts = new Date(p.task.createTime).toISOString().slice(11, 19);
  console.log(`✓ clip ${p.clipNum}: matched task ${p.taskId} (score=${p.score}, t=${ts})`);
}
for (const clipNum of Object.keys(specs)) {
  if (!claimedClips.has(clipNum)) {
    matches[clipNum] = null;
    console.log(`⚠ clip ${clipNum}: no match (likely silent-failed at credit cap)`);
  }
}

// ─── DOWNLOAD ───────────────────────────────────────────────────────────────
console.log(`\n⬇ Downloading...\n`);
let okCount = 0;
let failedCount = 0;
const sortedClips = Object.entries(matches).sort((a, b) => Number(a[0]) - Number(b[0]));
for (const [clipNum, m] of sortedClips) {
  if (!m) { console.log(`  ⊘ ${clipNum}.mp4 — no match, skipping`); continue; }
  const out = path.join(outDir, `${clipNum}.mp4`);
  process.stdout.write(`  → ${clipNum}.mp4 ...`);
  try {
    const res = await fetch(m.url);
    if (!res.ok) { console.log(` ❌ HTTP ${res.status}`); failedCount++; continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(out, buf);
    console.log(` ✓ ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
    okCount++;
  } catch (e) {
    console.log(` ❌ ${e.message.slice(0, 80)}`);
    failedCount++;
  }
}
console.log(`\n📊 Downloaded ${okCount} of ${Object.values(matches).filter(m => m).length} matched clips → ${outDir}`);
const missing = Object.entries(matches).filter(([_, m]) => !m).map(([k]) => k);
if (missing.length) {
  console.log(`📋 Unmatched specs (need re-submission when credits allow): ${missing.join(", ")}`);
}
