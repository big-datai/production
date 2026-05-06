#!/usr/bin/env node
// Enumerate ALL Kling library tile names (text content) so we can compare against
// what the ep12 clip JSONs reference.
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30_000 });
const ctx = browser.contexts()[0];
let page = ctx.pages().find(p => p.url().includes("kling.ai"));
if (!page) { page = await ctx.newPage(); await page.goto("https://kling.ai"); }
await page.bringToFront();

await page.goto("https://kling.ai/app/omni/new?ac=1");
await page.waitForTimeout(2500);

const textbox = page.locator("#design-view-container").getByRole("textbox");
await textbox.click();
await page.keyboard.type("@");
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Add from Element Library" }).click();
await page.waitForTimeout(1200);

// Click "All" tab
try {
  const allTab = page.locator("div")
    .filter({ has: page.locator('> span:text-is("All")') })
    .filter({ has: page.locator("> span.total-number") })
    .first();
  if (await allTab.isVisible({ timeout: 800 })) await allTab.click();
} catch {}
await page.waitForTimeout(800);

// Scroll the modal to load all tiles
for (let i = 0; i < 30; i++) {
  await page.locator(".subject-item").last().scrollIntoViewIfNeeded().catch(() => {});
  await page.mouse.wheel(0, 800).catch(() => {});
  await page.waitForTimeout(250);
}

// Collect tile texts
const tiles = await page.locator(".subject-item").all();
const names = [];
for (const t of tiles) {
  const txt = (await t.innerText().catch(() => "")).trim();
  if (txt) names.push(txt);
}

// Dedupe + sort
const unique = [...new Set(names)].sort();
console.log("=== KLING LIBRARY TILES (" + unique.length + " unique) ===");
for (const n of unique) {
  console.log("  " + JSON.stringify(n));
}

// Spot check the ones ep12 needs
const need = [
  "Sara", "Eva", "Mama", "Papa",
  "beach-shore", "beach-blanket", "beach-sunset", "beach-playground",
  "magic-bottle", "rescue-note", "sandcastle-research-base", "sara-notebook-rescue",
  "ep12-c1-hook", "ep12-c12-base", "ep12-c13-build", "ep12-c15-sunset", "ep12-cD-tag",
];
console.log("\n=== ep12 NEEDED ELEMENTS ===");
for (const n of need) {
  const exact = unique.includes(n);
  const fuzzy = unique.filter(u => u.toLowerCase().replace(/[\s_-]/g, "") === n.toLowerCase().replace(/[\s_-]/g, ""));
  if (exact) console.log("  ✓ " + n);
  else if (fuzzy.length) console.log("  ⚠ " + n + "  (close match: " + JSON.stringify(fuzzy) + ")");
  else console.log("  ✗ " + n + "  (NOT IN LIBRARY)");
}

process.exit(0);
