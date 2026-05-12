#!/usr/bin/env node
/**
 * Assemble a Sara & Eva episode MP4: prepend reusable intro clips, concat
 * the episode's numbered unique clips in order, append reusable outro clips.
 *
 * THE canonical assembly method (ep06+). Replaces the older sidecar-driven
 * assembly that read kling_job_NNN.json metadata — that convention was
 * deprecated when we switched to numeric filenames (1.mp4, 2.mp4, …).
 *
 * Each clip gets standard preprocessing:
 *   - 0.15s start trim (suppress Kling scene-pop on first frame)
 *   - scale + center-crop to 1280×720
 *   - 30fps, libx264 crf 19, AAC 44.1k stereo
 *
 * Intro/outro clips get the same preprocessing so dimensions and codec
 * match the body clips (avoids re-encoding during concat).
 *
 * Numbered clips are sorted numerically (1.mp4, 2.mp4, …, N.mp4) and any
 * gaps in the sequence are skipped silently — useful when a single clip
 * silent-failed at credit cap and the rest of the episode is still
 * watchable.
 *
 * Usage:
 *   node assembleEpisode.mjs <output.mp4> --clips-dir <dir> [--intro-dir <dir>] [--outro-dir <dir>]
 *
 * Example:
 *   node assembleEpisode.mjs \
 *     season_01/episode_06/ep06_v1.mp4 \
 *     --clips-dir season_01/episode_06/clips \
 *     --intro-dir season_01/intro \
 *     --outro-dir season_01/OUTRO
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const positional = argv.filter((a, i) => !a.startsWith("--") && (i === 0 || !argv[i-1].startsWith("--")));
const outPath = path.resolve(positional[0] || "");
const argFlag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i+1] : null; };
const clipsDir = argFlag("clips-dir") ? path.resolve(argFlag("clips-dir")) : null;
const introDir = argFlag("intro-dir") ? path.resolve(argFlag("intro-dir")) : null;
const outroDir = argFlag("outro-dir") ? path.resolve(argFlag("outro-dir")) : null;

if (!outPath || !clipsDir) {
  console.error("Usage: assembleEpisode.mjs <output.mp4> --clips-dir <dir> [--intro-dir <dir>] [--outro-dir <dir>]");
  process.exit(1);
}
if (!fs.existsSync(clipsDir)) {
  console.error(`❌ clips dir not found: ${clipsDir}`);
  process.exit(1);
}

const TRIM_START = 0.15;
const work = `/tmp/assemble-${Date.now()}`;
fs.mkdirSync(work, { recursive: true });

// Common ffmpeg preprocessing — produces uniform 1280x720@30, AAC 44.1k stereo
function normalize(inputPath, outputPath, trim = TRIM_START) {
  execSync(
    `ffmpeg -y -loglevel error -ss ${trim} -i "${inputPath}" ` +
    `-vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=30" ` +
    `-af "aresample=44100" ` +
    `-c:v libx264 -preset fast -crf 19 -pix_fmt yuv420p ` +
    `-c:a aac -b:a 192k -ar 44100 -ac 2 ` +
    `"${outputPath}"`
  );
}

const parts = [];
let idx = 1;

// ─── INTRO ──────────────────────────────────────────────────────────────────
if (introDir && fs.existsSync(introDir)) {
  const introFiles = fs.readdirSync(introDir)
    .filter(f => /\.mp4$/i.test(f) && !f.startsWith("."))
    .sort(); // alphabetical: intro_eva, intro_mama, intro_sara → reorder below
  // Curated intro order: intro_sara → intro_eva → intro_mama (matches ep01
  // "Meet the family" sequence). intro_song.mp4 (when present) plays first.
  const orderedIntro = [];
  for (const name of ["intro_song.mp4", "intro_sara.mp4", "intro_eva.mp4", "intro_mama.mp4"]) {
    if (introFiles.includes(name)) orderedIntro.push(name);
  }
  // Append any other intro files alphabetically (forward-compat)
  for (const f of introFiles) if (!orderedIntro.includes(f)) orderedIntro.push(f);

  console.log(`📼 Intro (${orderedIntro.length} clips from ${introDir}):`);
  for (const f of orderedIntro) {
    const out = path.join(work, `${String(idx).padStart(3, "0")}_intro_${f.replace(/\.mp4$/, "")}.mp4`);
    normalize(path.join(introDir, f), out);
    parts.push(out);
    console.log(`  ✓ ${f}`);
    idx++;
  }
}

// ─── BODY (numbered episode clips) ──────────────────────────────────────────
// Accepts integer-named clips (1.mp4, 2.mp4, …) AND decimal-named music
// inserts (e.g. 8.5.mp4 between 8 and 9). Sorted by parseFloat.
const bodyFiles = fs.readdirSync(clipsDir)
  .filter(f => /^\d+(\.\d+)?\.mp4$/.test(f))
  .map(f => ({ n: parseFloat(f), f }))
  .sort((a, b) => a.n - b.n);

console.log(`\n📺 Body (${bodyFiles.length} numbered clips from ${clipsDir}):`);
let prevN = 0;
for (const { n, f } of bodyFiles) {
  if (n - prevN > 1) {
    for (let g = prevN + 1; g < n; g++) console.log(`  ⊘ ${g}.mp4 (missing — skipped)`);
  }
  prevN = n;
  const out = path.join(work, `${String(idx).padStart(3, "0")}_body_${n}.mp4`);
  normalize(path.join(clipsDir, f), out);
  parts.push(out);
  console.log(`  ✓ ${f}`);
  idx++;
}

// ─── OUTRO ──────────────────────────────────────────────────────────────────
if (outroDir && fs.existsSync(outroDir)) {
  // SORT BEHAVIOR: numbered files (17.mp4, 18.mp4) sort by their integer.
  // The "0_song.mp4" file uses `0` prefix specifically so `parseInt('0_song')`
  // returns 0, which JS truthy-falls back to Infinity → sorts LAST.
  // Why LAST: outro design is subscribe-wave (17, song bg) → button-point
  // (18, song bg) → 0_song (final 10s "Yeah!" flourish). Song flows
  // continuously through 34-44s → 44-54s → 54-64s.
  // (Yes, this relies on JS's `0 || Infinity = Infinity` behavior — it's
  // intentional, not a bug. Preserve it.)
  const outroFiles = fs.readdirSync(outroDir)
    .filter(f => /\.mp4$/i.test(f) && !f.startsWith("."))
    .map(f => ({ n: parseInt(f, 10) || Infinity, f }))
    .sort((a, b) => a.n - b.n)
    .map(x => x.f);
  console.log(`\n📼 Outro (${outroFiles.length} clips from ${outroDir}):`);
  for (const f of outroFiles) {
    const out = path.join(work, `${String(idx).padStart(3, "0")}_outro_${f.replace(/\.mp4$/, "")}.mp4`);
    normalize(path.join(outroDir, f), out);
    parts.push(out);
    console.log(`  ✓ ${f}`);
    idx++;
  }
}

if (parts.length === 0) {
  console.error("❌ Nothing to assemble. Check --clips-dir.");
  process.exit(1);
}

// ─── FFMPEG CONCAT ──────────────────────────────────────────────────────────
const list = path.join(work, "concat.txt");
fs.writeFileSync(list, parts.map(p => `file '${p}'`).join("\n"));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
console.log(`\n🎬 Concatenating ${parts.length} parts → ${outPath}`);
execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i "${list}" -c copy "${outPath}"`);

const dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outPath}"`).toString().trim());
const size = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
console.log(`\n✅ ${outPath}`);
console.log(`   ${parts.length} clips · ${Math.floor(dur/60)}:${String(Math.round(dur)%60).padStart(2,"0")} · ${size} MB`);

// Cleanup work dir (keep concat.txt for debug if needed)
// fs.rmSync(work, { recursive: true, force: true });
