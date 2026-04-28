#!/usr/bin/env node
/**
 * Scroll-aware download for Kling /app/user-assets/materials.
 *
 * Strategy:
 *   1. Navigate to materials, click Videos + Select
 *   2. Scroll the virtual list down through ALL pages to load every tile
 *   3. Iterate tiles top→bottom in chunks of 8 (Kling's batch-download cap)
 *   4. For each chunk: deselect-all → select these 8 → Download w/o Watermark
 *      → save ZIP → ditto-extract → dedupe by job ID
 *
 * This grabs every clip you've rendered, not just the visible top 8.
 *
 * Usage:
 *   node .../downloadAllClips.mjs <out_dir> [--max-rounds N]
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const OUT_DIR = path.resolve(argv.find(a => !a.startsWith("--")) || "exports/saraandeva/season_01/episode_01/clips");
const MAX_ROUNDS = Number(argv.includes("--max-rounds") ? argv[argv.indexOf("--max-rounds")+1] : 5);
fs.mkdirSync(OUT_DIR, { recursive: true });
console.log(`📂 Out: ${OUT_DIR}\n🎯 Max rounds: ${MAX_ROUNDS} (8 clips per round)`);

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

let downloadedCount = 0;
const downloadedJobIds = new Set();
// Pre-populate with what's already on disk (from filename)
for (const f of fs.readdirSync(OUT_DIR)) {
  const m = f.match(/_(\d{4})_/) || f.match(/(\d{4})/);
  if (m) downloadedJobIds.add(m[1]);
}
console.log(`📌 Already on disk: ${downloadedJobIds.size} job IDs`);

page.on("download", async (download) => {
  const tmpZip = path.join(OUT_DIR, `_round_${Date.now()}.zip`);
  await download.saveAs(tmpZip);
  const sz = (fs.statSync(tmpZip).size / 1024 / 1024).toFixed(1);
  console.log(`  📥 ZIP saved (${sz} MB) — extracting…`);

  const tmpExtract = `/tmp/kling-r-${Date.now()}`;
  fs.mkdirSync(tmpExtract);
  try {
    execSync(`ditto -x -k "${tmpZip}" "${tmpExtract}"`);
    for (const f of fs.readdirSync(tmpExtract)) {
      if (!f.endsWith(".mp4")) continue;
      const id = (f.match(/_(\d{4})_/) || [])[1];
      if (!id || downloadedJobIds.has(id)) {
        fs.unlinkSync(path.join(tmpExtract, f));
        continue;
      }
      downloadedJobIds.add(id);
      const dest = path.join(OUT_DIR, `kling_job_${id}.mp4`);
      fs.renameSync(path.join(tmpExtract, f), dest);
      downloadedCount += 1;
      console.log(`  + ${path.basename(dest)}  (${(fs.statSync(dest).size/1024/1024).toFixed(1)} MB)`);
    }
  } catch (e) {
    console.log(`  ⚠ extract failed: ${e.message.slice(0, 100)}`);
  }
  fs.rmSync(tmpExtract, { recursive: true, force: true });
  fs.unlinkSync(tmpZip);
});

await page.goto("https://kling.ai/app/user-assets/materials?ac=1", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

await page.locator('span:has-text("Videos")').first().click({ timeout: 8000 }).catch(()=>{});
await page.waitForTimeout(1500);

await page.locator('span:has-text("Select")').first().click({ timeout: 8000 }).catch(()=>{});
await page.waitForTimeout(1500);

for (let round = 0; round < MAX_ROUNDS; round++) {
  console.log(`\n══════ ROUND ${round + 1}/${MAX_ROUNDS} ══════`);

  // Scroll down by N viewports to reveal older renders
  if (round > 0) {
    await page.evaluate(scrollPast => {
      // Find the materials list scroll container — virtual list is usually
      // a scrollable parent of the tiles
      const tiles = document.querySelectorAll('[class*="material"] [class*="card"], [class*="virtual-list"] > *');
      if (!tiles.length) { window.scrollBy(0, scrollPast); return; }
      let parent = tiles[0].parentElement;
      while (parent && parent.scrollHeight <= parent.clientHeight) parent = parent.parentElement;
      if (parent) parent.scrollBy(0, scrollPast);
      else window.scrollBy(0, scrollPast);
    }, 800 * round);
    await page.waitForTimeout(2000);
  }

  // Deselect all first (uncheck any currently-selected)
  await page.locator('text=/Select All \\d+ selected|Cancel/i').first().click({ timeout: 2000 }).catch(()=>{});
  await page.waitForTimeout(500);

  // Click checkbox on first 8 visible tiles
  const tiles = await page.$$('use.svg-icon');
  let pickedThisRound = 0;
  for (const t of tiles) {
    if (pickedThisRound >= 8) break;
    try {
      await t.scrollIntoViewIfNeeded();
      await t.click({ force: true, timeout: 3000 });
      pickedThisRound += 1;
      await page.waitForTimeout(150);
    } catch {}
  }
  console.log(`  ☑ ${pickedThisRound} tiles selected`);
  if (pickedThisRound === 0) { console.log("  no more tiles → done"); break; }

  // Click Download w/o Watermark
  await page.locator('button:has-text("Download")').first().click({ timeout: 3000 }).catch(()=>{});
  await page.waitForTimeout(700);
  await page.locator('li:has-text("Download without Watermark")').first().click({ timeout: 5000 }).catch(()=>{});

  // Wait for download event to fire + extraction to complete
  const before = downloadedCount;
  for (let s = 0; s < 60; s++) {
    await page.waitForTimeout(1000);
    if (downloadedCount > before + 3) break;  // got at least a few new
  }
  console.log(`  round result: +${downloadedCount - before} new clips (total ${downloadedCount})`);

  if (downloadedCount === before) {
    console.log("  no new clips this round → likely all duplicates");
  }
}

console.log(`\n📊 Total new clips downloaded: ${downloadedCount}`);
console.log(`📊 Total job IDs known on disk: ${downloadedJobIds.size}`);
await browser.close();
