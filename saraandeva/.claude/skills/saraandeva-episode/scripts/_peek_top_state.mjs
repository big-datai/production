/**
 * Peek the materials page topmost tile and report its state.
 *   - "generating" if the tile shows "Generating..." (still rendering)
 *   - "ready"      if the tile is a finished video (has duration label, has play button)
 *   - "empty"      if the page has no tiles yet
 *
 * Stdout: one line, just the state string. Stderr: any debug.
 */
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

if (!page.url().includes("/app/user-assets/materials")) {
  await page.goto("https://kling.ai/app/user-assets/materials?ac=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
} else {
  // refresh so we see latest state
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
}

// Reliable check: is there any "Generating..." text on the materials page?
// If yes, at least one render is in progress (almost always our newest submit, since
// it'll be at the top of the grid). If no, all tiles are ready and the topmost
// .video-item is safe to download.
const state = await page.evaluate(() => {
  const bodyText = document.body.innerText || "";
  const hasGenerating = /Generating/i.test(bodyText);
  const tiles = document.querySelectorAll('.video-item');
  const topText = tiles[0] ? (tiles[0].innerText || "").trim().slice(0, 60) : "";
  if (hasGenerating) {
    return { state: "generating", reason: `body contains "Generating" (tiles=${tiles.length}, topText="${topText}")` };
  }
  if (tiles.length === 0) {
    return { state: "empty", reason: "no .video-item tiles found" };
  }
  return { state: "ready", reason: `${tiles.length} tiles, topText="${topText}"` };
});

console.error(`[peek] ${state.state}: ${state.reason}`);
process.stdout.write(state.state);
await browser.close();
