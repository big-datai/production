#!/usr/bin/env node
/**
 * Sequential video queue — runs generateYoutubeVideos.mjs for each story ONE AT A TIME.
 * Running multiple stories in parallel causes OOM crashes during ffmpeg clip building.
 *
 * Usage:
 *   node content/podcast/buildAllVideos.mjs                  → build all missing videos
 *   node content/podcast/buildAllVideos.mjs "Story A" "Story B"  → specific stories only
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Stories to process — pass names as CLI args, or leave empty to auto-detect missing
const cliStories = process.argv.slice(2);

// Auto-detect missing videos from story export folders
const STORIES_DIR = path.resolve(__dirname, '../../exports/stories');

function getMissingVideos() {
  if (!fs.existsSync(STORIES_DIR)) return [];
  const storyNames = [];
  for (const dir of fs.readdirSync(STORIES_DIR)) {
    const storyRoot = path.join(STORIES_DIR, dir);
    if (!fs.statSync(storyRoot).isDirectory()) continue;
    // Extract SafeTitle from folder name (remove _MMDDYYYY suffix)
    const match = dir.match(/^(.+)_\d{8}$/);
    if (!match) continue;
    const safeName = match[1];
    // Check if MP3 exists but MP4 doesn't
    const mp3 = path.join(storyRoot, 'spotify', `${safeName}.mp3`);
    const mp4 = path.join(storyRoot, 'youtube', safeName, `${safeName}.mp4`);
    if (fs.existsSync(mp3) && !fs.existsSync(mp4)) {
      storyNames.push(safeName.replace(/_/g, ' '));
    }
  }
  return storyNames;
}

const queue = cliStories.length > 0
  ? cliStories
  : getMissingVideos();

if (queue.length === 0) {
  console.log('✅ Nothing to build — all videos already exist!');
  process.exit(0);
}

console.log(`\n📋 Queue: ${queue.length} stories to build (one at a time)\n`);
queue.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));
console.log('');

const scriptPath = path.resolve(__dirname, 'generateYoutubeVideos.mjs');
let success = 0;
let failed = 0;

for (let i = 0; i < queue.length; i++) {
  const story = queue[i];
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[${i + 1}/${queue.length}] 🎬 Building: ${story}`);
  console.log('═'.repeat(60));
  
  try {
    execFileSync('node', ['--max-old-space-size=512', scriptPath, story], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '../../'),
    });
    success++;
    console.log(`\n✅ Done: ${story}`);
  } catch (err) {
    failed++;
    console.error(`\n❌ FAILED: ${story} — ${err.message}`);
    console.log('   Illustrations are cached. Re-run the queue to retry.\n');
  }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`📊 Final: ${success} succeeded, ${failed} failed`);
console.log('═'.repeat(60));
