#!/usr/bin/env node
/**
 * Download the most-recent-rendered Omni clip from the Kling page,
 * rename it to a spec-derived name, and verify it landed.
 *
 * Codegen-verified pattern (2026-04-28):
 *   const downloadPromise = page.waitForEvent('download');
 *   await page.locator('#el-id-XXXX-XXX').getByRole('button').filter({ hasText: /^$/ }).click();
 *   const download = await downloadPromise;
 *
 * Since #el-id-* IDs are dynamic, we find the topmost clip stream item and
 * click its empty-text icon button (the download icon).
 *
 * Usage:
 *   node downloadLatestOmni.mjs <out_path>
 *   e.g. node downloadLatestOmni.mjs exports/saraandeva/season_01/episode_03/clip_01a.mp4
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const outPath = path.resolve(process.argv[2] || "");
if (!outPath) {
  console.error("Usage: downloadLatestOmni.mjs <out_path>");
  process.exit(1);
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

console.log(`📺 Page: ${page.url()}`);

// ─── Find the topmost clip in the Omni stream feed ────────────────────────
// Stream items have class like .item.omni-stream-item-{id}
// Newest is first in DOM order.
const topItem = page.locator('[class*="omni-stream-item"]').first();
if (!(await topItem.count())) {
  console.error("❌ No omni-stream-item found on page. Are you on the Omni page?");
  await browser.close();
  process.exit(2);
}

console.log("→ Hovering top item to expose action buttons...");
await topItem.scrollIntoViewIfNeeded().catch(() => {});
await topItem.hover().catch(() => {});
await page.waitForTimeout(800);

// ─── Click the download button — try several selectors ───────────────────
console.log("→ Triggering download...");
const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });

const candidates = [
  // Codegen pattern: empty-text button inside the item
  topItem.getByRole("button").filter({ hasText: /^$/ }),
  // SVG-icon button approaches
  topItem.locator('button:has(svg[class*="download"])').first(),
  topItem.locator('[class*="download-icon"]').first(),
  topItem.locator('button[title*="Download" i]').first(),
  topItem.locator('button[aria-label*="Download" i]').first(),
];

let clicked = false;
for (const cand of candidates) {
  try {
    const c = await cand.count();
    if (c > 0) {
      // Try last() because download is often the last action button (after share/like/etc.)
      const target = cand.last();
      if (await target.isVisible({ timeout: 1000 }).catch(() => false)) {
        await target.click({ timeout: 3000 });
        clicked = true;
        console.log(`  ✓ clicked download via candidate ${cand}`);
        break;
      }
    }
  } catch {}
}

if (!clicked) {
  console.error("❌ Couldn't find a clickable download button on the top item.");
  console.error("   Try: hover an action bar manually, then check the DOM for the icon button.");
  await browser.close();
  process.exit(3);
}

// ─── Save the download ────────────────────────────────────────────────────
try {
  const download = await downloadPromise;
  await download.saveAs(outPath);
  const stat = fs.statSync(outPath);
  console.log(`\n✅ Saved: ${outPath}  (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
} catch (e) {
  console.error(`❌ Download did not fire / save failed: ${e.message}`);
  await browser.close();
  process.exit(4);
}

await browser.close();
