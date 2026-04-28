#!/usr/bin/env node
/**
 * Re-enter Custom Multi-Shot and refill the 4 clip-3 shots that got
 * wiped when the scene upload switched the UI to image-to-video mode.
 */
import fs from "node:fs";
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
if (!page) { console.error("No Kling tab"); process.exit(1); }
await page.bringToFront();

const spec = JSON.parse(fs.readFileSync("/Volumes/Samsung500/goreadling/content/saraandeva/episodes/ep01/clip_03.json", "utf8"));

async function step(label, fn) {
  process.stdout.write(`→ ${label}…  `);
  try { await fn(); console.log("✓"); return true; }
  catch (e) { console.log(`❌  ${e.message.slice(0,160)}`); return false; }
}

// Enter Custom Multi-Shot mode
const inMulti = await page.locator('div:has-text("Cancel Custom Multi-Shot")').count().catch(() => 0);
if (!inMulti) {
  await step("click Custom Multi-Shot", async () => {
    await page.getByText("Custom Multi-Shot", { exact: true }).first().click({ timeout: 5000 });
  });
  await page.waitForTimeout(1500);
}

// Fill each shot
for (let i = 0; i < spec.shots.length; i++) {
  const n = i + 1;
  const sh = spec.shots[i];
  console.log(`\n[shot ${n} · ${sh.durationSec}s]`);

  if (i > 0) {
    await step(`add shot ${n}`, async () => {
      await page.getByRole("button", { name: "Shot" }).last().click({ timeout: 5000 });
    });
    await page.waitForTimeout(600);
  }

  const item = page.locator(".storyboard-item").nth(i);

  await step("expand header", async () => {
    const header = item.locator(".storyboard-item__header");
    await header.scrollIntoViewIfNeeded();
    await header.click({ timeout: 3000 }).catch(() => {});
  });
  await page.waitForTimeout(300);

  await step("fill prompt", async () => {
    const editor = item.locator("div.editor, .tiptap.ProseMirror").first();
    await editor.click({ timeout: 3000 });
    await page.waitForTimeout(150);
    await page.keyboard.press("Meta+A");
    await page.keyboard.press("Delete");
    await page.keyboard.type(sh.prompt, { delay: 1 });
  });
  await page.waitForTimeout(300);

  await step(`duration = ${sh.durationSec}s`, async () => {
    const inp = item.locator('input[type="number"]').first();
    await inp.click({ clickCount: 3, timeout: 3000 });
    await inp.fill(String(sh.durationSec));
    await inp.press("Tab").catch(() => {});
  });
  await page.waitForTimeout(300);
}

const genText = await page.locator('text=/^\\d+\\s*Generate/i').first().textContent({ timeout: 5000 }).catch(() => null);
console.log(`\nGenerate: ${genText || "?"}`);
await browser.close();
