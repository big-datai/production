#!/usr/bin/env node
/**
 * Bulk-download Kling videos WITHOUT WATERMARK.
 *
 * Uses the codegen-verified selectors:
 *   - Multi-select mode: getByRole('button', { name: 'Select' })
 *   - Tile checkbox: .svg-icon.video-item-checkbox > .svg-icon
 *   - Download w/o watermark: getByRole('menuitem', { name: 'Download without Watermark' })
 *
 * Strategy:
 *   1. Navigate to materials page
 *   2. Enter Select mode
 *   3. SCROLL the materials grid to load ALL of today's renders into DOM
 *   4. Tick every visible video tile (or first N)
 *   5. Click "Download without Watermark" menuitem (NOT plain "Download")
 *   6. Save resulting ZIP(s) — handles multiple downloads if Kling chunks them
 *
 * Usage:
 *   node .../downloadAllNoWatermark.mjs <out_dir> [--max N] [--scroll N]
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const OUT_DIR = path.resolve(argv.find(a => !a.startsWith("--")) || "season_01/episode_02/clips");
const MAX = Number(argv.includes("--max") ? argv[argv.indexOf("--max") + 1] : 30);
const SCROLLS = Number(argv.includes("--scroll") ? argv[argv.indexOf("--scroll") + 1] : 5);
fs.mkdirSync(OUT_DIR, { recursive: true });
console.log(`📂 Out: ${OUT_DIR}`);
console.log(`🎯 Max tiles to tick: ${MAX}`);
console.log(`📜 Scroll iterations: ${SCROLLS}`);

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

// Capture downloads — Kling may emit 1-3 ZIPs depending on selection size
let dlCount = 0;
const savedZips = [];
page.on("download", async (download) => {
  const out = path.join(OUT_DIR, `nowatermark_${Date.now()}_${dlCount}.zip`);
  await download.saveAs(out);
  const sz = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
  console.log(`  📥 ZIP saved: ${path.basename(out)} (${sz} MB)`);
  savedZips.push(out);
  dlCount += 1;
});

// Navigate to materials page
if (!page.url().includes("/user-assets/materials")) {
  console.log("→ Navigating to materials page...");
  await page.goto("https://kling.ai/app/user-assets/materials?ac=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
}

// Dismiss any toast notification that may intercept clicks
await page.locator('[role="alert"] .close, .el-notification__closeBtn').first().click({ timeout: 1500 }).catch(()=>{});
await page.waitForTimeout(500);

// Click "Select" to enter multi-select mode
console.log("\n→ Entering Select mode...");
await page.getByRole("button", { name: "Select" }).click({ timeout: 8000 }).catch(async () => {
  // If "Select" button not found, may already be in select mode
  console.log("  (Select button not found — may already be in multi-select mode)");
});
await page.waitForTimeout(1500);

// SCROLL the grid down N times to load older renders into DOM
console.log(`\n→ Scrolling ${SCROLLS}× to load all today's renders into DOM...`);
for (let i = 0; i < SCROLLS; i++) {
  await page.evaluate(() => {
    // Find the scrollable container — usually a virtual-list or material-list parent
    const containers = [
      ...document.querySelectorAll('[class*="virtual-list"]'),
      ...document.querySelectorAll('[class*="material"]'),
      ...document.querySelectorAll('.scroll-container'),
    ];
    let scrolled = false;
    for (const c of containers) {
      if (c.scrollHeight > c.clientHeight + 100) {
        c.scrollBy(0, 800);
        scrolled = true;
      }
    }
    if (!scrolled) window.scrollBy(0, 800);
  });
  await page.waitForTimeout(800);
}

// Tick every visible video tile checkbox
console.log(`\n→ Ticking video tile checkboxes (max ${MAX})...`);
const checkboxes = await page.$$('.svg-icon.video-item-checkbox > .svg-icon');
console.log(`  Found ${checkboxes.length} tile checkboxes in DOM`);
let ticked = 0;
for (const cb of checkboxes) {
  if (ticked >= MAX) break;
  try {
    await cb.scrollIntoViewIfNeeded();
    await cb.click({ force: true, timeout: 2500 });
    ticked += 1;
    if (ticked % 5 === 0) console.log(`    ☑ ticked ${ticked}/${checkboxes.length}`);
    await page.waitForTimeout(120);
  } catch (e) {
    // Skip stuck tiles
  }
}
console.log(`  ☑ Total ticked: ${ticked}`);

if (ticked === 0) {
  console.error("❌ No tiles ticked — check Kling UI state. Aborting.");
  await browser.close();
  process.exit(1);
}

await page.waitForTimeout(1000);

// HOVER over Download button to open dropdown, then click "Download without Watermark"
// Kling's Download is a hover-dropdown, not a click-dropdown.
console.log("\n→ Hovering Download button to open dropdown...");
const downloadBtn = page.locator('button:has-text("Download"), [class*="download"]:has-text("Download")').first();
await downloadBtn.hover({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(800);

console.log("→ Clicking 'Download without Watermark' menuitem...");
try {
  await page.getByRole("menuitem", { name: "Download without Watermark" }).click({ timeout: 8000 });
  console.log("  ✓ Clicked Download without Watermark");
} catch (e) {
  console.error(`❌ Could not click 'Download without Watermark' menuitem: ${e.message.slice(0,100)}`);
  console.error("   Hover may have closed before click — try increasing wait or use force-click");
  await browser.close();
  process.exit(2);
}

// Wait for download events
console.log("\n⏳ Waiting up to 90s for downloads...");
const startCount = dlCount;
for (let s = 0; s < 90; s++) {
  await page.waitForTimeout(1000);
  if (s > 5 && dlCount === startCount && s > 30) break; // No more downloads after 30s
  if (dlCount >= 5) break; // Got plenty
}
console.log(`\n📊 Downloaded ${dlCount} ZIP(s):`);
for (const z of savedZips) console.log(`   • ${path.basename(z)}`);

// Auto-extract via ditto (handles CJK filenames Kling uses)
if (savedZips.length > 0) {
  console.log("\n→ Extracting via ditto...");
  const tmpDir = `/tmp/ep2-extract-${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const z of savedZips) {
    try {
      execSync(`ditto -x -k "${z}" "${tmpDir}"`);
    } catch (e) {
      console.error(`  ⚠ extract failed for ${path.basename(z)}: ${e.message.slice(0, 80)}`);
    }
  }
  // Dedupe by job ID + move to OUT_DIR
  const seenIds = new Set();
  const mp4s = fs.readdirSync(tmpDir).filter(f => f.endsWith(".mp4"));
  let staged = 0;
  for (const f of mp4s) {
    const m = f.match(/_(\d+)_0\.mp4$/);
    const id = m?.[1];
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    const dest = path.join(OUT_DIR, `kling_job_${id}.mp4`);
    if (!fs.existsSync(dest)) {
      // copyFileSync + unlinkSync to handle cross-volume moves (/tmp → /Volumes/Samsung500)
      fs.copyFileSync(path.join(tmpDir, f), dest);
      fs.unlinkSync(path.join(tmpDir, f));
      staged += 1;
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`✓ ${staged} unique clips staged to ${OUT_DIR}`);

  // Clean up zips after successful extract
  for (const z of savedZips) fs.unlinkSync(z);
  console.log(`✓ ZIPs cleaned up`);
}

await browser.close();
