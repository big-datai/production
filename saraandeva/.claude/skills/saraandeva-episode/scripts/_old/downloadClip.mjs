#!/usr/bin/env node
/**
 * Auto-download latest Kling videos using the captured UI flow:
 *   1. Navigate to /app/user-assets
 *   2. Click "Videos" tab
 *   3. Click "Select" mode
 *   4. Tick the first N thumbnails
 *   5. Click "Download without Watermark"
 *   6. Listen for `page.on("download")` and save directly to target dir
 *
 * Usage:
 *   node content/saraandeva/downloadKlingClips.mjs [OUT_DIR] [N]
 *
 * Defaults:
 *   OUT_DIR: season_01/intro/clips
 *   N:       3 (latest 3 videos)
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const OUT_DIR = path.resolve(
  process.argv[2] || path.join(ROOT, "season_01/intro/clips")
);
const N = Number(process.argv[3] || 3);
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log(`📂 Output dir: ${OUT_DIR}`);
console.log(`🎯 Target: latest ${N} videos\n`);

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
if (!page) { console.error("❌ No Kling tab"); process.exit(1); }
await page.bringToFront();

// Download handler — saves as-is (keeps Kling's original filename)
let downloadedCount = 0;
page.on("download", async (download) => {
  const suggested = download.suggestedFilename();
  // Letter-prefix so we can identify clips: clip_A, clip_B, …
  const letter = ["A","B","C","D","E","F","G","H","I","J"][downloadedCount] || `${downloadedCount}`;
  const ext = path.extname(suggested) || ".mp4";
  const out = path.join(OUT_DIR, `clip_${letter}_raw${ext}`);
  downloadedCount += 1;
  console.log(`📥 Download started: ${suggested}  →  ${path.basename(out)}`);
  try {
    await download.saveAs(out);
    const size = fs.statSync(out).size;
    console.log(`   ✓ ${(size / 1024 / 1024).toFixed(2)} MB`);
  } catch (e) {
    console.log(`   ❌ save failed: ${e.message}`);
  }
});

// Navigate to user-assets (Videos tab has most-recent renders at the top)
const MATERIALS_URL = "https://kling.ai/app/user-assets/materials?ac=1";
console.log(`→ Navigating to ${MATERIALS_URL}`);
await page.goto(MATERIALS_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3000);

// Click "Videos" tab (captured selector: span:has-text("Videos"))
try {
  await page.locator('span:has-text("Videos")').first().click({ timeout: 10000 });
  console.log(`   ✓ Clicked Videos tab`);
  await page.waitForTimeout(2500);
} catch (e) {
  console.log(`   ⚠️  Videos tab click failed (may already be on it): ${e.message.slice(0,80)}`);
}

// Click "Select" to enter multi-select mode
try {
  await page.locator('span:has-text("Select")').first().click({ timeout: 10000 });
  console.log(`   ✓ Clicked Select mode`);
  await page.waitForTimeout(1500);
} catch (e) {
  console.log(`   ❌ Select click failed: ${e.message}`);
  await browser.close();
  process.exit(1);
}

// Tick the first N video thumbnails.
// The `use.svg-icon` capture was the tile-selection checkmark.
// We need to find per-tile checkboxes. Heuristic: find tiles (cards) in
// the grid and click their top-left checkbox area.
console.log(`\n☑ Selecting first ${N} video tiles...`);
const tileCheckboxes = await page.$$('div.video-card, div[class*="card"]:has(video), div[class*="material"] > div:has(video)');
console.log(`   Found ${tileCheckboxes.length} tile candidates`);

// Fallback — use the raw use.svg-icon selector and take the first N that
// are inside the video grid
const selectorsToTry = [
  'div[class*="material"] div[class*="checkbox"], div[class*="material"] input[type="checkbox"]',
  'div[class*="grid"] div[class*="card"] use.svg-icon',
  'div[class*="list"] use.svg-icon',
  "use.svg-icon",
];
let selected = 0;
for (const sel of selectorsToTry) {
  const els = await page.$$(sel);
  if (els.length === 0) continue;
  console.log(`   Using selector: ${sel}  (${els.length} matches)`);
  for (let i = 0; i < Math.min(N, els.length); i++) {
    try {
      await els[i].scrollIntoViewIfNeeded();
      await els[i].click({ force: true, timeout: 5000 });
      selected += 1;
      console.log(`   ☑ Selected #${i + 1}`);
      await page.waitForTimeout(250);
    } catch (e) {
      console.log(`   ⚠️  click #${i + 1} failed: ${e.message.slice(0,60)}`);
    }
  }
  if (selected > 0) break; // first selector that works, use it
}

if (selected === 0) {
  console.log(`\n❌ Couldn't tick any video tiles. Layout may differ from capture.`);
  console.log(`   Manually tick the videos in the browser, then rerun with --skip-select flag.`);
  await browser.close();
  process.exit(1);
}

console.log(`\n   ☑ ${selected} tiles selected. Waiting for UI to update...`);
await page.waitForTimeout(1500);

// Click "Download without Watermark"
console.log(`\n⬇ Triggering Download without Watermark...`);
try {
  await page.locator('li:has-text("Download without Watermark")').first().click({ timeout: 10000 });
  console.log(`   ✓ Clicked`);
} catch (e) {
  // Might be in a dropdown — try clicking a "Download" / "More" button first
  console.log(`   Direct click failed, trying to open the Download menu first...`);
  const menuCandidates = [
    'button:has-text("Download")',
    'div:has-text("Download")',
    'svg[class*="more"], svg[class*="download"]',
  ];
  for (const sel of menuCandidates) {
    try {
      await page.locator(sel).first().click({ timeout: 3000 });
      await page.waitForTimeout(700);
      await page.locator('li:has-text("Download without Watermark")').first().click({ timeout: 5000 });
      console.log(`   ✓ Clicked via ${sel}`);
      break;
    } catch {}
  }
}

// Wait for downloads to complete
console.log(`\n⏳ Waiting up to 60s for downloads to land...`);
const startCount = downloadedCount;
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(1000);
  if (downloadedCount >= Math.min(N, selected)) break;
}

console.log(`\n\n📊 Done. ${downloadedCount} files saved to ${OUT_DIR}`);
if (downloadedCount > 0) {
  for (const f of fs.readdirSync(OUT_DIR)) {
    const stat = fs.statSync(path.join(OUT_DIR, f));
    console.log(`   ${f}  (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  }
}

await browser.close();
