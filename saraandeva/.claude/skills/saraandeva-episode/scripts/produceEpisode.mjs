#!/usr/bin/env node
/**
 * Central post-render orchestrator for a Sara & Eva episode.
 *
 * Chains every step from "Kling has finished rendering" through
 * "uploaded to YouTube UNLISTED". Each phase fails fast on error.
 *
 *   PHASE 1  download:   downloadOmniByPrompt → all clips/<n>.mp4
 *   PHASE 2  music:      loopVideoWithSong for each musicVideoBlock → <N>.5.mp4
 *   PHASE 3  assemble:   assembleEpisode → ep<NN>_v<auto>.mp4
 *   PHASE 4  thumbnail:  generateThumbnail → ep<NN>_thumbnail.jpg
 *   PHASE 5  short:      generateShort → ep<NN>_short.mp4
 *   PHASE 6  validate:   validateEpisode (errors abort upload)
 *   PHASE 7  upload:     uploadEpisodeToSaraAndEva → YouTube UNLISTED
 *
 * Submit side (validateClipCasting + addMissingElements + submitClips) is
 * handled by submitEpisode.mjs separately — they're decoupled because Kling
 * renders take 30-60 min between Phases.
 *
 * Usage:
 *   node produceEpisode.mjs --episode 10 --title "Magic Forest!" \
 *     [--hero-clip 14]                # thumbnail hero (default 14)
 *     [--short-source 18.5.mp4]       # short source (default: highest .5)
 *     [--start-from N]                # skip earlier phases (1..7)
 *     [--stop-after N]                # stop after phase N
 *     [--privacy unlisted|public|private]
 *     [--skip-validation]             # bypass validateEpisode
 *     [--no-upload]                   # alias for --stop-after 6
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// ─── Arg parsing (supports --key=value AND --key value) ────────────────────
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const eq = a.indexOf("=");
    if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { flags[k] = next; i++; }
      else flags[k] = "true";
    }
  } else {
    positional.push(a);
  }
}

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const SCRIPTS_DIR = path.dirname(new URL(import.meta.url).pathname);

if (!flags.episode) {
  console.error(`Usage: produceEpisode.mjs --episode NN --title "..." [--hero-clip 14] [--short-source 18.5.mp4] [--start-from N] [--stop-after N] [--no-upload]`);
  process.exit(1);
}
const epNum = Number(flags.episode);
const epPad = String(epNum).padStart(2, "0");
const specDir = path.join(PROJECT_ROOT, "content", "episodes", `ep${epPad}`);
const flatSpec = path.join(PROJECT_ROOT, "content", "episodes", `ep${epPad}.json`);
const deliverDir = path.join(PROJECT_ROOT, "season_01", `episode_${epPad}`);
const clipsDir = path.join(deliverDir, "clips");
fs.mkdirSync(clipsDir, { recursive: true });

const startFrom = Number(flags["start-from"] ?? 1);
const stopAfter = flags["no-upload"] === "true" ? 6 : Number(flags["stop-after"] ?? 7);
const privacy = flags.privacy ?? "unlisted";
const skipValidation = flags["skip-validation"] === "true";

// Title is required for thumbnail+short+upload (phases 4/5/7)
const title = flags.title;
if (!title && stopAfter >= 4) {
  console.error(`❌ --title required (used for thumbnail + short + YouTube)`);
  process.exit(1);
}

// Resolve flat spec (build from per-clip dir if missing)
if (!fs.existsSync(flatSpec) && fs.existsSync(specDir)) {
  console.log(`ℹ flat ep${epPad}.json missing — auto-consolidating from ${specDir}/`);
  const manifest = JSON.parse(fs.readFileSync(path.join(specDir, "episode.json"), "utf8"));
  const numClips = [], lettClips = [];
  for (const f of fs.readdirSync(specDir)) {
    if (!/^(\d+(\.\d+)?|[A-Z])\.json$/.test(f)) continue;
    const spec = JSON.parse(fs.readFileSync(path.join(specDir, f), "utf8"));
    const stem = f.replace(/\.json$/, "");
    if (/^\d+(\.\d+)?$/.test(stem)) numClips.push(spec);
    else lettClips.push(spec);
  }
  numClips.sort((a, b) => Number(a.clip) - Number(b.clip));
  lettClips.sort((a, b) => String(a.clip).localeCompare(String(b.clip)));
  manifest.clips = numClips;
  manifest.musicVideos = lettClips;
  fs.writeFileSync(flatSpec, JSON.stringify(manifest, null, 2));
}
const ep = JSON.parse(fs.readFileSync(flatSpec, "utf8"));

// ─── Helper to run a child phase and abort on failure ──────────────────────
function runPhase(num, name, args, opts = {}) {
  if (num < startFrom) {
    console.log(`\n⏭  PHASE ${num} — ${name} (skipped, --start-from=${startFrom})`);
    return;
  }
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`▶  PHASE ${num} — ${name}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  const r = spawnSync(args[0], args.slice(1), { stdio: "inherit", cwd: PROJECT_ROOT, ...opts });
  if (r.status !== 0) {
    console.error(`\n❌ PHASE ${num} (${name}) failed (exit ${r.status}). Aborting.`);
    process.exit(r.status ?? 1);
  }
}

console.log(`🎬 produceEpisode ep${epPad}`);
console.log(`   spec dir:    ${specDir}`);
console.log(`   deliver dir: ${deliverDir}`);
console.log(`   phases:      ${startFrom}..${stopAfter} (of 7)`);

// ─── PHASE 1 — download ────────────────────────────────────────────────────
if (startFrom <= 1 && stopAfter >= 1) {
  runPhase(1, "downloadOmniByPrompt", [
    "node", path.join(SCRIPTS_DIR, "downloadOmniByPrompt.mjs"),
    specDir, clipsDir,
  ]);
}

// ─── PHASE 2 — build music-video segments via loopVideoWithSong ────────────
if (startFrom <= 2 && stopAfter >= 2) {
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`▶  PHASE 2 — build music-video segments`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  const blocks = ep?.music?.musicVideoBlocks || [];
  for (const b of blocks) {
    // blockId like "4music" or "12music" — segment file is <num>.5.mp4
    // (placement at this clip number in the episode order). The render
    // letter (A/B/C) is in b.render.
    const segNum = (b.blockId || "").replace(/[^\d]/g, "");
    if (!segNum) {
      console.warn(`⚠ block ${b.blockId} has no numeric prefix — skipping`);
      continue;
    }
    const renderMp4 = path.join(clipsDir, `${b.render}.mp4`);
    const songMp3 = path.join(PROJECT_ROOT, b.song);
    const outMp4 = path.join(clipsDir, `${segNum}.5.mp4`);
    if (!fs.existsSync(renderMp4)) {
      console.error(`❌ render mp4 missing: ${renderMp4} (expected from PHASE 1 download of ${b.render}.json)`);
      process.exit(1);
    }
    if (!fs.existsSync(songMp3)) {
      console.error(`❌ song mp3 missing: ${songMp3}`);
      process.exit(1);
    }
    console.log(`  → ${path.basename(outMp4)}  (render ${b.render} + ${path.basename(b.song)} @ ${b.blockDurationSec}s)`);
    const r = spawnSync("node", [
      path.join(SCRIPTS_DIR, "loopVideoWithSong.mjs"),
      renderMp4, songMp3, outMp4,
      `--duration=${b.blockDurationSec}`,
    ], { stdio: ["ignore", "ignore", "inherit"], cwd: PROJECT_ROOT });
    if (r.status !== 0) {
      console.error(`❌ loopVideoWithSong failed for block ${b.blockId}`);
      process.exit(r.status ?? 1);
    }
  }
  // Remove the raw A/B/C renders so they don't double-include in assemble
  for (const f of fs.readdirSync(clipsDir)) {
    if (/^[A-Z]\.mp4$/.test(f)) fs.unlinkSync(path.join(clipsDir, f));
  }
}

// ─── PHASE 3 — assemble ────────────────────────────────────────────────────
// Auto-version: ep<NN>_v<next>.mp4
const existingVersions = fs.existsSync(deliverDir)
  ? fs.readdirSync(deliverDir).filter(f => new RegExp(`^ep${epPad}_v(\\d+)\\.mp4$`).test(f)).map(f => Number(f.match(/_v(\d+)\.mp4$/)[1]))
  : [];
const nextVersion = existingVersions.length === 0 ? 1 : Math.max(...existingVersions) + 1;
const assembledPath = path.join(deliverDir, `ep${epPad}_v${nextVersion}.mp4`);

if (startFrom <= 3 && stopAfter >= 3) {
  runPhase(3, `assembleEpisode → ep${epPad}_v${nextVersion}.mp4`, [
    "node", path.join(SCRIPTS_DIR, "assembleEpisode.mjs"),
    assembledPath,
    "--clips-dir", clipsDir,
    "--intro-dir", path.join(PROJECT_ROOT, "season_01", "intro"),
    "--outro-dir", path.join(PROJECT_ROOT, "season_01", "OUTRO"),
  ]);
}

// ─── PHASE 4 — thumbnail ───────────────────────────────────────────────────
const heroClip = flags["hero-clip"] ?? "14";
if (startFrom <= 4 && stopAfter >= 4) {
  runPhase(4, "generateThumbnail", [
    "node", path.join(SCRIPTS_DIR, "generateThumbnail.mjs"),
    `--episode=${epNum}`, `--title=${title}`, `--hero=${heroClip}`,
  ]);
}

// ─── PHASE 5 — vertical short ──────────────────────────────────────────────
// Default source: the highest-numbered .5 segment (typically the closing music video)
let shortSource = flags["short-source"];
if (!shortSource) {
  const decimalSegs = fs.readdirSync(clipsDir)
    .filter(f => /^\d+\.5\.mp4$/.test(f))
    .sort((a, b) => Number(b.replace(".mp4", "")) - Number(a.replace(".mp4", "")));
  shortSource = decimalSegs[0] || "1.mp4";
}
if (startFrom <= 5 && stopAfter >= 5) {
  runPhase(5, `generateShort (source=${shortSource})`, [
    "node", path.join(SCRIPTS_DIR, "generateShort.mjs"),
    `--episode=${epNum}`, `--title=${title}`, `--source=${shortSource}`,
  ]);
}

// ─── PHASE 6 — validateEpisode ─────────────────────────────────────────────
if (startFrom <= 6 && stopAfter >= 6 && !skipValidation) {
  runPhase(6, "validateEpisode (pre-upload)", [
    "node", path.join(SCRIPTS_DIR, "validateEpisode.mjs"),
    `--episode=${epNum}`,
  ]);
}

// ─── PHASE 7 — upload ──────────────────────────────────────────────────────
if (startFrom <= 7 && stopAfter >= 7) {
  const descFile = path.join(deliverDir, `ep${epPad}_description.txt`);
  const tagsFile = path.join(deliverDir, `ep${epPad}_tags.txt`);
  const thumbFile = path.join(deliverDir, `ep${epPad}_thumbnail.jpg`);
  runPhase(7, "uploadEpisodeToSaraAndEva", [
    "node", path.join(SCRIPTS_DIR, "uploadEpisodeToSaraAndEva.mjs"),
    assembledPath,
    "--title", title,
    "--description-file", descFile,
    "--tags-file", tagsFile,
    "--thumbnail", thumbFile,
    "--privacy", privacy,
    ...(skipValidation ? ["--skip-validation"] : []),
  ]);
}

console.log(`\n✅ produceEpisode ep${epPad} complete (phases ${startFrom}..${stopAfter})`);
