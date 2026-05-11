#!/usr/bin/env node
/**
 * Wipe current 4 shots + refill from updated clip_03.json (lean prompts).
 */
import fs from "node:fs";
import { chromium } from "playwright";
const spec = JSON.parse(fs.readFileSync(
  "/Volumes/Samsung500/goreadling/content/saraandeva/episodes/ep01/clip_03.json",
  "utf8"
));
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
if (!page) { console.error("No Kling tab"); process.exit(1); }
await page.bringToFront();

async function step(label, fn) {
  process.stdout.write(`→ ${label}…  `);
  try { await fn(); console.log("✓"); return true; }
  catch (e) { console.log(`❌  ${e.message.slice(0,160)}`); return false; }
}

// How many storyboard-items currently exist? refill prompts in-place; do NOT
// add new shots (we already have 4 from the previous run).
const itemCount = await page.locator(".storyboard-item").count();
console.log(`current storyboard items: ${itemCount} (need ${spec.shots.length})`);

// If we have fewer than needed, add Shot buttons
while ((await page.locator(".storyboard-item").count()) < spec.shots.length) {
  await page.getByRole("button", { name: "Shot" }).last().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
}

for (let i = 0; i < spec.shots.length; i++) {
  const n = i + 1;
  const sh = spec.shots[i];
  console.log(`\n[shot ${n} · ${sh.durationSec}s]`);

  const item = page.locator(".storyboard-item").nth(i);

  await step("expand", async () => {
    const header = item.locator(".storyboard-item__header");
    await header.scrollIntoViewIfNeeded();
    await header.click({ timeout: 3000 }).catch(() => {});
  });
  await page.waitForTimeout(300);

  await step("wipe + fill prompt", async () => {
    const editor = item.locator("div.editor, .tiptap.ProseMirror").first();
    await editor.click({ timeout: 3000 });
    await page.waitForTimeout(150);
    await page.keyboard.press("Meta+A");
    await page.keyboard.press("Delete");
    await page.waitForTimeout(100);
    await page.keyboard.type(sh.prompt, { delay: 1 });
  });
  await page.waitForTimeout(300);

  await step(`duration=${sh.durationSec}s`, async () => {
    const inp = item.locator('input[type="number"]').first();
    await inp.click({ clickCount: 3, timeout: 3000 });
    await inp.fill(String(sh.durationSec));
    await inp.press("Tab").catch(() => {});
  });
  await page.waitForTimeout(300);
}

const gen = await page.locator('text=/^\\d+\\s*Generate/i').first().textContent({ timeout: 5000 }).catch(() => "?");
console.log(`\nGenerate: ${gen}   (expect ${spec.expectedCredits})`);
await browser.close();
