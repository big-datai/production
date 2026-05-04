#!/usr/bin/env node
/**
 * Submit a full episode to Kling.
 *
 * Pipeline (always in this order):
 *   1. addMissingElements.mjs <episode.json>
 *      → ensures every newBoundElement has a local PNG (Nano Banana fills gaps)
 *      → scans Kling library, creates only the missing ones
 *   2. submitOmniClip.mjs for each entry in episode.clips[]
 *      → music-video specs (clip "A","B","C", or musicVideoBlock=true) are skipped
 *        unless --include-music is passed
 *
 * Usage:
 *   node submitEpisode.mjs <path/to/episode.json>
 *   node submitEpisode.mjs --episode=8
 *   node submitEpisode.mjs <input> --skip-prereq      # don't run addMissingElements
 *   node submitEpisode.mjs <input> --include-music    # also submit A/B/C music-video specs
 *   node submitEpisode.mjs <input> --only=3,4,7       # submit a subset of clip numbers
 *   node submitEpisode.mjs <input> --dry-run          # plan only
 */
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const SCRIPTS_DIR = path.dirname(new URL(import.meta.url).pathname);

const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv.filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const positional = argv.filter(a => !a.startsWith("--"));
const dryRun = flags["dry-run"] === "true";
const skipPrereq = flags["skip-prereq"] === "true";
const includeMusic = flags["include-music"] === "true";
const onlyClips = flags.only
  ? new Set(flags.only.split(",").map(s => s.trim()))
  : null;

let epPath;
if (positional[0]) epPath = path.resolve(positional[0]);
else if (flags.episode) epPath = path.join(PROJECT_ROOT, "content", "episodes", `ep${String(flags.episode).padStart(2, "0")}.json`);
else {
  console.error("Usage: node submitEpisode.mjs <episode.json> | --episode=<NN>  [--skip-prereq] [--include-music] [--only=N,N,...] [--dry-run]");
  process.exit(1);
}

// Auto-consolidate: if the flat ep<NN>.json is missing but the per-clip
// directory ep<NN>/ exists with episode.json + numeric/letter clip JSONs,
// build the flat file in-memory and write it. Post-ep10 fix: previously
// you had to manually run a Python consolidator before submitEpisode could
// see the per-clip layout.
if (!fs.existsSync(epPath)) {
  const dirCandidate = epPath.replace(/\.json$/, "");
  const epManifest = path.join(dirCandidate, "episode.json");
  if (fs.existsSync(epManifest) && fs.statSync(dirCandidate).isDirectory()) {
    console.log(`ℹ flat ${path.basename(epPath)} missing — auto-consolidating from ${path.basename(dirCandidate)}/`);
    const manifest = JSON.parse(fs.readFileSync(epManifest, "utf8"));
    const numClips = [], lettClips = [];
    for (const f of fs.readdirSync(dirCandidate)) {
      if (!/^(\d+|[A-Z])\.json$/.test(f)) continue;
      const spec = JSON.parse(fs.readFileSync(path.join(dirCandidate, f), "utf8"));
      const stem = f.replace(/\.json$/, "");
      if (/^\d+$/.test(stem)) numClips.push(spec);
      else lettClips.push(spec);
    }
    numClips.sort((a, b) => Number(a.clip) - Number(b.clip));
    lettClips.sort((a, b) => String(a.clip).localeCompare(String(b.clip)));
    manifest.clips = numClips;
    manifest.musicVideos = lettClips;
    fs.writeFileSync(epPath, JSON.stringify(manifest, null, 2));
    console.log(`   wrote ${path.basename(epPath)} (${numClips.length} clips + ${lettClips.length} music videos)`);
  } else {
    console.error(`❌ episode JSON not found: ${epPath}`);
    console.error(`   (also checked for per-clip layout at ${dirCandidate}/episode.json — not found)`);
    process.exit(1);
  }
}
const ep = JSON.parse(fs.readFileSync(epPath, "utf8"));

// Build clip list — episode.clips[] AND episode.musicVideos[] (both
// arrays in the consolidated form), else fall back to per-clip JSON files
// (numeric AND letter-named like A.json, B.json) in ep<NN>/.
// Bug fixed post-ep09: --include-music --only=B did nothing because the
// loader only read ep.clips, never ep.musicVideos.
let clips = [];
if (Array.isArray(ep.clips) || Array.isArray(ep.musicVideos)) {
  for (const c of (ep.clips ?? [])) clips.push({ source: "embedded", spec: c, label: String(c.clip ?? c.clipNumber ?? "?") });
  for (const c of (ep.musicVideos ?? [])) clips.push({ source: "embedded", spec: c, label: String(c.clip ?? "?") });
} else {
  const dir = epPath.replace(/\.json$/, "");
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    const allJsons = fs.readdirSync(dir)
      .filter(f => /^(\d+|[A-Z])\.json$/.test(f))
      .sort((a, b) => {
        // Numeric first (1, 2, ..., 20), then letters (A, B, C)
        const aNum = /^\d+$/.test(a.replace(/\.json$/, ""));
        const bNum = /^\d+$/.test(b.replace(/\.json$/, ""));
        if (aNum && !bNum) return -1;
        if (!aNum && bNum) return 1;
        if (aNum && bNum) return parseInt(a) - parseInt(b);
        return a.localeCompare(b);
      });
    clips = allJsons.map(f => ({ source: "file", file: path.join(dir, f), label: f.replace(/\.json$/, "") }));
  }
}

// Filter out music-video specs unless asked to include them
const isMusicVideo = (c) => {
  const s = c.spec || {};
  return s.musicVideoBlock === true || /^[A-Z]$/.test(String(s.clip ?? ""));
};
let filtered = includeMusic ? clips : clips.filter(c => !isMusicVideo(c));
if (onlyClips) filtered = filtered.filter(c => onlyClips.has(c.label));

if (filtered.length === 0) {
  console.error(`❌ no clips matched (total in episode: ${clips.length})`);
  process.exit(1);
}

console.log(`📋 ${path.basename(epPath)}`);
console.log(`   total clips: ${clips.length}`);
console.log(`   to submit:   ${filtered.length}${includeMusic ? "" : " (music-video specs excluded — pass --include-music to include)"}`);
console.log(`   prereq:      ${skipPrereq ? "skipped (--skip-prereq)" : "addMissingElements.mjs will run first"}`);
if (dryRun) {
  console.log(`\n[dry-run] clips: ${filtered.map(c => c.label).join(", ")}`);
  process.exit(0);
}

// ─── Phase 1: addMissingElements ───────────────────────────────────────────
if (!skipPrereq) {
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`▶  PHASE 1 — addMissingElements`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  const r = spawnSync("node", [path.join(SCRIPTS_DIR, "addMissingElements.mjs"), epPath], {
    stdio: "inherit", cwd: PROJECT_ROOT,
  });
  if (r.status !== 0) {
    console.error(`\n❌ addMissingElements failed (exit ${r.status}). Aborting submit.`);
    process.exit(r.status ?? 1);
  }
}

// ─── Phase 2: submit each clip ─────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`▶  PHASE 2 — submit ${filtered.length} clip(s) to Kling`);
console.log(`═══════════════════════════════════════════════════════════════`);

const submitter = path.join(SCRIPTS_DIR, "submitOmniClip.mjs");
let ok = 0, fail = 0;
const tmpDir = fs.mkdtempSync(path.join(path.dirname(epPath), ".submit-"));
try {
  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    let clipPath;
    if (c.source === "file") {
      clipPath = c.file;
    } else {
      // Embedded clip — write to a temp file so submitOmniClip can read it
      clipPath = path.join(tmpDir, `${c.label}.json`);
      fs.writeFileSync(clipPath, JSON.stringify(c.spec, null, 2));
    }
    console.log(`\n[${String(i + 1).padStart(2, "0")}/${filtered.length}] clip ${c.label}`);
    const r = spawnSync("node", [submitter, clipPath], { stdio: "inherit", cwd: PROJECT_ROOT });
    if (r.status === 0) ok++;
    else fail++;
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(`\n✅ done — ${ok}/${filtered.length} submitted, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
