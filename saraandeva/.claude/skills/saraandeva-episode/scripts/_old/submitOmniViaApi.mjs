#!/usr/bin/env node
/**
 * Submit a single Kling Omni clip via the official AK/SK API + poll + download.
 * Replaces the /tmp/kling_omni_*.py one-offs from 2026-05-06.
 *
 * Reads element_ids from `content/elements_registry.json` (canonical source).
 * Writes the resulting mp4 to wherever the user specifies.
 *
 * Usage:
 *   node submitOmniViaApi.mjs \
 *     --anchor https://storage.googleapis.com/saraandeva-kling-elements/scenes/<id>.png \
 *     --elements Papa,Sara,Eva \
 *     --prompt-file content/episodes/ep15/prompts/clip12.txt \
 *     --negative-file content/episodes/ep15/prompts/clip12.neg.txt \
 *     --duration 10 \
 *     --mode std \
 *     --aspect-ratio 16:9 \
 *     --external-id ep15-clip12-1 \
 *     --out /tmp/ep15_clip12.mp4
 *
 * Required: --anchor, --elements (comma-separated names from registry), --prompt-file, --out
 * Optional: --negative-file, --duration (default 10), --mode (std|pro|4k, default std),
 *           --aspect-ratio (16:9|9:16|1:1, default 16:9), --external-id (default <basename>-1),
 *           --model (default kling-v3-omni), --timeout-min (default 15),
 *           --sound on (default off; +~33% cost — 6u→8u for 10s std. Required for clips
 *                       with native dialogue lines in the prompt.)
 *
 * Reads:
 *   /Volumes/Samsung500/goreadling-production/.env.local  → KLING_ACCESS_KEY, KLING_SECRET_KEY
 *   <project>/content/elements_registry.json              → name → element_id map
 */
import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const ENV_FILE = "/Volumes/Samsung500/goreadling-production/.env.local";
const REGISTRY_FILE = path.join(PROJECT_ROOT, "content", "elements_registry.json");
const BASE = "https://api-singapore.klingai.com";

// ─── env loader ─────────────────────────────────────────────────────────────
for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z_0-9]*)=["']?(.+?)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const AK = process.env.KLING_ACCESS_KEY, SK = process.env.KLING_SECRET_KEY;
if (!AK || !SK) { console.error("missing KLING_ACCESS_KEY/SECRET_KEY in .env.local"); process.exit(1); }

// ─── args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argFlag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const anchorUrl = argFlag("anchor");
const elementsCsv = argFlag("elements");
const promptFile = argFlag("prompt-file");
const multiPromptFile = argFlag("multi-prompt-file");
const negativeFile = argFlag("negative-file");
const duration = String(argFlag("duration") || "10");
const mode = argFlag("mode") || "std";
const aspectRatio = argFlag("aspect-ratio") || "16:9";
const model = argFlag("model") || "kling-v3-omni";
const externalId = argFlag("external-id");
const outPath = argFlag("out");
const timeoutMin = Number(argFlag("timeout-min") || 15);
const sound = argFlag("sound");  // "on" enables Kling native TTS for prompt dialogue
if (!anchorUrl || !elementsCsv || (!promptFile && !multiPromptFile) || !outPath) {
  console.error(`Usage: submitOmniViaApi.mjs --anchor URL --elements name1,name2,... (--prompt-file path | --multi-prompt-file path) --out path
Optional: --negative-file path --duration 10 --mode std --aspect-ratio 16:9 --external-id name-1 --model kling-v3-omni --timeout-min 15

--multi-prompt-file expects a JSON file: {"summary": "short top-level prompt", "shots": [{"prompt":"<<<element_1>>>...", "duration":3}, ...]}
  (each shot.prompt ≤ 512 chars; sum(durations) must equal --duration)`);
  process.exit(1);
}
if (promptFile && multiPromptFile) {
  console.error("!! cannot use --prompt-file and --multi-prompt-file together");
  process.exit(1);
}

// ─── load elements registry ─────────────────────────────────────────────────
if (!fs.existsSync(REGISTRY_FILE)) {
  console.error(`elements registry missing: ${REGISTRY_FILE}`);
  console.error(`create one with: { "Papa": 310056797721310, "Sara": 310001512573308, ... }`);
  process.exit(1);
}
const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8"));
const elementNames = elementsCsv.split(",").map(s => s.trim()).filter(Boolean);
const elementIds = elementNames.map(n => {
  if (!(n in registry)) {
    console.error(`element "${n}" not in registry. Known: ${Object.keys(registry).join(", ")}`);
    process.exit(1);
  }
  return Number(registry[n]);
});

// ─── load prompt + negative ─────────────────────────────────────────────────
let prompt = "", multiPrompt = null;
if (promptFile) {
  prompt = fs.readFileSync(promptFile, "utf8").trim();
} else {
  const mp = JSON.parse(fs.readFileSync(multiPromptFile, "utf8"));
  if (!mp.summary || !Array.isArray(mp.shots) || mp.shots.length < 1) {
    console.error(`!! multi-prompt file must be {"summary": str, "shots": [{prompt, duration}, ...]}`);
    process.exit(1);
  }
  for (const [i, s] of mp.shots.entries()) {
    if (!s.prompt || typeof s.duration !== "number") {
      console.error(`!! shot ${i + 1}: missing prompt or numeric duration`); process.exit(1);
    }
    if (s.prompt.length > 512) {
      console.error(`!! shot ${i + 1}: prompt is ${s.prompt.length} chars (max 512)`); process.exit(1);
    }
  }
  const totalDur = mp.shots.reduce((a, s) => a + s.duration, 0);
  if (totalDur !== Number(duration)) {
    console.error(`!! sum of shot durations (${totalDur}s) != --duration (${duration}s)`); process.exit(1);
  }
  prompt = mp.summary;
  multiPrompt = mp.shots.map(s => ({ prompt: s.prompt, duration: s.duration }));
}
const negativePrompt = negativeFile ? fs.readFileSync(negativeFile, "utf8").trim() : "";

// ─── JWT (HS256) ────────────────────────────────────────────────────────────
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function token() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify({ iss: AK, exp: now + 1800, nbf: now - 5 }));
  const s = b64url(createHmac("sha256", SK).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}

async function http(method, p, body = null) {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { return { status: r.status, body: { code: -1, raw: text } }; }
  return { status: r.status, body: json };
}

// ─── POST + poll + download ─────────────────────────────────────────────────
const payload = {
  model_name: model,
  prompt,
  negative_prompt: negativePrompt || undefined,
  image_list: [{ image_url: anchorUrl }],
  element_list: elementIds.map(id => ({ element_id: id })),
  duration,
  mode,
  aspect_ratio: aspectRatio,
  external_task_id: externalId || `${path.basename(outPath, ".mp4")}-1`,
  ...(sound ? { sound } : {}),  // "on" → AAC dialogue track + ~33% cost surcharge
};
if (multiPrompt) payload.multi_prompt = multiPrompt;

// Hard 2500-char prompt limit per Kling docs
if (prompt.length > 2500) {
  console.error(`!! prompt is ${prompt.length} chars, exceeds 2500 limit. Trim cast identity locks.`);
  process.exit(1);
}

console.log(`▶ POST /v1/videos/omni-video`);
console.log(`  model=${model} mode=${mode} duration=${duration}s aspect=${aspectRatio}`);
console.log(`  elements: ${elementNames.map((n, i) => `${n}=${elementIds[i]}`).join(", ")}`);
console.log(`  anchor: ${anchorUrl}`);
console.log(`  ext_id: ${payload.external_task_id}`);
if (multiPrompt) {
  console.log(`  multi_prompt: ${multiPrompt.length} shots (${multiPrompt.map(s => s.duration + "s").join(" + ")})`);
}

const submit = await http("POST", "/v1/videos/omni-video", payload);
if (submit.body.code !== 0) {
  console.error(`!! submit failed: HTTP ${submit.status}  ${JSON.stringify(submit.body, null, 2)}`);
  process.exit(1);
}
const taskId = submit.body.data.task_id;
console.log(`>> task_id = ${taskId}`);

console.log(`\n⏳ Polling (timeout ${timeoutMin} min)`);
const deadline = Date.now() + timeoutMin * 60_000;
let last = null;
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 8_000));
  const poll = await http("GET", `/v1/videos/omni-video/${taskId}`);
  const d = poll.body.data || {};
  const s = d.task_status;
  const elapsed = Math.round((timeoutMin * 60_000 - (deadline - Date.now())) / 1_000);
  if (s !== last) { console.log(`  [${String(elapsed).padStart(3, " ")}s] status=${s} ${d.task_status_msg || ""}`); last = s; }
  if (s === "succeed") {
    const video = ((d.task_result || {}).videos || [])[0];
    if (!video?.url) { console.error("succeed but no video url"); process.exit(1); }
    console.log(`\n✓ render done  duration=${video.duration}s  deduction=${d.final_unit_deduction}u`);
    console.log(`  url=${video.url}`);
    // download via Node fetch (CDN URLs are public — no auth needed)
    const r = await fetch(video.url);
    if (!r.ok) { console.error(`download HTTP ${r.status}`); process.exit(1); }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    console.log(`✓ saved → ${outPath}  (${(buf.length / 1024).toFixed(1)} KB)`);
    process.exit(0);
  }
  if (s === "failed") {
    console.error(`!! render failed: ${JSON.stringify(d, null, 2)}`);
    process.exit(1);
  }
}
console.error(`!! polling timeout after ${timeoutMin} min`);
process.exit(1);
