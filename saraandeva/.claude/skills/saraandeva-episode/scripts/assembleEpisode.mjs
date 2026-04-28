#!/usr/bin/env node
/**
 * Assemble an episode MP4 from sidecar-tagged clips.
 * Reads kling_job_NNN.json sidecars, includes only status="keep" clips,
 * orders by mappedTo (clip_01a, clip_01b, … clip_06b), and ffmpeg-concats.
 *
 * Usage:
 *   node assembleEpisode.mjs <clips_dir> <output.mp4> [--intro <path>]
 *
 * Sidecar contract (see frameAudit.mjs):
 *   - status: "keep" | "reject" | "review-needed"  (only "keep" gets included)
 *   - mappedTo: "clip_01a" through "clip_06b"     (sort key)
 *
 * Each clip gets the standard preprocessing:
 *   - 0.15s start trim (suppress Kling scene-pop)
 *   - scale + center-crop to 1280x720
 *   - audio normalized to AAC 44.1k stereo
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const positional = argv.filter(a => !a.startsWith("--"));
const dir = path.resolve(positional[0] || ".");
const outPath = path.resolve(positional[1] || "episode.mp4");
const introIdx = argv.indexOf("--intro");
const introPath = introIdx >= 0 ? path.resolve(argv[introIdx + 1]) : null;
const TRIM_START = 0.15;

if (!fs.existsSync(dir)) { console.error(`❌ Not found: ${dir}`); process.exit(1); }

// Read all sidecars in dir
const sidecars = fs.readdirSync(dir)
  .filter(f => /^kling_job_\d+\.json$/.test(f))
  .map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    data._file = path.join(dir, `kling_job_${data.klingId}.mp4`);
    return data;
  });

const keepers = sidecars
  .filter(s => s.status === "keep" && s.mappedTo)
  .sort((a, b) => a.mappedTo.localeCompare(b.mappedTo));

console.log(`📂 ${dir}`);
console.log(`📋 ${sidecars.length} sidecars · ${keepers.length} marked keep · ${sidecars.filter(s=>s.status==='reject').length} reject · ${sidecars.filter(s=>s.status==='review-needed').length} review-needed`);

if (keepers.length === 0) {
  console.error(`❌ No clips marked status="keep" in sidecars. Run frameAudit.mjs --interactive first.`);
  process.exit(1);
}

const work = `/tmp/assemble-${Date.now()}`;
fs.mkdirSync(work, { recursive: true });

// Normalize intro
let parts = [];
if (introPath && fs.existsSync(introPath)) {
  const introOut = path.join(work, "00_intro.mp4");
  execSync(`ffmpeg -y -loglevel error -i "${introPath}" -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=30" -af "aresample=44100" -c:v libx264 -preset fast -crf 19 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 44100 -ac 2 "${introOut}"`);
  parts.push(introOut);
  console.log(`✓ intro normalized`);
}

let i = 1;
for (const s of keepers) {
  if (!fs.existsSync(s._file)) {
    console.error(`  ⚠ missing MP4 for ${s.mappedTo}: ${s._file} — skipped`);
    continue;
  }
  const out = path.join(work, `${String(i).padStart(2,"0")}_${s.mappedTo}_${s.klingId}.mp4`);
  execSync(`ffmpeg -y -loglevel error -ss ${TRIM_START} -i "${s._file}" -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=30" -af "aresample=44100" -c:v libx264 -preset fast -crf 19 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 44100 -ac 2 "${out}"`);
  parts.push(out);
  console.log(`  ✓ ${s.mappedTo} (id=${s.klingId}): ${s.rendered?.slice(0,70) || ""}`);
  i++;
}

const list = path.join(work, "concat.txt");
fs.writeFileSync(list, parts.map(p => `file '${p}'`).join("\n"));
execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i "${list}" -c copy "${outPath}"`);

const dur = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outPath}"`).toString().trim();
console.log(`\n✅ ${outPath}`);
console.log(`   ${parts.length} clips · ${Math.round(dur)}s (${Math.floor(dur/60)}:${String(Math.round(dur)%60).padStart(2,"0")})`);
