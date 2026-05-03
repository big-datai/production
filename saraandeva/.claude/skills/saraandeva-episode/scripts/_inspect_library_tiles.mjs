#!/usr/bin/env node
/**
 * Diagnostic: open Kling library, inspect dental-coin tile vs a working tile
 * (gas-mask or bathroom), report DOM structure, innerText, visibility, and
 * whether the strict-match selector matches.
 */
import { chromium } from "playwright";

const TARGETS = ["dental-coin", "gas-mask", "bathroom", "front-fence-sidewalk"];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai"));
if (!page) { console.error("No kling tab"); process.exit(1); }
await page.bringToFront();

// Reset to clean state
await page.goto("https://kling.ai/app/omni/new?ac=1");
await page.waitForTimeout(2500);

// Open library
const textbox = page.locator("#design-view-container").getByRole("textbox");
await textbox.click();
await page.keyboard.type("@");
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Add from Element Library" }).click();
await page.waitForTimeout(900);

// Click All tab
try {
  const allTab = page.locator("div")
    .filter({ has: page.locator('> span:text-is("All")') })
    .filter({ has: page.locator("> span.total-number") })
    .first();
  if (await allTab.isVisible({ timeout: 800 })) await allTab.click();
} catch {}
await page.waitForTimeout(600);

// Scroll to load all
for (let i = 0; i < 6; i++) {
  await page.locator(".subject-item").last().scrollIntoViewIfNeeded().catch(() => {});
  await page.mouse.wheel(0, 600).catch(() => {});
  await page.waitForTimeout(300);
}

// Scroll back up so we can see early tiles
await page.locator(".subject-item").first().scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(400);

// Inspect each target
for (const tag of TARGETS) {
  console.log(`\n${"=".repeat(70)}\n🔍 ${tag}\n${"=".repeat(70)}`);

  // Strategy 1 — strict regex (current submitOmniClip approach)
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const strict = page.locator(".subject-item").filter({ has: page.locator(`text=/^${escaped}$/i`) });
  const strictCount = await strict.count();
  console.log(`Strict match  text=/^${tag}$/i  →  ${strictCount} tile(s)`);

  // Strategy 2 — substring text
  const loose = page.locator(".subject-item").filter({ hasText: new RegExp(escaped, "i") });
  const looseCount = await loose.count();
  console.log(`Loose substring                  →  ${looseCount} tile(s)`);

  // Strategy 3 — exact via has-text (Playwright's has-text uses substring)
  const hasText = page.locator(".subject-item", { hasText: tag });
  const hasTextCount = await hasText.count();
  console.log(`hasText (substring)              →  ${hasTextCount} tile(s)`);

  // Inspect each loose match in detail
  for (let i = 0; i < Math.min(looseCount, 3); i++) {
    const el = loose.nth(i);
    const outerHtml = await el.evaluate(n => n.outerHTML.slice(0, 400)).catch(() => "(failed)");
    const innerText = await el.innerText().catch(() => "(failed)");
    const isVisible = await el.isVisible().catch(() => false);
    const box = await el.boundingBox().catch(() => null);
    console.log(`  [#${i}] visible=${isVisible}  box=${box ? `${box.x.toFixed(0)},${box.y.toFixed(0)} ${box.width.toFixed(0)}×${box.height.toFixed(0)}` : "null"}`);
    console.log(`        innerText: ${JSON.stringify(innerText)}`);
    console.log(`        innerText.split('\\n')[0]: ${JSON.stringify(innerText.split("\n")[0])}`);
    console.log(`        outerHTML[:400]: ${outerHtml}`);
    // Does this element have a .cover child (used to click)?
    const coverCount = await el.locator(".cover").count();
    console.log(`        .cover children: ${coverCount}`);
  }
}

console.log(`\n${"=".repeat(70)}\nDone. Library panel is still open — close manually.\n${"=".repeat(70)}`);
await browser.close();
