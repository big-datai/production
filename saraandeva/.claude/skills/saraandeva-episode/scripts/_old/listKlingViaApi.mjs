#!/usr/bin/env node
/**
 * List Kling resources via the official AK/SK API.
 * Replaces /tmp/kling_list_elements.py + /tmp/kling_list_videos.py.
 *
 * Usage:
 *   node listKlingViaApi.mjs --elements                          # custom element library
 *   node listKlingViaApi.mjs --presets                           # 54 official preset elements
 *   node listKlingViaApi.mjs --videos [--mode multi-image2video] # video tasks (default: omni-video)
 *   node listKlingViaApi.mjs --balance                           # remaining trial-pack units
 *   node listKlingViaApi.mjs --all                               # all of the above
 */
import fs from "node:fs";
import { createHmac } from "node:crypto";

const ENV_FILE = "/Volumes/Samsung500/goreadling-production/.env.local";
const BASE = "https://api-singapore.klingai.com";

for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z_0-9]*)=["']?(.+?)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const AK = process.env.KLING_ACCESS_KEY, SK = process.env.KLING_SECRET_KEY;
if (!AK || !SK) { console.error("missing KLING keys in .env.local"); process.exit(1); }

const argv = process.argv.slice(2);
const argFlag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(`--${n}`);

const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function token() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify({ iss: AK, exp: now + 1800, nbf: now - 5 }));
  const s = b64url(createHmac("sha256", SK).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}
async function get(p) {
  const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${token()}` } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function listEnvelope(path, label, maxPages = 10, pageSize = 500) {
  console.log(`\n=== ${label}  (${path}) ===`);
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await get(`${path}?pageNum=${page}&pageSize=${pageSize}`);
    if (r.body.code !== 0) { console.log(`  page ${page}: ${JSON.stringify(r.body).slice(0, 200)}`); return; }
    const data = r.body.data || [];
    all.push(...data);
    if (data.length < pageSize) break;
  }
  const elements = all.flatMap(env => ((env.task_result || {}).elements || []));
  console.log(`  ${elements.length} element(s) across ${all.length} envelope(s)`);
  for (const el of elements) {
    const tags = (el.tag_list || []).map(t => t.tag_id).join(",");
    const desc = String(el.element_description || "").slice(0, 50);
    console.log(`  id=${String(el.element_id).padEnd(20)}  name=${JSON.stringify(el.element_name).padEnd(28)}  tags=[${tags}]  ${JSON.stringify(desc)}`);
  }
}

async function listVideos(mode = "omni-video", limit = 30) {
  const path = mode === "omni-video" ? "/v1/videos/omni-video" : `/v1/videos/${mode}`;
  console.log(`\n=== Video tasks  (${path}) ===`);
  const r = await get(`${path}?pageNum=1&pageSize=${limit}`);
  if (r.body.code !== 0) { console.log(JSON.stringify(r.body).slice(0, 300)); return; }
  const tasks = r.body.data || [];
  console.log(`  ${tasks.length} task(s)`);
  for (const t of tasks) {
    const ts = t.created_at ? new Date(t.created_at).toISOString().slice(0, 19) : "?";
    const status = String(t.task_status || "?").padEnd(10);
    const ext = t.task_info?.external_task_id ? `ext=${t.task_info.external_task_id}` : "";
    const url = t.task_result?.videos?.[0]?.url ? "(has-mp4)" : "";
    const prompt = String(t.task_info?.parameter?.prompt || "").slice(0, 80);
    console.log(`  ${ts}  ${status}  ${t.task_id}  ${ext}  ${url}`);
    if (prompt) console.log(`      "${prompt}..."`);
  }
}

async function balance() {
  // /account/costs is NOT under /v1
  const now = Date.now();
  const ago = now - 90 * 24 * 3600 * 1000;
  const r = await fetch(`${BASE}/account/costs?start_time=${ago}&end_time=${now}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const body = await r.json();
  console.log(`\n=== Resource pack balance ===`);
  for (const pack of (body.data?.resource_pack_subscribe_infos || [])) {
    const exp = new Date(pack.invalid_time).toISOString().slice(0, 10);
    console.log(`  ${pack.resource_pack_name}`);
    console.log(`    remaining=${pack.remaining_quantity} / total=${pack.total_quantity}  type=${pack.resource_pack_type}  expires=${exp}`);
  }
}

const all = has("all");
if (all || has("elements")) await listEnvelope("/v1/general/advanced-custom-elements", "CUSTOM ELEMENTS");
if (all || has("presets"))  await listEnvelope("/v1/general/advanced-presets-elements", "PRESET ELEMENTS", 2, 30);
if (all || has("videos"))   await listVideos(argFlag("mode") || "omni-video");
if (all || has("balance"))  await balance();
if (!all && !has("elements") && !has("presets") && !has("videos") && !has("balance")) {
  console.log("Usage: --elements | --presets | --videos [--mode] | --balance | --all");
  process.exit(1);
}
