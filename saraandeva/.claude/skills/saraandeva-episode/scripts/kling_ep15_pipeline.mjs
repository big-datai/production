#!/usr/bin/env node
/**
 * ep15 Kling-API pipeline orchestrator.
 *
 * Phases (idempotent — re-run resumes from state):
 *   A: Upload all ep15 PNGs to gs://saraandeva-kling-elements/ep15/
 *   B: Create Kling elements via POST /v1/general/advanced-custom-elements
 *   C: Submit each clip via POST /v1/videos/omni-video
 *   D: Poll + download finished MP4s
 *
 * State file: content/episodes/ep15/_pipeline_state.json
 *
 * Usage:
 *   node kling_ep15_pipeline.mjs upload      # phase A
 *   node kling_ep15_pipeline.mjs elements    # phase B (auto-runs poll)
 *   node kling_ep15_pipeline.mjs submit      # phase C
 *   node kling_ep15_pipeline.mjs download    # phase D
 *   node kling_ep15_pipeline.mjs all         # all phases sequentially
 *   node kling_ep15_pipeline.mjs status      # print state without doing anything
 *   node kling_ep15_pipeline.mjs clip <N>    # submit ONE specific clip (test)
 */
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

// ─── Constants ─────────────────────────────────────────────────────
const PROJECT_ROOT = "/Volumes/Samsung500/goreadling-production";
const SARAANDEVA = `${PROJECT_ROOT}/saraandeva`;
const EP_DIR = `${SARAANDEVA}/content/episodes/ep15`;
const STATE_FILE = `${EP_DIR}/_pipeline_state.json`;
const CLIPS_OUT_DIR = `${EP_DIR}/clips`;
const BUCKET = "saraandeva-kling-elements";
const BUCKET_PREFIX = "ep15";
const API_BASE = "https://api-singapore.klingai.com";
const ENV_FILE = `${PROJECT_ROOT}/.env.local`;

// ─── Env / Auth ────────────────────────────────────────────────────
const envText = readFileSync(ENV_FILE, "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=["']?([^"']+)["']?$/);
  if (m) process.env[m[1]] = m[2];
}
const ACCESS = process.env.KLING_ACCESS_KEY;
const SECRET = process.env.KLING_SECRET_KEY;
if (!ACCESS || !SECRET) { console.error("missing KLING_ACCESS_KEY / KLING_SECRET_KEY"); process.exit(1); }

function b64url(b) { return Buffer.from(b).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function jwt() {
  const now = Math.floor(Date.now()/1000);
  const h = b64url(JSON.stringify({alg:"HS256",typ:"JWT"}));
  const p = b64url(JSON.stringify({iss:ACCESS,exp:now+1800,nbf:now-5}));
  const s = b64url(createHmac("sha256",SECRET).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}
async function api(method, path, body = null) {
  const r = await fetch(API_BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${jwt()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

// ─── State management ─────────────────────────────────────────────
function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { uploads: {}, elements: {}, clipTasks: {}, clipDownloads: {} };
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}
function saveState(s) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// ─── Asset manifest from episode.json ─────────────────────────────
function buildAssetManifest() {
  const ep = JSON.parse(readFileSync(`${EP_DIR}/episode.json`, "utf8"));
  const assets = [];

  // canonical character bound elements (front views)
  const canon = ["Sara", "Eva", "Papa", "Mama", "Joe", "Ginger", "Isabel", "Leo"];
  for (const name of canon) {
    const file = `${SARAANDEVA}/assets/characters/${name.toLowerCase()}_front.png`;
    if (existsSync(file)) {
      assets.push({ name, file, type: "character", elementName: name });
    }
  }

  // new ep15-specific characters
  for (const e of ep.newBoundElements || []) {
    const file = `${PROJECT_ROOT}/${e.asset.startsWith("assets/") ? "saraandeva/" + e.asset : e.asset}`;
    if (existsSync(file)) {
      assets.push({
        name: e.tag,
        file,
        type: "boundElement",
        elementName: e.tag.replace(/[^a-zA-Z0-9_-]/g, "_"),
        description: e.purpose?.slice(0, 200) || "",
      });
    }
  }

  // canonical scenes used in ep15
  const scenes = ["front_house_fall", "front_fence_sidewalk"];
  for (const s of scenes) {
    const file = `${SARAANDEVA}/assets/scenes/${s}.png`;
    if (existsSync(file)) {
      assets.push({ name: s, file, type: "scene", elementName: s });
    }
  }

  // ep15 decorated houses (already covered by newBoundElements)
  // costume previews — used as additional refs for ep15-specific costume locking
  const previews = [
    ["Sara_Halloween_Princess", "scenes/group_ep15_sara_princess_preview.png"],
    ["Eva_Halloween_Pumpkin", "scenes/group_ep15_eva_pumpkin_preview.png"],
    ["Papa_Halloween_Werewolf", "scenes/group_ep15_papa_werewolf_preview.png"],
    ["Mama_Halloween_Cozy", "scenes/group_ep15_mama_cozy_preview.png"],
    ["Joe_Bug_Costume", "scenes/group_ep15_joe_bug_preview.png"],
    ["Ginger_Pumpkin_Cape", "scenes/group_ep15_ginger_pumpkin_cape_preview.png"],
    ["Isabel_Unicorn", "scenes/group_ep15_isabel_unicorn_preview.png"],
    ["Leo_Tiny_Dinosaur", "scenes/group_ep15_leo_dinosaur_preview.png"],
  ];
  for (const [name, rel] of previews) {
    const file = `${SARAANDEVA}/assets/${rel}`;
    if (existsSync(file)) {
      assets.push({ name, file, type: "costume", elementName: name });
    }
  }

  return { ep, assets };
}

// ─── PHASE A: Upload PNGs to GCS ──────────────────────────────────
async function phaseUpload() {
  const state = loadState();
  const { assets } = buildAssetManifest();
  console.log(`Phase A: upload ${assets.length} assets to gs://${BUCKET}/${BUCKET_PREFIX}/`);
  let done = 0, skipped = 0;
  for (const a of assets) {
    const stableName = a.elementName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const gcsKey = `${BUCKET_PREFIX}/${stableName}.png`;
    const httpsUrl = `https://storage.googleapis.com/${BUCKET}/${gcsKey}`;
    if (state.uploads[a.name]?.httpsUrl === httpsUrl && state.uploads[a.name]?.uploadedAt) {
      skipped++;
      continue;
    }
    try {
      execSync(`gsutil -q cp "${a.file}" "gs://${BUCKET}/${gcsKey}"`, { stdio: ["ignore", "ignore", "inherit"] });
      state.uploads[a.name] = { httpsUrl, gcsKey, localFile: a.file, uploadedAt: new Date().toISOString(), type: a.type, description: a.description };
      saveState(state);
      done++;
      console.log(`  ✓ ${a.name} → ${httpsUrl}`);
    } catch (e) {
      console.error(`  ✗ ${a.name}: ${e.message}`);
    }
  }
  console.log(`Phase A done: ${done} uploaded, ${skipped} skipped (cached).`);
}

// ─── PHASE B: Create Kling elements ───────────────────────────────
async function phaseElements() {
  const state = loadState();
  if (!state.uploads || Object.keys(state.uploads).length === 0) {
    console.error("No uploads in state — run upload phase first."); return;
  }
  console.log(`Phase B: create elements from ${Object.keys(state.uploads).length} uploaded assets`);

  // Identify which need creation
  const toCreate = [];
  for (const [name, info] of Object.entries(state.uploads)) {
    if (state.elements[name]?.element_id) continue;
    toCreate.push({ name, ...info });
  }
  console.log(`  ${toCreate.length} elements to create, ${Object.keys(state.uploads).length - toCreate.length} already exist`);

  // Map asset name → safe element_name (≤20 chars, alphanumeric+_-)
  const nameMap = {
    "Sara_Halloween_Princess": "Sara_HW_Princess",
    "Eva_Halloween_Pumpkin": "Eva_HW_Pumpkin",
    "Papa_Halloween_Werewolf": "Papa_HW_Werewolf",
    "Mama_Halloween_Cozy": "Mama_HW_Cozy",
    "Joe_Bug_Costume": "Joe_HW_Bug",
    "Ginger_Pumpkin_Cape": "Ginger_HW_Cape",
    "Isabel_Unicorn": "Isabel_HW_Uni",
    "Leo_Tiny_Dinosaur": "Leo_HW_Dino",
    "ep15-house1-witch-cauldron": "ep15_h1_witch",
    "ep15-house2-pirate-ship": "ep15_h2_pirate",
    "ep15-house3-skeleton-lawn": "ep15_h3_skel",
    "ep15-house4-isabel-cottage": "ep15_h4_cottage",
    "ep15-house5-candy-house": "ep15_h5_candy",
    "ep15-clip13-group-still": "ep15_c13_group",
    "ep15-clip17-group-still": "ep15_c17_group",
    "front_house_fall": "front_house_fall",
    "front_fence_sidewalk": "front_fence_sw",
    "Mrs. Patel": "Mrs_Patel",
  };
  for (const a of toCreate) {
    const safeName = (nameMap[a.name] || a.name).slice(0, 20);
    const externalId = `ep15-${safeName.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}`;
    const desc = (a.description || `${a.name} bound element for ep15`).slice(0, 99);
    const body = {
      external_task_id: externalId,
      element_name: safeName,
      element_description: desc,
      reference_type: "image_refer",
      element_image_list: {
        frontal_image: a.httpsUrl,
        refer_images: [
          { image_url: a.httpsUrl },
          { image_url: a.httpsUrl },
        ],
      },
    };
    console.log(`\n  → POST element create: ${a.name}`);
    const { status, json } = await api("POST", "/v1/general/advanced-custom-elements", body);
    if (json?.code !== 0) {
      console.error(`    ✗ failed: status=${status} code=${json?.code} msg="${(json?.message||"").slice(0,200)}"`);
      continue;
    }
    const taskId = json.data?.task_id;
    state.elements[a.name] = {
      task_id: taskId,
      external_task_id: externalId,
      submitted_at: new Date().toISOString(),
      status: "submitted",
    };
    saveState(state);
    console.log(`    ✓ submitted, task_id=${taskId}`);
  }

  // Poll for completion
  console.log(`\nPhase B: polling for element-creation completion...`);
  const pending = Object.entries(state.elements).filter(([, e]) => !e.element_id);
  if (pending.length === 0) { console.log("  all elements already complete."); return; }

  let pollAttempt = 0;
  while (pollAttempt < 30) {
    pollAttempt++;
    await sleep(10000);  // 10s between polls
    const { status, json } = await api("GET", `/v1/general/advanced-custom-elements?pageNum=1&pageSize=50`);
    if (json?.code !== 0) { console.error(`  poll fail: ${json?.message}`); continue; }
    const tasks = json.data || [];
    let stillPending = 0;
    for (const [name, info] of Object.entries(state.elements)) {
      if (info.element_id) continue;
      const t = tasks.find(x => x.task_id === info.task_id);
      if (!t) { stillPending++; continue; }
      if (t.task_status === "succeed") {
        const el = t.task_result?.elements?.[0];
        if (el?.element_id) {
          state.elements[name].element_id = el.element_id;
          state.elements[name].status = "succeed";
          state.elements[name].completed_at = new Date().toISOString();
          saveState(state);
          console.log(`  ✓ ${name} → element_id=${el.element_id}`);
        }
      } else if (t.task_status === "failed") {
        state.elements[name].status = "failed";
        state.elements[name].failure_reason = t.task_status_msg;
        saveState(state);
        console.error(`  ✗ ${name} FAILED: ${t.task_status_msg}`);
      } else {
        stillPending++;
      }
    }
    if (stillPending === 0) { console.log("Phase B done — all elements created."); return; }
    console.log(`  waiting (${stillPending} still pending, attempt ${pollAttempt})`);
  }
  console.log("Phase B timed out polling — re-run to continue.");
}

// Count in-flight (submitted+rendering) clips on Kling side
async function countInFlightClips() {
  const { json } = await api("GET", "/v1/videos/omni-video?pageNum=1&pageSize=20");
  if (json?.code !== 0) return 0;
  return (json.data || []).filter(t => t.task_status === "submitted" || t.task_status === "processing").length;
}

// Per-character image manifest — each char gets multi-angle refs + costume
// (assumes the named PNGs are already at https://storage.googleapis.com/<BUCKET>/<BUCKET_PREFIX>/<name>.png)
const BUCKET_HTTPS = `https://storage.googleapis.com/${BUCKET}/${BUCKET_PREFIX}`;
const CHARACTER_MANIFEST = {
  "Sara":       { front: "Sara.png",        refs: ["sara_3q.png", "sara_profile.png", "Sara_Halloween_Princess.png"] },
  "Eva":        { front: "Eva.png",         refs: ["eva_3q.png", "eva_profile.png", "Eva_Halloween_Pumpkin.png"] },
  "Papa":       { front: "Papa.png",        refs: ["papa_3q.png", "papa_profile.png", "Papa_Halloween_Werewolf.png"] },
  "Mama":       { front: "Mama.png",        refs: ["mama_3q.png", "mama_profile.png", "Mama_Halloween_Cozy.png"] },
  "Joe":        { front: "Joe.png",         refs: ["joe_3q.png", "joe_profile.png", "Joe_Bug_Costume.png"] },
  "Ginger":     { front: "Ginger.png",      refs: ["ginger_3q.png", "ginger_profile.png", "Ginger_Pumpkin_Cape.png"] },
  "Isabel":     { front: "Isabel.png",      refs: ["Isabel_Unicorn.png"] },           // 3q/profile not yet uploaded
  "Leo":        { front: "Leo.png",         refs: ["Leo_Tiny_Dinosaur.png"] },         // 3q/profile not yet uploaded
  "Lisa":       { front: "Lisa.png",        refs: [] },                                 // need 3q/profile gen
  "Mrs. Patel": { front: "Mrs__Patel.png",  refs: [] },                                 // need 3q/profile gen
};

// Scene manifest — these go in image_urls (style refs)
const SCENE_MANIFEST = {
  "front_house_fall":           "front_house_fall.png",
  "front_fence_sidewalk":       "front_fence_sidewalk.png",
  "ep15-house1-witch-cauldron": "ep15-house1-witch-cauldron.png",
  "ep15-house2-pirate-ship":    "ep15-house2-pirate-ship.png",
  "ep15-house3-skeleton-lawn":  "ep15-house3-skeleton-lawn.png",
  "ep15-house4-isabel-cottage": "ep15-house4-isabel-cottage.png",
  "ep15-house5-candy-house":    "ep15-house5-candy-house.png",
  "ep15-clip13-group-still":    "ep15-clip13-group-still.png",
  "ep15-clip17-group-still":    "ep15-clip17-group-still.png",
};

// Translate @CharName references in a prompt → @ElementN by index
function translatePromptToElementSyntax(prompt, charOrder) {
  // Per Kling Omni v3 docs (lesson_kling_omni_api_schema.md): element references
  // in the prompt MUST be `<<<element_N>>>` (triple angle brackets), NOT `@ElementN`.
  let out = prompt;
  const sorted = [...charOrder].sort((a, b) => b.length - a.length);
  for (let i = 0; i < sorted.length; i++) {
    const name = sorted[i];
    const idx = charOrder.indexOf(name) + 1;  // 1-based
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`@${escaped}(?=[\\s.,;:'"!?\\)])`, "g"), `<<<element_${idx}>>>`);
    out = out.replace(new RegExp(`@${escaped}'s\\b`, "g"), `<<<element_${idx}>>>'s`);
  }
  return out;
}

// Load the persistent registry once. Maps spec subject names ("Sara") to the
// pre-created Halloween-costumed element_id ("ep15_Sara" → 310094133206523).
let _registry = null;
function getRegistry() {
  if (!_registry) {
    _registry = JSON.parse(readFileSync(`${SARAANDEVA}/content/elements_registry.json`, "utf8"));
  }
  return _registry;
}
function resolveElementId(subjectName) {
  const reg = getRegistry();
  // Prefer ep15_<Name> (Halloween-costumed) over the generic <Name> entry.
  return reg[`ep15_${subjectName}`] ?? reg[subjectName] ?? null;
}

// ─── PHASE C: Submit Omni clips ───────────────────────────────────
async function phaseSubmit(specificClip = null) {
  const state = loadState();
  console.log(`Phase C: submit clips with INLINE elements (corrected API schema).`);

  const clipFiles = readdirSync(EP_DIR)
    .filter(f => /^\d+\.json$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b));

  const PARALLEL_LIMIT = 4;  // leave headroom under Kling's 5-concurrent cap

  for (const fname of clipFiles) {
    const n = parseInt(fname);
    if (specificClip !== null && n !== specificClip) continue;
    const clipKey = `clip_${n}`;
    if (state.clipTasks[clipKey]?.task_id && !specificClip) {
      console.log(`  ⏭️  ${clipKey} already submitted (task=${state.clipTasks[clipKey].task_id})`);
      continue;
    }
    // Reset submit_failed entries so they can retry
    if (state.clipTasks[clipKey]?.status === "submit_failed") {
      delete state.clipTasks[clipKey];
      saveState(state);
    }
    // Wait if too many in-flight tasks
    while (true) {
      const inFlight = await countInFlightClips();
      if (inFlight < PARALLEL_LIMIT) break;
      console.log(`  ⏳ ${inFlight} in-flight (cap=${PARALLEL_LIMIT}), waiting 30s...`);
      await sleep(30000);
    }
    const clip = JSON.parse(readFileSync(`${EP_DIR}/${fname}`, "utf8"));

    // ─── Build element_list with PRE-CREATED element_id (correct schema per
    // lesson_kling_omni_api_schema.md). Resolves "Sara" → ep15_Sara element_id
    // (Halloween-costumed). Order in subjects = position in element_list = index
    // for <<<element_N>>> in the prompt.
    const elementList = [];
    const elementOrder = [];
    const seen = new Set();
    for (const charName of clip.subjects || []) {
      if (seen.has(charName)) continue;
      const eid = resolveElementId(charName);
      if (!eid) { console.warn(`    ⚠ no element_id in registry for "${charName}" (ep15_${charName} or ${charName}), skipping`); continue; }
      seen.add(charName);
      elementOrder.push(charName);
      elementList.push({ element_id: eid });
    }

    // Scene + Pattern E group still go in image_list (per Kling Omni v3 spec).
    const imageUrls = [];
    if (clip.scene) {
      const scenePng = SCENE_MANIFEST[clip.scene];
      if (scenePng) imageUrls.push(`${BUCKET_HTTPS}/${scenePng}`);
    }
    if (clip.patternEStill) {
      // Map ep15-clip13-group-still / ep15-clip17-group-still to their PNGs
      const stillKey = clip.patternEStill.includes("clip13") ? "ep15-clip13-group-still"
                     : clip.patternEStill.includes("clip17") ? "ep15-clip17-group-still" : null;
      if (stillKey && SCENE_MANIFEST[stillKey]) imageUrls.push(`${BUCKET_HTTPS}/${SCENE_MANIFEST[stillKey]}`);
    }

    if (elementList.length === 0) {
      console.error(`  ✗ ${clipKey} no resolvable characters (subjects=${JSON.stringify(clip.subjects)})`);
      continue;
    }

    // Translate @CharName references → <<<element_N>>> per Kling Omni v3 spec.
    const translatedPrompt = translatePromptToElementSyntax(clip.prompt, elementOrder);

    const externalId = `ep15-clip${n}-${Date.now()}`;
    // Continuity-lock: if clip N-1's last frame is uploaded, prepend it to image_list
    const prevKey = `clip_${n-1}`;
    const startImage = state.lastFrames?.[prevKey]?.httpsUrl;
    const imageList = [
      ...(startImage ? [{ image_url: startImage }] : []),
      ...imageUrls.map(u => ({ image_url: u })),
    ];

    const body = {
      external_task_id: externalId,
      model_name: "kling-v3-omni",
      mode: clip.quality === "1080p" ? "pro" : "std",
      duration: String(clip.durationSec || 10),  // string per Kling spec
      aspect_ratio: "16:9",
      prompt: translatedPrompt,
      negative_prompt: clip.negativePrompt || "",
      element_list: elementList,                  // ← canonical field name
      ...(imageList.length > 0 ? { image_list: imageList } : {}),
      ...(clip.nativeAudio ? { sound: "on" } : {}),  // dialogue lines need this
    };
    if (startImage) console.log(`    🎬 continuity from ${prevKey}`);
    console.log(`\n  → POST clip ${n} (element_list=${elementList.length} [${elementOrder.join(",")}], image_list=${imageList.length}, dur=${body.duration}s, sound=${body.sound || "off"})`);
    const { status, json } = await api("POST", "/v1/videos/omni-video", body);
    if (json?.code !== 0) {
      console.error(`    ✗ failed: status=${status} code=${json?.code} msg="${(json?.message||"").slice(0,200)}"`);
      console.error(`    body sent: ${JSON.stringify(body).slice(0, 400)}`);
      state.clipTasks[clipKey] = { error: json?.message, status: "submit_failed", attempted_at: new Date().toISOString() };
      saveState(state);
      continue;
    }
    state.clipTasks[clipKey] = {
      task_id: json.data?.task_id,
      external_task_id: externalId,
      submitted_at: new Date().toISOString(),
      status: "submitted",
      element_order: elementOrder,
      image_urls: imageUrls,
    };
    saveState(state);
    console.log(`    ✓ submitted, task_id=${json.data?.task_id}`);

    if (specificClip) break;
  }
}

// ─── PHASE D: Poll + Download ─────────────────────────────────────
async function phaseDownload() {
  const state = loadState();
  mkdirSync(CLIPS_OUT_DIR, { recursive: true });
  console.log(`Phase D: poll + download`);

  let pollAttempt = 0;
  while (pollAttempt < 60) {
    pollAttempt++;
    const { json } = await api("GET", `/v1/videos/omni-video?pageNum=1&pageSize=50`);
    if (json?.code !== 0) { console.error(`  poll fail`); await sleep(10000); continue; }
    const tasks = json.data || [];
    let pending = 0, downloaded = 0;
    for (const [clipKey, info] of Object.entries(state.clipTasks)) {
      if (state.clipDownloads[clipKey]?.localPath) { downloaded++; continue; }
      if (!info.task_id) continue;
      const t = tasks.find(x => x.task_id === info.task_id);
      if (!t) { pending++; continue; }
      if (t.task_status === "succeed") {
        const url = t.task_result?.videos?.[0]?.url;
        if (!url) { console.warn(`  ${clipKey} succeed but no url`); continue; }
        const out = `${CLIPS_OUT_DIR}/${clipKey}.mp4`;
        try {
          execSync(`curl -sL "${url}" -o "${out}"`, { stdio: ["ignore", "ignore", "inherit"] });
          state.clipDownloads[clipKey] = { localPath: out, downloadedAt: new Date().toISOString(), sourceUrl: url };
          saveState(state);
          console.log(`  ✓ downloaded ${clipKey} → ${out}`);
        } catch (e) { console.error(`  ✗ download fail ${clipKey}: ${e.message}`); }
      } else if (t.task_status === "failed") {
        if (info.status !== "failed") {
          state.clipTasks[clipKey].status = "failed";
          state.clipTasks[clipKey].failure_reason = t.task_status_msg;
          saveState(state);
          console.error(`  ✗ ${clipKey} FAILED: ${t.task_status_msg}`);
        }
      } else {
        pending++;
      }
    }
    if (pending === 0) { console.log("Phase D done."); return; }
    console.log(`  waiting (${pending} still rendering, attempt ${pollAttempt})`);
    await sleep(20000);
  }
  console.log("Phase D timed out — re-run to continue.");
}

// ─── Last-frame extract + upload (continuity helper) ─────────────
async function phaseExtractLastFrames() {
  const state = loadState();
  state.lastFrames = state.lastFrames || {};
  const clips = readdirSync(CLIPS_OUT_DIR).filter(f => /^clip_\d+\.mp4$/.test(f)).sort();
  console.log(`Phase E (last-frame extract): processing ${clips.length} clips`);
  for (const fname of clips) {
    const n = parseInt(fname.match(/clip_(\d+)/)[1]);
    const clipKey = `clip_${n}`;
    if (state.lastFrames[clipKey]?.httpsUrl) { console.log(`  ⏭️  ${clipKey} already extracted`); continue; }
    const mp4 = `${CLIPS_OUT_DIR}/${fname}`;
    const lastFramePng = `${CLIPS_OUT_DIR}/${clipKey}_last.png`;
    try {
      execSync(`ffmpeg -hide_banner -loglevel error -sseof -0.1 -i "${mp4}" -update 1 -vframes 1 -y "${lastFramePng}"`, { stdio: ["ignore", "ignore", "inherit"] });
      // Upload to GCS
      const gcsKey = `${BUCKET_PREFIX}/lastframes/${clipKey}_last.png`;
      const httpsUrl = `https://storage.googleapis.com/${BUCKET}/${gcsKey}`;
      execSync(`gsutil -q cp "${lastFramePng}" "gs://${BUCKET}/${gcsKey}"`, { stdio: ["ignore", "ignore", "inherit"] });
      state.lastFrames[clipKey] = { localPath: lastFramePng, gcsKey, httpsUrl, extractedAt: new Date().toISOString() };
      saveState(state);
      console.log(`  ✓ ${clipKey} → ${httpsUrl}`);
    } catch (e) { console.error(`  ✗ ${clipKey}: ${e.message}`); }
  }
}

// ─── Status ───────────────────────────────────────────────────────
function phaseStatus() {
  const state = loadState();
  const u = Object.keys(state.uploads).length;
  const e = Object.values(state.elements).filter(x => x.element_id).length;
  const eP = Object.values(state.elements).filter(x => !x.element_id).length;
  const c = Object.values(state.clipTasks).filter(x => x.task_id).length;
  const cD = Object.keys(state.clipDownloads).length;
  console.log(`Pipeline state:`);
  console.log(`  Uploads:  ${u} done`);
  console.log(`  Elements: ${e} ready, ${eP} pending`);
  console.log(`  Clips:    ${c} submitted, ${cD} downloaded`);
  // Print failed elements
  for (const [n, info] of Object.entries(state.elements)) {
    if (info.status === "failed") console.log(`  ⚠ element ${n} FAILED: ${info.failure_reason}`);
  }
  for (const [k, info] of Object.entries(state.clipTasks)) {
    if (info.status === "failed" || info.status === "submit_failed") {
      console.log(`  ⚠ ${k} ${info.status}: ${info.failure_reason || info.error}`);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ─────────────────────────────────────────────────────────
const phase = process.argv[2];
const arg2 = process.argv[3];
if (!phase) {
  console.log("Usage: kling_ep15_pipeline.mjs <upload|elements|submit|download|status|all|clip <N>>");
  process.exit(1);
}
if (phase === "upload") await phaseUpload();
else if (phase === "elements") await phaseElements();
else if (phase === "submit") await phaseSubmit();
else if (phase === "download") await phaseDownload();
else if (phase === "status") phaseStatus();
else if (phase === "clip") await phaseSubmit(parseInt(arg2));
else if (phase === "extract") await phaseExtractLastFrames();
else if (phase === "all") {
  await phaseUpload();
  await phaseElements();
  await phaseSubmit();
  await phaseDownload();
  await phaseExtractLastFrames();
} else {
  console.error(`Unknown phase: ${phase}`); process.exit(1);
}
