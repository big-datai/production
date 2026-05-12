#!/usr/bin/env node
/**
 * Variation of downloadClip.mjs that SCROLLS the materials list down N
 * times before selecting + downloading. Use this to grab the OLDER renders
 * that have been pushed below the visible top viewport.
 *
 * Usage:  node .../downloadOlder.mjs <out_dir> <scroll_n>
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT_DIR = path.resolve(process.argv[2] || "season_01/episode_01/clips");
const SCROLL_N = Number(process.argv[3] || 3);
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

let dlCount = 0;
page.on("download", async (download) => {
  const out = path.join(OUT_DIR, `older_${Date.now()}.zip`);
  await download.saveAs(out);
  console.log(`📥 ZIP saved: ${path.basename(out)} (${(fs.statSync(out).size/1024/1024).toFixed(1)} MB)`);
  dlCount += 1;
});

// Navigate
await page.goto("https://kling.ai/app/user-assets/materials?ac=1", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

await page.locator('span:has-text("Videos")').first().click({ timeout: 8000 }).catch(()=>{});
await page.waitForTimeout(1500);
await page.locator('span:has-text("Select")').first().click({ timeout: 8000 }).catch(()=>{});
await page.waitForTimeout(1500);

// SCROLL DOWN N times - look for the scrollable materials container
for (let i = 0; i < SCROLL_N; i++) {
  await page.evaluate(() => {
    // Try several scroll containers
    const containers = [
      ...document.querySelectorAll('[class*="virtual-list"]'),
      ...document.querySelectorAll('[class*="material-list"]'),
      ...document.querySelectorAll('[class*="scroll"]'),
      ...document.querySelectorAll('[class*="grid"]'),
    ];
    let scrolled = false;
    for (const c of containers) {
      if (c.scrollHeight > c.clientHeight + 50) {
        c.scrollBy(0, 600);
        scrolled = true;
        break;
      }
    }
    if (!scrolled) window.scrollBy(0, 800);
  });
  await page.waitForTimeout(800);
  console.log(`  scroll ${i+1}/${SCROLL_N}`);
}
await page.waitForTimeout(1000);

// Now select first 8 visible after scrolling
const tiles = await page.$$('use.svg-icon');
let selected = 0;
for (const t of tiles) {
  if (selected >= 8) break;
  try {
    await t.scrollIntoViewIfNeeded();
    await t.click({ force: true, timeout: 3000 });
    selected += 1;
    await page.waitForTimeout(150);
  } catch {}
}
console.log(`\n☑ ${selected} tiles selected after scrolling`);

// Click Download → Without Watermark
try {
  await page.locator('button:has-text("Download")').first().click({ timeout: 4000 });
  await page.waitForTimeout(700);
  await page.locator('li:has-text("Download without Watermark")').first().click({ timeout: 5000 });
} catch (e) {
  console.log(`Download click failed: ${e.message.slice(0,80)}`);
}

// Wait for ZIPs
console.log("Waiting up to 60s for downloads...");
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(1000);
  if (dlCount >= 2) break;
}
console.log(`\n📊 Downloaded ${dlCount} ZIP(s) to ${OUT_DIR}`);

await browser.close();
