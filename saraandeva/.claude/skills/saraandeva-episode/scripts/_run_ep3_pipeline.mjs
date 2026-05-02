/**
 * Sequential ep03 pipeline — robust against "still rendering" false-positive downloads.
 *
 * Per clip:
 *   1. Apply scene-name fixes to the JSON spec
 *   2. SNAPSHOT existing MP4s in OUT (sha256 set) — these are "known"
 *   3. Submit (skipSubmit:true ⇒ already submitted, jump to wait)
 *   4. Wait MIN_WAIT (180s for 10s clips, 240s for 15s clips)
 *   5. POLL every 30s up to MAX_WAIT (600s):
 *      a. Download topmost from materials page → scratch dir
 *      b. Hash the downloaded MP4
 *      c. If hash IS in known set → still rendering (Kling served the old top tile)
 *         → discard, sleep, retry
 *      d. Else → it's a NEW render → break
 *   6. Validate: duration within 1.5s of spec, size > 1 MB
 *   7. Rename → OUT/<clip>.mp4
 *
 * Don't touch the Kling Chrome tab while this runs.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";

const SCRIPTS = "/Volumes/Samsung500/goreadling-production/saraandeva/.claude/worktrees/naughty-babbage-67f9c1/saraandeva/.claude/skills/saraandeva-episode/scripts";
const SPECS   = "/Volumes/Samsung500/goreadling-production/saraandeva/.claude/worktrees/naughty-babbage-67f9c1/saraandeva/content/episodes/ep03";
const OUT     = "/Volumes/Samsung500/goreadling-production/saraandeva/season_01/episode_03";

const SCENE_FIXES = {
  "livingroom": "living-room",
  "bedroom-sisters": "kids-bedroom",
};

// Pipeline state. skipSubmit:true means "already submitted to Kling — just wait+download".
const PIPELINE = [
  { name: "clip_02a", skipSubmit: true },
  { name: "clip_03a" },
  { name: "clip_03b" },
  { name: "clip_03c" },
  { name: "clip_03d" },
  { name: "clip_03e" },
  { name: "clip_03f" },
  { name: "clip_04a" },
  { name: "clip_04b" },
  { name: "clip_04c" },
  { name: "clip_05a" },
  { name: "clip_06a" },
  { name: "clip_06b" },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 19);

function sha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function existingHashes() {
  const out = new Set();
  for (const f of fs.readdirSync(OUT)) {
    if (!f.endsWith(".mp4")) continue;
    out.add(sha256(path.join(OUT, f)));
  }
  return out;
}

function fixScene(specPath) {
  const d = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const mods = [];
  if (SCENE_FIXES[d.scene]) { mods.push(`scene:${d.scene}→${SCENE_FIXES[d.scene]}`); d.scene = SCENE_FIXES[d.scene]; }
  for (const el of d.boundElements || []) {
    if (SCENE_FIXES[el.tag]) { mods.push(`bind:${el.tag}→${SCENE_FIXES[el.tag]}`); el.tag = SCENE_FIXES[el.tag]; }
  }
  for (const [bad, good] of Object.entries(SCENE_FIXES)) {
    if (d.prompt.includes(`@${bad}`)) {
      d.prompt = d.prompt.split(`@${bad}`).join(`@${good}`);
      mods.push(`prompt:@${bad}→@${good}`);
    }
  }
  if (mods.length) fs.writeFileSync(specPath, JSON.stringify(d, null, 2) + "\n");
  return mods;
}

function run(cmd, args, label) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("close", code => code === 0 ? resolve() : reject(new Error(`${label || cmd} exited ${code}`)));
  });
}

async function downloadTopmostToScratch() {
  const scratch = fs.mkdtempSync(path.join(OUT, "_pipe_dl_"));
  await run("node", [path.join(SCRIPTS, "_grab_latest_omni.mjs"), scratch], "download");
  const mp4s = fs.readdirSync(scratch).filter(f => f.endsWith(".mp4"));
  if (!mp4s.length) {
    fs.rmSync(scratch, { recursive: true, force: true });
    throw new Error("download produced no MP4");
  }
  return { dir: scratch, file: path.join(scratch, mp4s[0]) };
}

// Peek the materials page for "Generating..." text. Returns "generating", "ready", or "empty".
function peekState() {
  const result = execFileSync("node", [path.join(SCRIPTS, "_peek_top_state.mjs")]).toString().trim();
  return result;
}

async function waitForNewRender(spec, knownHashes) {
  // Min wait per user: 5 min for 10s clips, 6 min for 15s clips.
  const minWaitSec = spec.durationSec === 15 ? 360 : 300;
  const maxWaitSec = 900; // 15 min hard ceiling
  console.log(`  [wait] ${minWaitSec}s minimum (render usually 3-5 min, padded to 5+)`);
  await sleep(minWaitSec * 1000);

  const deadline = Date.now() + (maxWaitSec - minWaitSec) * 1000;
  let pollNum = 0;
  while (Date.now() < deadline) {
    pollNum++;
    // STEP 1: peek before downloading — refuse to download while ANY "Generating..." text is on page
    let state;
    try { state = peekState(); }
    catch (e) { console.log(`  ⚠ peek failed: ${e.message.slice(0,80)}`); await sleep(30_000); continue; }
    if (state === "generating") {
      console.log(`  [poll #${pollNum}] state=generating — render still running, sleeping 30s`);
      await sleep(30_000);
      continue;
    }
    if (state !== "ready") {
      console.log(`  [poll #${pollNum}] state=${state} — unexpected; sleeping 30s`);
      await sleep(30_000);
      continue;
    }
    // STEP 2: state=ready — safe to download
    console.log(`  [poll #${pollNum}] state=ready — downloading topmost...`);
    let dl;
    try { dl = await downloadTopmostToScratch(); }
    catch (e) { console.log(`  ⚠ download failed: ${e.message.slice(0,80)}`); await sleep(30_000); continue; }

    // STEP 3: hash check as second-line safeguard against duplicates
    const hash = sha256(dl.file);
    if (knownHashes.has(hash)) {
      console.log(`  ↩ downloaded hash matches existing clip — sleeping 30s and retrying`);
      fs.rmSync(dl.dir, { recursive: true, force: true });
      await sleep(30_000);
      continue;
    }
    console.log(`  ✓ NEW clip captured (hash ${hash.slice(0,8)})`);
    return dl;
  }
  return null;
}

(async () => {
  console.log(`\n${"═".repeat(60)}\n  EP3 PIPELINE START @ ${ts()}\n${"═".repeat(60)}`);
  console.log(`  OUT: ${OUT}`);

  for (const stage of PIPELINE) {
    const { name, skipSubmit } = stage;
    const specPath  = path.join(SPECS, `${name}.json`);
    const finalPath = path.join(OUT,  `${name}.mp4`);

    console.log(`\n${"─".repeat(60)}\n  ${name}  @  ${ts()}\n${"─".repeat(60)}`);

    if (fs.existsSync(finalPath)) {
      console.log(`  ⏭ ${path.basename(finalPath)} already exists — skipping`);
      continue;
    }

    // 1. Scene fixes
    const mods = fixScene(specPath);
    if (mods.length) console.log(`  [fix] ${mods.join("  ")}`);

    const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

    // 2. Snapshot existing hashes BEFORE submit
    const knownHashes = existingHashes();
    console.log(`  [snapshot] ${knownHashes.size} known MP4 hashes`);

    // 3. Submit (or skip if already submitted)
    if (!skipSubmit) {
      console.log(`  [submit] ${name} — ${spec.durationSec}s, ${spec.expectedCredits}cr, bind=[${spec.boundElements.map(b => b.tag).join(", ")}]`);
      try { await run("node", [path.join(SCRIPTS, "submitOmniClip.mjs"), specPath], "submit"); }
      catch (e) { console.error(`  ❌ submit failed: ${e.message}`); process.exit(1); }
    } else {
      console.log(`  [submit] ⏭ skipSubmit:true — already submitted, just wait+download`);
    }

    // 4. Wait + 5. Poll
    const dl = await waitForNewRender(spec, knownHashes);
    if (!dl) { console.error(`  ❌ ${name}: timed out waiting for new render`); process.exit(1); }

    // 6. Validate
    const probed = parseFloat(execFileSync("ffprobe", [
      "-v","error","-show_entries","format=duration",
      "-of","default=noprint_wrappers=1:nokey=1", dl.file
    ]).toString().trim());
    const sizeMB = fs.statSync(dl.file).size / 1024 / 1024;
    const durOk  = Math.abs(probed - spec.durationSec) <= 1.5;
    const sizeOk = sizeMB > 1.0;
    console.log(`  [validate] duration=${probed.toFixed(1)}s (expected ${spec.durationSec}±1.5)  size=${sizeMB.toFixed(1)}MB`);

    if (!durOk || !sizeOk) {
      console.error(`  ❌ validation failed (durOk=${durOk} sizeOk=${sizeOk})`);
      console.error(`  scratch kept at: ${dl.dir}`);
      process.exit(1);
    }

    // 7. Rename
    fs.renameSync(dl.file, finalPath);
    fs.rmSync(dl.dir, { recursive: true, force: true });
    console.log(`  ✅ saved → ${path.basename(finalPath)}`);
  }

  console.log(`\n${"═".repeat(60)}\n  ✅ EP3 PIPELINE COMPLETE @ ${ts()}\n${"═".repeat(60)}\n`);
})().catch(e => { console.error(`\n❌ pipeline error: ${e.message}`); process.exit(1); });
