#!/usr/bin/env node

/**
 * Trim first 18 seconds from YouTube videos using YouTube Studio Editor.
 * Uses Playwright to automate the YouTube Studio UI (no API for trimming).
 *
 * Usage:
 *   node content/podcast/trimYoutubeIntros.mjs                    # trim all main story videos
 *   node content/podcast/trimYoutubeIntros.mjs --id VIDEO_ID      # trim one video
 *   node content/podcast/trimYoutubeIntros.mjs --dry-run          # show what would be trimmed
 *
 * Prerequisites:
 *   - Chrome running with --remote-debugging-port=9222
 *   - Signed into YouTube Studio in Chrome
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const TRIM_SECONDS = 18;

// Get video IDs from seedBednightStories.mjs
function getVideoIds() {
  const seedFile = path.resolve("content/podcast/seedBednightStories.mjs");
  const content = fs.readFileSync(seedFile, "utf8");
  const block = content.match(/const YOUTUBE_IDS = \{([\s\S]*?)\};/);
  if (!block) return [];
  const ids = [];
  for (const [, title, id] of block[1].matchAll(/['"]([^'"]+)['"]:\s*'([^']+)'/g)) {
    ids.push({ title, id });
  }
  return ids;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const singleId = args.find((a) => a.startsWith("--id="))?.split("=")[1] ||
  (args.indexOf("--id") !== -1 ? args[args.indexOf("--id") + 1] : null);

const videos = singleId
  ? [{ title: "Single video", id: singleId }]
  : getVideoIds();

console.log(`\n✂️  YouTube Intro Trimmer — ${TRIM_SECONDS}s from start`);
console.log(`   ${videos.length} videos to process\n`);

if (dryRun) {
  for (const v of videos) {
    console.log(`  Would trim: ${v.id} — ${v.title}`);
  }
  console.log(`\n  Dry run — no changes made.`);
  process.exit(0);
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const context = browser.contexts()[0];
const page = await context.newPage();

let trimmed = 0;
let failed = 0;
let skipped = 0;

for (const video of videos) {
  console.log(`  ✂️  ${video.title} (${video.id})...`);

  try {
    // Navigate to YouTube Studio Editor
    await page.goto(`https://studio.youtube.com/video/${video.id}/editor`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    // Dismiss any dialogs/cookie banners
    try {
      const dismiss = page.locator('button:has-text("Got it"), button:has-text("Dismiss")');
      if (await dismiss.isVisible({ timeout: 2000 })) await dismiss.click();
    } catch {}

    // Click "Trim & cut" button
    const trimBtn = page.locator('button:has-text("Trim & cut"), ytcp-button:has-text("Trim")');
    try {
      await trimBtn.waitFor({ state: "visible", timeout: 10000 });
      await trimBtn.click();
      await page.waitForTimeout(2000);
    } catch {
      console.log(`     ⏩ No trim button — may already be trimmed or not supported`);
      skipped++;
      continue;
    }

    // The trim UI shows a timeline. We need to set the start trim to 18 seconds.
    // YouTube Studio uses an input field for precise trim times.
    // Look for the start time input
    const startInput = page.locator('input[aria-label="Start time"], #start-time-input, input.trim-start');
    try {
      await startInput.waitFor({ state: "visible", timeout: 5000 });
      await startInput.click({ clickCount: 3 }); // Select all
      await startInput.fill("0:00:18.000");
      await page.waitForTimeout(1000);
    } catch {
      // Try alternative: drag the trim handle
      console.log(`     ⚠️  No start time input — trying manual approach`);
      // Take screenshot for debugging
      await page.screenshot({ path: `/tmp/trim_debug_${video.id}.png` });
      skipped++;
      continue;
    }

    // Click "Save" or "Done"
    const saveBtn = page.locator('button:has-text("Save"), ytcp-button:has-text("Save")');
    try {
      await saveBtn.waitFor({ state: "visible", timeout: 5000 });
      await saveBtn.click();
      await page.waitForTimeout(3000);

      // Confirm if needed
      const confirmBtn = page.locator('button:has-text("Save"), button:has-text("Confirm")');
      if (await confirmBtn.isVisible({ timeout: 3000 })) {
        await confirmBtn.click();
        await page.waitForTimeout(2000);
      }

      console.log(`     ✅ Trimmed ${TRIM_SECONDS}s`);
      trimmed++;
    } catch {
      console.log(`     ❌ Could not save trim`);
      await page.screenshot({ path: `/tmp/trim_error_${video.id}.png` });
      failed++;
    }
  } catch (e) {
    console.log(`     ❌ Error: ${e.message.slice(0, 80)}`);
    failed++;
  }

  // Small delay between videos
  await page.waitForTimeout(2000);
}

console.log(`\n✅ Done: ${trimmed} trimmed, ${skipped} skipped, ${failed} failed\n`);
await page.close();
