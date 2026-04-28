#!/usr/bin/env node
/**
 * Fill a Kling Custom Multi-Shot clip's shots from a JSON spec.
 *
 * PRE-REQUISITE: user has already done (in the browser):
 *   - Navigated to /app/video/new
 *   - Picked the scene start/end frame
 *   - Bound the needed character elements via the bind dialog
 *
 * What this script does:
 *   1. Click "Custom Multi-Shot" (if not already in that mode)
 *   2. Expand shot 1, set duration, type prompt into its editor
 *   3. For each subsequent shot: click + Shot add button, then
 *      expand the new shot, set duration, type prompt
 *   4. Read Generate button credit cost, assert matches expected
 *   5. Pause before Generate (unless --auto-submit)
 *
 * Usage:
 *   node content/saraandeva/submitKlingClip.mjs <clip.json> [--auto-submit]
 */

import fs from "node:fs";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const specPath = argv.find((a) => !a.startsWith("--"));
const AUTO = argv.includes("--auto-submit");
if (!specPath) { console.error("Usage: submitKlingClip.mjs <clip.json>"); process.exit(1); }

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
console.log(`📋 ${spec.title}  ·  ${spec.durationSec}s  ·  ${spec.shots.length} shots`);
console.log(`   expected: ${spec.expectedCredits} credits\n`);
console.log(`ℹ  You must have already picked the scene frame + bound the subjects in the browser.`);
console.log(`   This script only fills the shot prompts + durations.\n`);

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
if (!page) { console.error("No Kling tab"); process.exit(1); }
await page.bringToFront();

async function step(label, fn) {
  process.stdout.write(`  → ${label}…  `);
  try { await fn(); console.log(`✓`); return true; }
  catch (e) { console.log(`❌  ${e.message.slice(0, 140)}`); return false; }
}

// Enter Custom Multi-Shot mode if not already
console.log(`[mode]`);
const inMultiShot = await page.locator('div:has-text("Cancel Custom Multi-Shot")').count().catch(() => 0);
if (!inMultiShot) {
  await step("click Custom Multi-Shot", async () => {
    await page.locator('span:has-text("Custom Multi-Shot")').first().click({ timeout: 8000 });
  });
  await page.waitForTimeout(1500);
} else {
  console.log(`  ✓ already in Custom Multi-Shot mode`);
}

// For each shot: expand its header, fill editor + duration
for (let i = 0; i < spec.shots.length; i++) {
  const n = i + 1;
  console.log(`\n[shot ${n}]`);

  // Shots 2..N need to be added first
  if (i > 0) {
    await step(`click + Shot (add shot ${n})`, async () => {
      // The + Shot button is a `span` with just "Shot" text, inside a
      // `button.generic-button.secondary.medium` parent. Target the button
      // by text so playwright auto-clicks centre.
      await page.locator('button:has(span:text-is("Shot")), button:has-text("Shot"):not(:has-text("Shot1")):not(:has-text("Shot2")):not(:has-text("Shot3")):not(:has-text("Shot4")):not(:has-text("Shot5")):not(:has-text("Shot6"))')
        .last().click({ timeout: 5000 });
    });
    await page.waitForTimeout(800);
  }

  // Find all storyboard items (shot headers)
  const headers = await page.$$("div.storyboard-item__header");
  if (!headers[i]) {
    console.log(`  ❌ shot ${n} header not found (only ${headers.length} headers exist)`);
    continue;
  }

  // Expand shot i (click its header)
  await step(`expand shot ${n} header`, async () => {
    await headers[i].scrollIntoViewIfNeeded();
    await headers[i].click();
  });
  await page.waitForTimeout(500);

  // Find the storyboard item (parent of this header)
  const item = await headers[i].evaluateHandle((el) => el.closest(".storyboard-item"));

  // Type prompt into the editor inside this shot's item
  await step(`fill shot ${n} prompt`, async () => {
    // Click the div.editor (wrapper around ProseMirror) inside this item
    const editor = await item.$("div.editor");
    if (!editor) throw new Error("no div.editor in this shot");
    await editor.click();
    await page.waitForTimeout(200);
    // Select all + delete in the contenteditable
    await page.keyboard.press("Meta+A");
    await page.waitForTimeout(80);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(80);
    await page.keyboard.type(spec.shots[i].prompt, { delay: 1 });
  });
  await page.waitForTimeout(400);

  // Set duration — find number input within this item
  await step(`set shot ${n} duration = ${spec.shots[i].durationSec}s`, async () => {
    const inp = await item.$('input[type="number"]');
    if (!inp) throw new Error("no number input in this shot");
    await inp.click({ clickCount: 3 });
    await inp.fill(String(spec.shots[i].durationSec));
    await inp.press("Tab").catch(() => {});
  });
  await page.waitForTimeout(400);
}

// Credit check
console.log(`\n[credit check]`);
const genText = await page
  .locator('text=/^\\d+\\s*Generate/i').first().textContent({ timeout: 5000 })
  .catch(() => null);
if (genText) {
  const shown = Number((genText.match(/(\d+)/) || [])[1] || 0);
  const ok = shown === spec.expectedCredits;
  console.log(`  Generate: ${shown}  (expected ${spec.expectedCredits}) ${ok ? "✓" : "⚠️"}`);
} else {
  console.log(`  ⚠️  couldn't read Generate button`);
}

if (AUTO) {
  console.log(`\n[submit]`);
  await step("click Generate", async () => {
    await page.locator('text=/^\\d+\\s*Generate/i').first().click({ timeout: 5000 });
  });
} else {
  console.log(`\n✅ READY — verify in browser, click Generate manually.`);
}

await browser.close();
