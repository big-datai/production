#!/usr/bin/env node
/**
 * Generate a YouTube Short (60s vertical 9:16) from a completed story MP4.
 *
 * Takes the most engaging 60 seconds (pages with most action = highest word
 * counts), crops the square video to 1080x1920 vertical, burns in subtitles,
 * and adds a title card intro.
 *
 * Usage:
 *   node content/podcast/generateYoutubeShort.mjs "Stone Soup"
 *   node content/podcast/generateYoutubeShort.mjs "Stone Soup" --start 0   # force start time (seconds)
 *   node content/podcast/generateYoutubeShort.mjs "Stone Soup" --duration 58
 *
 * Output: exports/stories/<Name>_<date>/youtube/<Name>/<Name>_short.mp4
 */

import { execSync } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const STORIES_DIR = path.join(ROOT, 'exports', 'stories');

// ── CLI args ──
const args = process.argv.slice(2);
const titleArg = args.find(a => !a.startsWith('--'));
const startIdx = args.indexOf('--start');
const forceStart = startIdx >= 0 ? parseFloat(args[startIdx + 1]) : null;
const durIdx = args.indexOf('--duration');
const SHORT_DURATION = durIdx >= 0 ? parseFloat(args[durIdx + 1]) : 58; // <60s for YouTube Shorts

if (!titleArg) {
  console.error('Usage: node generateYoutubeShort.mjs "<Story Title>" [--start N] [--duration N]');
  process.exit(1);
}

// ── Find story folder ──
function findStoryDir(title) {
  const safe = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  if (!fs.existsSync(STORIES_DIR)) return null;
  const matches = fs.readdirSync(STORIES_DIR)
    .filter(d => d.startsWith(safe + '_'))
    .sort().reverse();
  if (!matches.length) return null;
  return path.join(STORIES_DIR, matches[0]);
}

// ── Parse SRT to get timed segments ──
function parseSRT(srtPath) {
  const content = fs.readFileSync(srtPath, 'utf8');
  const blocks = content.trim().split(/\n\n+/);
  const segments = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;
    const timeLine = lines[1];
    const m = timeLine.match(/(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)/);
    if (!m) continue;
    const start = +m[1]*3600 + +m[2]*60 + +m[3] + +m[4]/1000;
    const end   = +m[5]*3600 + +m[6]*60 + +m[7] + +m[8]/1000;
    const text  = lines.slice(2).join(' ');
    segments.push({ start, end, text, duration: end - start });
  }
  return segments;
}

// ── Find best 60s window by word density ──
function findBestWindow(segments, windowDuration) {
  if (!segments.length) return 0;

  const totalDuration = segments[segments.length - 1].end;
  let bestStart = 0;
  let bestWords = 0;

  // Slide window in 5s steps
  for (let t = 0; t + windowDuration <= totalDuration; t += 5) {
    const inWindow = segments.filter(s => s.start >= t && s.end <= t + windowDuration);
    const words = inWindow.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
    if (words > bestWords) {
      bestWords = words;
      bestStart = t;
    }
  }

  // Prefer the opening (first 60s) if it's within 80% of the best word count
  const openingWords = segments
    .filter(s => s.start >= 0 && s.end <= windowDuration)
    .reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
  if (openingWords >= bestWords * 0.8) {
    bestStart = 0;
  }

  return bestStart;
}

// ── Write a trimmed SRT for the short ──
function writeShortSRT(segments, startTime, duration, outputPath) {
  const endTime = startTime + duration;
  const relevant = segments.filter(s => s.start < endTime && s.end > startTime);
  const lines = [];
  relevant.forEach((seg, i) => {
    const s = Math.max(0, seg.start - startTime);
    const e = Math.min(duration, seg.end - startTime);
    const fmt = t => {
      const h = Math.floor(t / 3600).toString().padStart(2, '0');
      const m = Math.floor((t % 3600) / 60).toString().padStart(2, '0');
      const s = Math.floor(t % 60).toString().padStart(2, '0');
      const ms = Math.round((t % 1) * 1000).toString().padStart(3, '0');
      return `${h}:${m}:${s},${ms}`;
    };
    lines.push(`${i + 1}\n${fmt(s)} --> ${fmt(e)}\n${seg.text}\n`);
  });
  fs.writeFileSync(outputPath, lines.join('\n'));
  return lines.length;
}

// ── Build the Short ──
function buildShort(mp4Path, srtPath, title, startTime, duration, outputPath) {
  const safeTitle = title.replace(/'/g, "\\'");

  // Step 1: Trim + crop square→vertical (1280x1280 → crop to 720x1280, scale to 1080x1920)
  // Center-crop the square to 9:16, then scale up
  const tempCropPath = outputPath.replace('_short.mp4', '_short_crop.mp4');

  console.log(`   ✂️  Trimming ${startTime.toFixed(1)}s → ${(startTime + duration).toFixed(1)}s (${duration}s)`);
  execSync(
    `/usr/local/bin/ffmpeg -y -ss ${startTime.toFixed(3)} -i "${mp4Path}" -t ${duration.toFixed(3)} ` +
    `-vf "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920:flags=lanczos" ` +
    `-c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 192k ` +
    `"${tempCropPath}"`,
    { stdio: 'pipe', timeout: 300000 }
  );

  // Step 2: Write trimmed SRT
  const shortSrtPath = outputPath.replace('_short.mp4', '_short.srt');
  if (fs.existsSync(srtPath)) {
    const segments = parseSRT(srtPath);
    const count = writeShortSRT(segments, startTime, duration, shortSrtPath);
    console.log(`   📝 Wrote ${count} subtitle segments`);
  }

  // Step 3: Burn subtitles + title card overlay
  const subtitleFilter = fs.existsSync(shortSrtPath)
    ? `subtitles='${shortSrtPath.replace(/'/g, "\\'")}':force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=80'`
    : null;

  // Title card: story name at top for first 3 seconds
  const titleFilter = `drawtext=text='${safeTitle}':fontsize=52:fontcolor=white:x=(w-text_w)/2:y=120:box=1:boxcolor=black@0.55:boxborderw=12:enable='lt(t,3)'`;

  // Goreadling branding at bottom
  const brandFilter = `drawtext=text='goreadling.com':fontsize=28:fontcolor=white@0.7:x=(w-text_w)/2:y=h-60:enable='gte(t,2)'`;

  const vfParts = [subtitleFilter, titleFilter, brandFilter].filter(Boolean);
  const vf = vfParts.join(',');

  console.log(`   🎨 Burning subtitles + title card...`);
  execSync(
    `/usr/local/bin/ffmpeg -y -i "${tempCropPath}" ` +
    `-vf "${vf}" ` +
    `-c:v libx264 -preset fast -pix_fmt yuv420p -c:a copy ` +
    `"${outputPath}"`,
    { stdio: 'pipe', timeout: 300000 }
  );

  // Cleanup temp
  fs.unlinkSync(tempCropPath);

  const size = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
  console.log(`   ✅ Short ready: ${outputPath} (${size} MB)`);
}

// ── Main ──
async function main() {
  const storyRoot = findStoryDir(titleArg);
  if (!storyRoot) {
    console.error(`❌ No story folder found for "${titleArg}" in ${STORIES_DIR}`);
    process.exit(1);
  }

  const safe = titleArg.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  const youtubeDir = path.join(storyRoot, 'youtube', safe);
  const mp4Path = path.join(youtubeDir, `${safe}.mp4`);
  const srtPath = path.join(youtubeDir, `${safe}.srt`);
  const shortPath = path.join(youtubeDir, `${safe}_short.mp4`);

  if (!fs.existsSync(mp4Path)) {
    console.error(`❌ MP4 not found: ${mp4Path}`);
    process.exit(1);
  }

  console.log(`\n🎬 Generating YouTube Short for: ${titleArg}`);
  console.log(`   Source: ${mp4Path}`);
  console.log(`   Output: ${shortPath}`);

  // Determine start time
  let startTime = forceStart ?? 0;
  if (forceStart === null && fs.existsSync(srtPath)) {
    const segments = parseSRT(srtPath);
    startTime = findBestWindow(segments, SHORT_DURATION);
    console.log(`   📊 Best ${SHORT_DURATION}s window starts at ${startTime.toFixed(1)}s`);
  }

  buildShort(mp4Path, srtPath, titleArg, startTime, SHORT_DURATION, shortPath);

  console.log(`\n✅ YouTube Short complete!`);
  console.log(`   File : ${shortPath}`);
  console.log(`   Upload as a YouTube Short (vertical, <60s, add #Shorts to title/desc)`);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
