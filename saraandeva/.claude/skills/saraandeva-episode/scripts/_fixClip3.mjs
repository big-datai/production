#!/usr/bin/env node
/**
 * Clip 3 repair:
 *   1. Open bind dialog, untick Joe (leave Sara+Eva+Ginger ticked)
 *   2. Toggle Custom Multi-Shot
 *   3. Refill 4 shots from the updated clip_03.json (no Joe in prompts)
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

// 1. Open bind dialog, inspect state, untick Joe if ticked
await step("open bind dialog", async () => {
  await page.locator(".svg-icon.bind-subject__options-setting").first().click({ timeout: 5000 });
});
await page.waitForTimeout(800);

const before = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".bind-subject-dialog__item")).map((t, i) => ({
    idx: i + 1,
    text: (t.textContent || "").replace(/\s+/g, " ").slice(0, 40),
    // Kling marks ticked tiles with `active` or a checkmark icon
    ticked: t.classList.contains("active") ||
            !!t.querySelector(".is-checked, .checked, .bind-subject-dialog__item-checkbox--checked") ||
            !!t.querySelector(".bind-subject-dialog__item-selected-tag"),
  }));
});
console.log(`  tiles: ${before.map(t => `${t.idx}${t.ticked?'✓':' '}${t.text.split(' ')[0]}`).join(' / ')}`);

// Click Joe to untick (if visible as ticked)
await step("untick Joe", async () => {
  const clicked = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".bind-subject-dialog__item"));
    for (const t of items) {
      if ((t.textContent || "").toLowerCase().includes("joe")) {
        const btn = t.querySelector(".bind-subject-dialog__item-avatar") || t;
        btn.scrollIntoView({ block: "center" });
        btn.click();
        return true;
      }
    }
    return false;
  });
  if (!clicked) throw new Error("Joe tile not found");
});
await page.waitForTimeout(400);

// Close bind
await step("close bind dialog", async () => {
  await page.locator(".bind-subject-dialog__title > svg").first().click({ timeout: 3000 });
});
await page.waitForTimeout(800);

// 2. Toggle Custom Multi-Shot (we may have fallen out of multi-shot mode)
const inMulti = await page.locator('div:has-text("Cancel Custom Multi-Shot")').count().catch(() => 0);
if (!inMulti) {
  await step("click Custom Multi-Shot", async () => {
    await page.getByText("Custom Multi-Shot", { exact: true }).first().click({ timeout: 5000 });
  });
  await page.waitForTimeout(1500);
} else {
  console.log("✓ already in Custom Multi-Shot");
}

// 3. Fill 4 shots
for (let i = 0; i < spec.shots.length; i++) {
  const n = i + 1;
  const sh = spec.shots[i];
  console.log(`\n[shot ${n} · ${sh.durationSec}s]`);

  if (i > 0) {
    await step(`+ Shot`, async () => {
      await page.getByRole("button", { name: "Shot" }).last().click({ timeout: 5000 });
    });
    await page.waitForTimeout(600);
  }

  const item = page.locator(".storyboard-item").nth(i);

  await step("expand", async () => {
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

  await step(`duration=${sh.durationSec}s`, async () => {
    const inp = item.locator('input[type="number"]').first();
    await inp.click({ clickCount: 3, timeout: 3000 });
    await inp.fill(String(sh.durationSec));
    await inp.press("Tab").catch(() => {});
  });
  await page.waitForTimeout(300);
}

const genText = await page.locator('text=/^\\d+\\s*Generate/i').first().textContent({ timeout: 5000 }).catch(() => null);
console.log(`\nGenerate: ${genText || "?"}   (expect ${spec.expectedCredits})`);
await browser.close();
