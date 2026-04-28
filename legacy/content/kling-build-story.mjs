#!/usr/bin/env node
/**
 * Kling Story Builder
 *
 * Full pipeline after Kling AI clips have been generated:
 *   1. Download all Kling clips watermark-free from the assets page
 *   2. Detect segment durations from audio silence gaps
 *   3. Loop each animated clip to match segment duration, add crossfade
 *   4. Concat all clips + audio → final MP4
 *
 * Uses animated Kling clips DIRECTLY — no Ken Burns fallback needed.
 * Intro clip = anim_000, pages = anim_001..N, outro = last anim clip looped.
 *
 * Prerequisites:
 *   - Chrome running with --remote-debugging-port=9222 (for download step)
 *   - All Kling clips already generated (use kling-batch-generate.mjs first)
 *   - kling_clips.json exists in the story's youtube folder
 *
 * Usage:
 *   node content/kling-build-story.mjs "Stone Soup"
 *   node content/kling-build-story.mjs "Stone Soup" --skip-download   # skip if clips already done
 *   node content/kling-build-story.mjs "Stone Soup" --count 25 --start 0
 *
 * Kling assets page order: newest-first.
 * Clips submitted in scene order → oldest = scene 0 (high page index), newest = last scene (low page index).
 */

import { chromium } from 'playwright';
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FFMPEG  = '/usr/local/bin/ffmpeg';
const FFPROBE = '/usr/local/bin/ffprobe';
const NODE    = '/usr/local/bin/node';

// ── Parse args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const storyTitle = args.find(a => !a.startsWith('--'));
if (!storyTitle) {
  console.error('Usage: node content/kling-build-story.mjs <Story Title> [--count N] [--start N] [--skip-download]');
  process.exit(1);
}

const countIdx   = args.indexOf('--count');
const clipCount  = countIdx  >= 0 ? parseInt(args[countIdx  + 1]) : null; // auto-detect from kling_clips.json
const startIdx   = args.indexOf('--start');
const startFrom  = startIdx  >= 0 ? parseInt(args[startIdx  + 1]) : 0;
const skipDownload = args.includes('--skip-download');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Find story directories ───────────────────────────────────────────────────
const STORIES_DIR = path.join(ROOT, 'exports', 'stories');
const safeName    = storyTitle.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
const matches     = fs.existsSync(STORIES_DIR)
  ? fs.readdirSync(STORIES_DIR).filter(d => d.startsWith(safeName + '_')).sort().reverse()
  : [];
if (matches.length === 0) {
  console.error(`❌ No story export found for "${storyTitle}" in ${STORIES_DIR}`);
  process.exit(1);
}
const storyRoot   = path.join(STORIES_DIR, matches[0]);
const youtubeDir  = path.join(storyRoot, 'youtube', safeName);
const animDir     = path.join(youtubeDir, 'illustrations', 'animated');
const clipsDir    = path.join(youtubeDir, 'clips');
const clipsJson   = path.join(youtubeDir, 'kling_clips.json');

if (!fs.existsSync(clipsJson)) {
  console.error(`❌ kling_clips.json not found at ${clipsJson}`);
  console.error('   Run kling-batch-generate.mjs first to generate clips.');
  process.exit(1);
}

const klingClips = JSON.parse(fs.readFileSync(clipsJson, 'utf8'));
const totalClips = clipCount ?? klingClips.length;

console.log(`\n🎬 Kling Build Pipeline: "${storyTitle}"`);
console.log(`   Story dir : ${storyRoot}`);
console.log(`   Clips     : ${totalClips} Kling clips`);
console.log(`   Anim dir  : ${animDir}\n`);

fs.mkdirSync(animDir, { recursive: true });

// ── Step 1: Download clips watermark-free ───────────────────────────────────
if (!skipDownload) {
  console.log('📥 Step 1: Downloading Kling clips watermark-free...\n');

  // Check which clips already exist
  const missing = [];
  for (let i = startFrom; i < totalClips; i++) {
    const outPath = path.join(animDir, `anim_${String(i).padStart(3, '0')}.mp4`);
    if (!fs.existsSync(outPath)) missing.push(i);
  }

  if (missing.length === 0) {
    console.log('   ✅ All clips already downloaded — skipping.\n');
  } else {
    console.log(`   Downloading ${missing.length} missing clips...\n`);
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0] || await ctx.newPage();

    // ── Batch download: Select all clips → "Download without Watermark" ──
    // Navigate to assets page
    await page.goto('https://kling.ai/app/user-assets/materials?ac=1', { waitUntil: 'load', timeout: 30000 });
    await sleep(4000);

    // Scroll to load all clips
    for (let s = 0; s < 15; s++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await sleep(800);
    }
    await sleep(2000);

    // Click "Select" button to enter selection mode
    console.log('   📌 Entering selection mode...');
    await page.getByRole('button', { name: 'Select' }).click();
    await sleep(1500);

    // Select the first N clips (our story's clips are the most recent)
    console.log(`   ☑️  Selecting ${totalClips} clips...`);
    const checkboxes = page.locator('.svg-icon.video-item-checkbox > .svg-icon');
    const checkboxCount = await checkboxes.count();
    console.log(`   Found ${checkboxCount} checkboxes on page`);

    const toSelect = Math.min(totalClips, checkboxCount);
    for (let i = 0; i < toSelect; i++) {
      try {
        const cb = checkboxes.nth(i);
        await cb.scrollIntoViewIfNeeded();
        await cb.click({ timeout: 3000 });
        await sleep(300);
      } catch (e) {
        console.log(`   ⚠️  Could not select checkbox ${i}: ${e.message.slice(0, 60)}`);
      }
    }
    console.log(`   ✅ Selected ${toSelect} clips`);
    await sleep(1000);

    // Hover "Download" button to open dropdown, then click "Download without Watermark"
    console.log('   📥 Downloading without watermark...');
    const dlBtn = page.getByRole('button', { name: 'Download' });
    await dlBtn.hover();
    await sleep(2000);
    const downloadPromise = page.waitForEvent('download', { timeout: 300000 }); // 5 min timeout for zip
    await page.locator('.el-dropdown-menu__item').filter({ hasText: 'Download without Watermark' }).click();

    const download = await downloadPromise;
    const zipPath = path.join(storyRoot, 'kling_clips.zip');
    await download.saveAs(zipPath);
    const zipSize = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
    console.log(`   📦 Downloaded zip: ${zipSize} MB`);

    // Extract zip with Python (handles unicode filenames that unzip can't)
    // Kling downloads newest first = last clip first, so reverse to match our order
    const { execSync: exec } = await import('child_process');
    exec(`python3 -c "
import zipfile, os, shutil
z = zipfile.ZipFile('${zipPath}', 'r')
mp4s = sorted([f for f in z.namelist() if f.endswith('.mp4')])
print(f'Found {len(mp4s)} MP4s in zip')
for i, name in enumerate(reversed(mp4s)):
    out = os.path.join('${animDir}', f'anim_{i:03d}.mp4')
    if os.path.exists(out):
        print(f'  [{i}] exists')
        continue
    with z.open(name) as src, open(out, 'wb') as dst:
        shutil.copyfileobj(src, dst)
    sz = os.path.getsize(out) / 1024 / 1024
    print(f'  [{i}] anim_{i:03d}.mp4 — {sz:.1f} MB')
z.close()
"`, { timeout: 60000, stdio: 'inherit' });

    // Verify downloads
    let downloaded = 0;
    for (let i = 0; i < totalClips; i++) {
      const p = path.join(animDir, `anim_${String(i).padStart(3, '0')}.mp4`);
      if (fs.existsSync(p)) {
        const sz = (fs.statSync(p).size / 1024 / 1024).toFixed(1);
        console.log(`   [${i}] ✅ anim_${String(i).padStart(3,'0')}.mp4 — ${sz} MB (watermark-free)`);
        downloaded++;
      } else {
        console.log(`   [${i}] ❌ Missing`);
      }
    }
    console.log(`\n   📊 ${downloaded} downloaded, ${totalClips - downloaded} missing\n`);
  }
} else {
  console.log('⏩ Step 1: Skipping download (--skip-download)\n');
}

// ── Step 2: Detect segment durations from audio ────────────────────────────
console.log('🔨 Step 2: Detecting segment durations from audio...\n');

const mp4Path   = path.join(youtubeDir, `${safeName}.mp4`);
// Use MP3 from spotify dir directly (no copy to youtube dir)
const spotifyDir = path.join(storyRoot, 'spotify');
const spotifyMp3 = fs.existsSync(spotifyDir)
  ? fs.readdirSync(spotifyDir).find(f => f.endsWith('.mp3'))
  : null;
const mp3Path = spotifyMp3
  ? path.join(spotifyDir, spotifyMp3)
  : path.join(youtubeDir, `${safeName}.mp3`);
const concatFile = path.join(youtubeDir, `${safeName}_concat.txt`);

if (!fs.existsSync(mp3Path)) {
  console.error(`❌ No MP3 found in spotify dir or youtube dir`);
  process.exit(1);
}

// Get audio duration
const audioDur = parseFloat(
  execSync(`${FFPROBE} -v quiet -show_entries format=duration -of csv=p=0 "${mp3Path}"`, { encoding: 'utf8' }).trim()
);
console.log(`   🔊 Audio: ${(audioDur / 60).toFixed(1)} min (${audioDur.toFixed(1)}s)`);

// Detect silence gaps to find page boundaries
const silenceRaw = execSync(
  `${FFMPEG} -i "${mp3Path}" -af silencedetect=noise=-35dB:d=1.5 -f null - 2>&1`,
  { encoding: 'utf8', timeout: 120000 }
);

// Parse silence_end timestamps
const silenceEnds = [];
for (const m of silenceRaw.matchAll(/silence_end:\s*([\d.]+)/g)) {
  silenceEnds.push(parseFloat(m[1]));
}

// Build segment boundaries: [0, gap1, gap2, ..., audioDur]
// We expect totalClips + 1 segments (intro + N pages + outro)
// The kling_clips.json has totalClips entries mapping to: intro(0) + pages(1..N-1) or pages(0..N-1)
// Typically: anim_000 = intro, anim_001..025 = pages 1-25, outro reuses last clip
const expectedSegments = totalClips + 1; // +1 for outro
const boundaries = [0];

// Use silence gaps as boundaries, picking the ones that best split into expected segments
if (silenceEnds.length >= expectedSegments - 1) {
  // More silences than segments — pick evenly spaced ones
  const step = silenceEnds.length / (expectedSegments - 1);
  for (let i = 0; i < expectedSegments - 1; i++) {
    boundaries.push(silenceEnds[Math.min(Math.round(i * step), silenceEnds.length - 1)]);
  }
} else {
  // Use all silences, may have fewer segments
  boundaries.push(...silenceEnds);
}
boundaries.push(audioDur);

const segmentDurations = [];
for (let i = 0; i < boundaries.length - 1; i++) {
  segmentDurations.push(boundaries[i + 1] - boundaries[i]);
}
console.log(`   ⏱️  Found ${segmentDurations.length} segments from silence detection`);

// ── Step 3: Loop animated clips to segment durations ────────────────────────
console.log('\n🎞️  Step 3: Building clips from Kling animations...\n');

const animFiles = fs.existsSync(animDir)
  ? fs.readdirSync(animDir).filter(f => /^anim_\d+\.mp4$/.test(f)).sort()
  : [];

if (animFiles.length === 0) {
  console.error('❌ No animated clips found in ' + animDir);
  process.exit(1);
}

const CROSSFADE = 1;
const RESOLUTION = '1280:1280';
fs.mkdirSync(clipsDir, { recursive: true });

// Back up old MP4
if (fs.existsSync(mp4Path)) {
  const backupPath = path.join(youtubeDir, `${safeName}_prev.mp4`);
  if (!fs.existsSync(backupPath)) {
    fs.renameSync(mp4Path, backupPath);
    console.log(`   💾 Backed up old MP4\n`);
  }
}

const concatLines = [];

for (let i = 0; i < segmentDurations.length; i++) {
  const dur = segmentDurations[i];
  const idx = String(i).padStart(3, '0');
  const clipPath = path.join(clipsDir, `clip_${idx}.mp4`);

  // Map segment to animated clip:
  // Segments 0..totalClips-1 map to anim_000..anim_N
  // Extra segments (outro) reuse the last animated clip
  let animIdx = Math.min(i, animFiles.length - 1);
  const animPath = path.join(animDir, animFiles[animIdx]);

  const fadeOut = Math.max(0, dur - CROSSFADE);

  process.stdout.write(`   🎞️  Clip ${i + 1}/${segmentDurations.length} (${dur.toFixed(1)}s) ← ${animFiles[animIdx]}`);

  try {
    execSync(
      `${FFMPEG} -y -stream_loop -1 -i "${animPath}" ` +
      `-vf "scale=${RESOLUTION}:force_original_aspect_ratio=decrease,pad=${RESOLUTION}:(ow-iw)/2:(oh-ih)/2:black,` +
      `fade=t=in:st=0:d=${CROSSFADE},fade=t=out:st=${fadeOut.toFixed(3)}:d=${CROSSFADE}" ` +
      `-t ${dur.toFixed(3)} -c:v libx264 -preset fast -pix_fmt yuv420p -an "${clipPath}"`,
      { stdio: 'ignore', timeout: 120000 }
    );
    console.log(' ✅');
  } catch (e) {
    console.log(` ❌ ${e.message.slice(0, 60)}`);
  }

  concatLines.push(`file '${clipPath}'`);
}

// Write concat file
fs.writeFileSync(concatFile, concatLines.join('\n') + '\n');
console.log(`\n   📋 Wrote ${concatLines.length} clips to concat file`);

// ── Step 4: Final MP4 assembly ─────────────────────────────────────────────
console.log('\n🎬 Step 4: Final MP4 assembly...\n');

execSync(
  `${FFMPEG} -y -f concat -safe 0 -i "${concatFile}" -i "${mp3Path}" ` +
  `-map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k ` +
  `-t ${audioDur.toFixed(3)} "${mp4Path}"`,
  { stdio: 'ignore', timeout: 1800000 }
);

const size = (fs.statSync(mp4Path).size / 1024 / 1024).toFixed(1);
console.log(`   ✅ Final MP4: ${mp4Path}`);
console.log(`   📦 Size: ${size} MB\n`);

console.log(`${'═'.repeat(60)}`);
console.log(`✅ Done! "${storyTitle}" MP4 built with Kling animations.`);
console.log(`   ${mp4Path}`);
console.log(`${'═'.repeat(60)}\n`);
