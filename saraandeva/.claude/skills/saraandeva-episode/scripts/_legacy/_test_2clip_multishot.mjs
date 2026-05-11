#!/usr/bin/env node
/**
 * 2-clip multi-shot continuity test.
 *
 * Clip 1 (10s): costume reveal in front yard — 3 shots, different camera angles
 * Clip 2 (10s): Ginger BOLTS — 3 shots, ANCHORED on clip 1's last frame for continuity
 *
 * Validates:
 *   - multi_prompt schema (3 sequential shots in one render)
 *   - Different camera angles per shot
 *   - Last-frame → next-anchor continuity chain
 *   - Identity locking with 5 chars + multi-shot (vs failure at single-prompt 5-char)
 */
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const env = readFileSync("/Volumes/Samsung500/goreadling-production/.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_]+)=["']?([^"']+)["']?$/); if (m) process.env[m[1]] = m[2]; }
const A = process.env.KLING_ACCESS_KEY, S = process.env.KLING_SECRET_KEY;
const b64 = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function jwt() {
  const n = Math.floor(Date.now()/1000);
  const h = b64(JSON.stringify({alg:"HS256",typ:"JWT"}));
  const p = b64(JSON.stringify({iss:A,exp:n+1800,nbf:n-5}));
  const s = b64(createHmac("sha256",S).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}
async function api(method, path, body=null) {
  const r = await fetch("https://api-singapore.klingai.com" + path, {
    method, headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  return { status: r.status, json: await r.json() };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BUCKET = "https://storage.googleapis.com/saraandeva-kling-elements/ep15";
const REGISTRY = JSON.parse(readFileSync("/Volumes/Samsung500/goreadling-production/saraandeva/content/elements_registry.json", "utf8"));
const OUT_DIR = "/Volumes/Samsung500/goreadling-production/saraandeva/content/episodes/ep15/clips";
mkdirSync(OUT_DIR, { recursive: true });

// Element order = the @<<<element_N>>> mapping. Position 1 = Sara, 2 = Eva, 3 = Mama, 4 = Joe, 5 = Ginger.
const ELEMENT_NAMES = ["ep15_Sara", "ep15_Eva", "ep15_Mama", "ep15_Joe", "ep15_Ginger"];
const ELEMENT_LIST = ELEMENT_NAMES.map(n => ({ element_id: REGISTRY[n] }));
console.log(`Elements: ${ELEMENT_NAMES.map((n,i)=>`<<<element_${i+1}>>>=${n} (id=${REGISTRY[n]})`).join("\n          ")}`);

async function submitAndWait(payload, label) {
  console.log(`\n📤 [${label}] POST omni-video...`);
  const sub = await api("POST", "/v1/videos/omni-video", payload);
  if (sub.json.code !== 0) {
    console.error(`!! [${label}] submit fail:`, JSON.stringify(sub.json, null, 2).slice(0, 800));
    process.exit(1);
  }
  const taskId = sub.json.data.task_id;
  console.log(`   task_id=${taskId}, polling...`);
  let last = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(8000);
    const p = await api("GET", `/v1/videos/omni-video/${taskId}`);
    const s = p.json.data?.task_status;
    if (s !== last) { console.log(`   [${attempt*8}s] ${s} ${p.json.data?.task_status_msg || ""}`); last = s; }
    if (s === "succeed") {
      const v = p.json.data.task_result.videos[0];
      console.log(`   ✓ done ${v.duration}s, ${p.json.data.final_unit_deduction}u`);
      return v.url;
    }
    if (s === "failed") { console.error(`   ✗ failed: ${p.json.data.task_status_msg}`); process.exit(1); }
  }
  console.error("timeout"); process.exit(1);
}

async function downloadVideo(url, outPath) {
  const buf = await (await fetch(url)).arrayBuffer();
  writeFileSync(outPath, Buffer.from(buf));
  console.log(`   📥 saved → ${outPath} (${(buf.byteLength/1024/1024).toFixed(1)} MB)`);
  return outPath;
}

async function extractAndUploadLastFrame(mp4Path, gcsKey) {
  const localPng = mp4Path.replace(".mp4", "_last.png");
  execSync(`ffmpeg -hide_banner -loglevel error -sseof -0.1 -i "${mp4Path}" -update 1 -vframes 1 -y "${localPng}"`);
  execSync(`gsutil -q cp "${localPng}" "gs://saraandeva-kling-elements/ep15/${gcsKey}"`);
  const httpsUrl = `${BUCKET}/${gcsKey}`;
  console.log(`   📸 last frame → ${httpsUrl}`);
  return httpsUrl;
}

// ─── CLIP 1: costume reveal — 3-shot multi-shot ──────────────────────────
const CLIP1_PROMPT = [
  "Wide medium dolly-push, eye-level. Autumn front porch at dusk. <<<element_1>>> in pink fairy tutu, silver tiara, magic-wand. <<<element_2>>> in orange pumpkin onesie + green stem-hat, candy bucket. <<<element_3>>> in pumpkin-beanie + rust sweater, hand on Eva's shoulder. <<<element_4>>> Pomeranian at Eva's foot. <<<element_5>>> Jack Russell at Sara's foot, tail wagging. Pixar 3D, soft golden-hour porch light.",

  "Closer medium-close, slow tilt-down. Frame tightens on <<<element_2>>>'s smile in pumpkin onesie at center; <<<element_1>>> on her left lifts wand and giggles; <<<element_3>>> smiles behind. Background autumn leaves softly bokeh. Costumes clearly visible. Soft warm glow. Pixar.",

  "Low-angle close-up, static. <<<element_4>>> cream-and-gold Pomeranian and <<<element_5>>> white-and-tan Jack Russell sit side by side at porch step, both looking up at camera with relaxed open-mouth smiles. Autumn leaves around paws. Pixar.",
];
const CLIP1_DURATIONS = [3, 4, 3];

const clip1Body = {
  model_name: "kling-v3-omni",
  mode: "std",
  aspect_ratio: "16:9",
  duration: 10,
  external_task_id: `ep15-multi-clip1-${Date.now()}`,
  prompt: "Costume reveal. Family in Halloween costumes on autumn front porch at warm dusk. Multi-shot composition.",
  multi_prompt: CLIP1_PROMPT.map((p, i) => ({ prompt: p, duration: CLIP1_DURATIONS[i] })),
  negative_prompt: "duplicate character, twin, ghost figure, dark skin on Eva, brown skin on Eva, brunette Eva, generic family, off-model, scary face, motion blur, mama with dark hair, sara with ponytail",
  image_list: [{ image_url: `${BUCKET}/front_house_fall.png` }],
  element_list: ELEMENT_LIST,
};

const clip1Url = await submitAndWait(clip1Body, "CLIP 1 multi-shot (3 angles)");
const clip1Mp4 = `${OUT_DIR}/multi_clip_1.mp4`;
await downloadVideo(clip1Url, clip1Mp4);
const clip1LastFrameUrl = await extractAndUploadLastFrame(clip1Mp4, "clip1_lastframe.png");

// ─── CLIP 2: Ginger BOLTS — 3-shot, anchored on clip 1 last frame ────────
const CLIP2_PROMPT = [
  "Wide shot matching the previous frame composition — family in costumes on the autumn front porch. <<<element_1>>> hand on doorknob lifts. The wind catches a giant inflatable smiling jack-o-lantern decoration on the porch — it billows softly. Camera holds steady. Soft warm porch light.",

  "Tight close-up on <<<element_5>>> the Jack Russell with white body and tan markings. Her ears flatten back, eyes widen. She steps backward two paces away from the inflatable decoration. <<<element_2>>> in pumpkin onesie reflexively tightens her grip on a leash with both hands. Camera locked tight on Ginger's reaction face.",

  "Wider follow shot, camera whips right to track motion. <<<element_5>>> the Jack Russell darts forward past the family's feet down the leafy sidewalk. <<<element_4>>> the Pomeranian on the leash held by <<<element_2>>> stays planted on the porch. <<<element_3>>> in beanie and <<<element_1>>> in tiara look down the sidewalk in surprise. Autumn leaves swirl. Comic timing, not scary.",
];
const CLIP2_DURATIONS = [3, 4, 3];

const clip2Body = {
  model_name: "kling-v3-omni",
  mode: "std",
  aspect_ratio: "16:9",
  duration: 10,
  external_task_id: `ep15-multi-clip2-${Date.now()}`,
  prompt: "Ginger spooks at the porch decoration and bolts down the sidewalk. Multi-shot, continuity from previous.",
  multi_prompt: CLIP2_PROMPT.map((p, i) => ({ prompt: p, duration: CLIP2_DURATIONS[i] })),
  negative_prompt: "duplicate character, twin, ghost figure, dark skin on Eva, brunette Eva, generic family, off-model, scary face, ginger looks like a different breed, brown ginger only, panicking, panicked face, horror",
  image_list: [{ image_url: clip1LastFrameUrl }],
  element_list: ELEMENT_LIST,
};

const clip2Url = await submitAndWait(clip2Body, "CLIP 2 multi-shot (continuity)");
const clip2Mp4 = `${OUT_DIR}/multi_clip_2.mp4`;
await downloadVideo(clip2Url, clip2Mp4);

console.log(`\n🎬 BOTH CLIPS DONE`);
console.log(`   clip 1: ${clip1Mp4}`);
console.log(`   clip 2: ${clip2Mp4} (anchored on clip 1 last frame)`);
console.log(`\nCost: ~$1.20 (2× 10s std clips)`);
