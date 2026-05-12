#!/usr/bin/env node
/**
 * Build a multi-episode compilation MP4 for the Sara and Eva channel.
 *
 * Strategy: kid-channel compilations dominate watch-time on YouTube. Like
 * Nastya / Vlad & Niki / Cocomelon all use 30-60 min compilations as their
 * algorithmic rocket fuel. A single compilation upload can pull more
 * watch-time than ten individual episodes combined.
 *
 * What this does:
 *   - Concatenates the chosen episode mp4s (with their built-in intros/outros
 *     between, which doubles as a brand-repeat hook each episode).
 *   - Adds short crossfade transitions between episodes (configurable, default
 *     0.5s) for smooth flow.
 *   - Generates a compilation thumbnail by combining the source episode
 *     thumbnails into a 2x2 / 2x3 / 3x2 grid (auto-layout based on count).
 *   - Writes a description file with chapter timestamps for each episode.
 *
 * Usage:
 *   node buildCompilation.mjs --episodes 6,7,8,9,10,11 \
 *     --title "Sara & Eva — 30 Minutes of Adventures (May 2026)" \
 *     --output season_01/compilations/may_2026.mp4
 *
 * Flags:
 *   --episodes N,N,N         Episode numbers to include (in order)
 *   --title "..."            Compilation title (also written to description)
 *   --output PATH            Output mp4 path
 *   --xfade SECONDS          Crossfade duration between episodes (default 0.5)
 *   --skip-thumbnail         Skip generating the compilation thumbnail
 *   --skip-description       Skip writing the description file
 *
 * Notes:
 *   - Requires ffmpeg + ffprobe in PATH (already used by assembleEpisode.mjs)
 *   - Source episodes must be named season_01/episode_<NN>/ep<NN>_v<latest>.mp4
 *   - Picks the highest version number per episode automatically
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const argFlag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i+1] : null; };

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
const SEASON_DIR = path.join(PROJECT_ROOT, 'season_01');

const episodesArg = argFlag('episodes');
const title = argFlag('title') || 'Sara & Eva — Best Adventures Compilation';
const outputArg = argFlag('output');
const xfadeSec = parseFloat(argFlag('xfade') || '0.5');
const skipThumbnail = argv.includes('--skip-thumbnail');
const skipDescription = argv.includes('--skip-description');

if (!episodesArg) {
  console.error('Usage: buildCompilation.mjs --episodes 6,7,8,9,10,11 --title "..." --output season_01/compilations/may_2026.mp4');
  process.exit(1);
}

const epNumbers = episodesArg.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
if (epNumbers.length === 0) {
  console.error(`❌ No valid episode numbers in --episodes ${episodesArg}`);
  process.exit(1);
}

// Default output path: season_01/compilations/<slug>.mp4
const defaultSlug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 60);
const outputPath = path.resolve(outputArg || path.join(SEASON_DIR, 'compilations', `${defaultSlug}.mp4`));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

console.log(`\n🎬 Building compilation`);
console.log(`   Title:    ${title}`);
console.log(`   Episodes: ${epNumbers.join(', ')}`);
console.log(`   Output:   ${outputPath}`);
console.log(`   Crossfade: ${xfadeSec}s between episodes\n`);

// ─── Resolve source mp4 per episode (latest version) ────────────────────────
function findLatestEpisodeMp4(epNum) {
  const epDir = path.join(SEASON_DIR, `episode_${String(epNum).padStart(2, '0')}`);
  if (!fs.existsSync(epDir)) throw new Error(`Episode dir not found: ${epDir}`);
  const candidates = fs.readdirSync(epDir)
    .filter(f => /^ep\d+_v\d+\.mp4$/.test(f))
    .map(f => ({ f, v: parseInt(f.match(/_v(\d+)\.mp4$/)[1], 10), full: path.join(epDir, f) }))
    .sort((a, b) => b.v - a.v);
  if (candidates.length === 0) throw new Error(`No ep<NN>_v<N>.mp4 found in ${epDir}`);
  return candidates[0].full;
}

function findEpisodeThumbnail(epNum) {
  const epDir = path.join(SEASON_DIR, `episode_${String(epNum).padStart(2, '0')}`);
  const candidates = ['ep' + String(epNum).padStart(2, '0') + '_thumbnail.jpg', `ep${epNum}_thumbnail.jpg`];
  for (const c of candidates) {
    const full = path.join(epDir, c);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function probeDuration(mp4) {
  const out = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp4}"`).toString().trim();
  return parseFloat(out);
}

const sources = epNumbers.map(epNum => {
  const mp4 = findLatestEpisodeMp4(epNum);
  const dur = probeDuration(mp4);
  console.log(`   ep${String(epNum).padStart(2, '0')}: ${path.basename(mp4)} (${dur.toFixed(1)}s)`);
  return { epNum, mp4, dur };
});

// ─── Build the concat with optional crossfades ──────────────────────────────
//
// Strategy: ffmpeg's concat demuxer is the simplest path but doesn't crossfade.
// For crossfades we use the concat filter with xfade between adjacent inputs.
// To keep complexity manageable, we use the concat demuxer (no crossfade) when
// xfadeSec is 0, and the xfade filter chain when > 0.
//
// xfade-chain ffmpeg: -i ep1 -i ep2 -i ep3 ... -filter_complex
//   "[0:v][1:v]xfade=transition=fade:duration=X:offset=D1[v01]; \
//    [v01][2:v]xfade=transition=fade:duration=X:offset=D2[v012]; ..."
//
// Where Dk = sum(durations 0..k) - X*k (account for prior xfade overlaps).

if (xfadeSec === 0) {
  // ─── concat demuxer (no transitions) ──────────────────────────────────────
  const concatList = path.join('/tmp', `compilation_${Date.now()}.txt`);
  fs.writeFileSync(concatList, sources.map(s => `file '${s.mp4}'`).join('\n') + '\n');
  console.log(`\n🔗 Concatenating with concat demuxer (no crossfade)...`);
  const r = spawnSync('ffmpeg', [
    '-y',
    '-f', 'concat', '-safe', '0',
    '-i', concatList,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    outputPath,
  ], { stdio: 'inherit' });
  fs.unlinkSync(concatList);
  if (r.status !== 0) { console.error(`❌ ffmpeg concat failed`); process.exit(1); }
} else {
  // ─── xfade chain (smooth transitions) ────────────────────────────────────
  const inputs = sources.flatMap(s => ['-i', s.mp4]);
  // Build the filter graph
  const vChain = [];
  const aChain = [];
  let cumul = 0;
  for (let i = 0; i < sources.length - 1; i++) {
    cumul += sources[i].dur;
    const offset = cumul - xfadeSec * (i + 1);
    const prevV = i === 0 ? `[0:v]` : `[v${i-1}]`;
    const prevA = i === 0 ? `[0:a]` : `[a${i-1}]`;
    vChain.push(`${prevV}[${i+1}:v]xfade=transition=fade:duration=${xfadeSec}:offset=${offset.toFixed(3)}[v${i}]`);
    aChain.push(`${prevA}[${i+1}:a]acrossfade=d=${xfadeSec}[a${i}]`);
  }
  const lastV = `[v${sources.length - 2}]`;
  const lastA = `[a${sources.length - 2}]`;
  const filterComplex = [...vChain, ...aChain].join(';');
  console.log(`\n🔗 Concatenating with xfade chain (${xfadeSec}s crossfades)...`);
  const r = spawnSync('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', lastV,
    '-map', lastA,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    outputPath,
  ], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`❌ ffmpeg xfade-concat failed`); process.exit(1); }
}

const outDur = probeDuration(outputPath);
const outSize = fs.statSync(outputPath).size;
console.log(`\n✅ Compilation built: ${outputPath}`);
console.log(`   Duration: ${Math.floor(outDur/60)}:${String(Math.floor(outDur%60)).padStart(2,'0')} (${outDur.toFixed(1)}s)`);
console.log(`   Size:     ${(outSize/1024/1024).toFixed(1)} MB`);

// ─── Description file with chapter timestamps ───────────────────────────────
if (!skipDescription) {
  const descPath = outputPath.replace(/\.mp4$/, '_description.txt');
  const lines = [];
  lines.push(title);
  lines.push('');
  lines.push(`A ${Math.floor(outDur/60)}-minute compilation of Sara & Eva episodes — perfect for nap-time, car trips, or just settling in for a cozy block of family-friendly cartoons.`);
  lines.push('');
  lines.push('Episode chapters:');
  let acc = 0;
  for (let i = 0; i < sources.length; i++) {
    const ts = `${Math.floor(acc/60)}:${String(Math.floor(acc%60)).padStart(2,'0')}`;
    lines.push(`${ts} Episode ${sources[i].epNum}`);
    acc += sources[i].dur - (i < sources.length - 1 ? xfadeSec : 0);
  }
  lines.push('');
  lines.push('#SaraAndEva #KidsCartoon #Compilation #PreschoolLearning');
  fs.writeFileSync(descPath, lines.join('\n'));
  console.log(`   Description: ${path.basename(descPath)} ✓`);
}

// ─── Compilation thumbnail (grid of episode thumbnails) ─────────────────────
if (!skipThumbnail) {
  const thumbs = sources.map(s => findEpisodeThumbnail(s.epNum)).filter(Boolean);
  if (thumbs.length === 0) {
    console.warn(`   Thumbnail: ⚠ no source thumbnails found, skipping`);
  } else {
    const thumbPath = outputPath.replace(/\.mp4$/, '_thumbnail.jpg');
    // Auto-layout based on count: 2,2x2,3x2,2x3,3x3
    const n = thumbs.length;
    const cols = n <= 2 ? n : (n <= 4 ? 2 : 3);
    const rows = Math.ceil(n / cols);
    // Use ffmpeg's xstack filter to tile
    const inputs = thumbs.flatMap(t => ['-i', t]);
    const layout = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = c === 0 ? '0' : Array(c).fill('w0').join('+');
      const y = r === 0 ? '0' : Array(r).fill('h0').join('+');
      layout.push(`${x}_${y}`);
    }
    const filterComplex = `[${Array.from({length: n}, (_, i) => `${i}:v`).join('][')}]xstack=inputs=${n}:layout=${layout.join('|')}:fill=black,scale=1280:720[out]`;
    const r = spawnSync('ffmpeg', [
      '-y',
      ...inputs,
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-frames:v', '1',
      '-q:v', '3',
      thumbPath,
    ], { stdio: 'pipe' });
    if (r.status === 0) {
      console.log(`   Thumbnail: ${path.basename(thumbPath)} ✓`);
    } else {
      console.warn(`   Thumbnail: ⚠ failed (${r.stderr?.toString().trim().slice(-120)})`);
    }
  }
}

console.log(`\n📤 Upload command (when ready to publish):`);
console.log(`   node uploadEpisodeToSaraAndEva.mjs ${outputPath} \\`);
console.log(`     --title "${title}" \\`);
console.log(`     --description-file ${outputPath.replace(/\.mp4$/, '_description.txt')} \\`);
if (!skipThumbnail) console.log(`     --thumbnail ${outputPath.replace(/\.mp4$/, '_thumbnail.jpg')} \\`);
console.log(`     --privacy unlisted`);
console.log(`   (The auto-add to Season 1 playlist runs automatically.)`);
