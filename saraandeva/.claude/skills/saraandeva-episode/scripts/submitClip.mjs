#!/usr/bin/env node
/**
 * Fill a Kling Custom Multi-Shot clip from a JSON spec — end-to-end.
 *
 * Does the WHOLE flow (captured from codegen):
 *   1. Close any intro popup
 *   2. Open scene picker → Uploads → pick the right scene PNG → Confirm
 *   3. Open bind dialog → auto-match each subject by tile text → tick → close
 *   4. Toggle Custom Multi-Shot mode
 *   5. Fill each shot's prompt + per-shot duration
 *   6. Verify 720p + Native Audio ON + credit cost
 *   7. Stop at Generate for user review (unless --auto-submit)
 *
 * Usage:
 *   node .../submitClip.mjs content/saraandeva/episodes/ep01/clip_03.json
 *   node .../submitClip.mjs <clip.json> --auto-submit
 *
 * Scene filename resolution — spec.scene is a CamelCase name ("Livingroom",
 *   "BedroomSisters", "KitchenMorning"). Mapped to a snake_case PNG filename
 *   via SCENE_FILE_MAP below.
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const specPath = argv.find((a) => !a.startsWith("--"));
const AUTO = argv.includes("--auto-submit");
if (!specPath) { console.error("Usage: submitClip.mjs <clip.json> [--auto-submit]"); process.exit(1); }

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

// Map CamelCase scene name from spec → on-disk PNG filename (also matches
// Kling's uploaded-asset name, stripped of extension). Extend as scenes grow.
const SCENE_FILE_MAP = {
  BedroomSisters: "bedroom_sisters",
  KitchenMorning: "kitchen_morning",
  KitchenEvening: "kitchen_evening",
  Livingroom:     "livingroom",
  DiningRoom:     "dining_room",
  GirlsCloset:    "girls_closet",
  Bathroom:       "bathroom",
  Backyard:       "backyard",
  Pool:           "pool",
  FrontHouse:     "front_house",
  FrontHouseFall: "front_house_fall",
  FrontFenceSidewalk: "front_fence_sidewalk",
  FrontWalk:      "front_walk",
  HouseAerial:    "house_aerial",
  Park:           "park",
};
const sceneFile = SCENE_FILE_MAP[spec.scene];
if (!sceneFile) { console.error(`Unknown scene: ${spec.scene}`); process.exit(1); }

console.log(`📋 ${spec.title}  ·  ${spec.durationSec}s  ·  ${spec.shots.length} shots`);
console.log(`   scene:    ${spec.scene} → ${sceneFile}.png`);
console.log(`   subjects: ${spec.subjects.join(", ")}`);
console.log(`   expected: ${spec.expectedCredits} credits · Native Audio ${spec.nativeAudio ? "ON" : "OFF"}\n`);

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
if (!page) { console.error("No Kling tab"); process.exit(1); }
await page.bringToFront();
console.log(`📄 attached: ${page.url()}\n`);

// If we navigated away (e.g. to /app/user-assets/materials), hop back.
if (!page.url().includes("/app/video/new")) {
  await step("nav → /app/video/new", async () => {
    await page.goto("https://kling.ai/app/video/new?ac=1", { waitUntil: "domcontentloaded" });
  });
  await page.waitForTimeout(1500);
}

async function step(label, fn) {
  process.stdout.write(`  → ${label}…  `);
  try { await fn(); console.log(`✓`); return true; }
  catch (e) { console.log(`❌  ${e.message.slice(0, 160)}`); return false; }
}

// ───────────── 1. Dismiss any popup ─────────────
console.log(`[popup]`);
await page.locator(".close > svg").first().click({ timeout: 2000 })
  .then(() => console.log("  ✓ dismissed"))
  .catch(() => console.log("  · no popup"));

await page.waitForTimeout(500);

// ───────────── 2. Scene selection ─────────────
console.log(`\n[scene: ${sceneFile}]`);
// Open the scene frame picker. codegen used `div:nth(5)` which is fragile;
// try the readable selector first, fall back to the codegen nth match.
await step("open scene picker", async () => {
  const opener = page.locator('p:has-text("Add start and end frames"), p:has-text("start and end frame")').first();
  if (await opener.count().catch(() => 0)) {
    await opener.click({ timeout: 4000 });
  } else {
    // Fallback: the first "Add" affordance near the prompt area
    await page.getByText(/start and end frame/i).first().click({ timeout: 4000 });
  }
});
await page.waitForTimeout(800);

// Switch to Uploads tab (sometimes called History/Uploads depending on UI state)
await step("click Uploads tab", async () => {
  const tabs = page.getByText("Uploads", { exact: false }).first();
  await tabs.click({ timeout: 4000 });
});
await page.waitForTimeout(800);

// Find the tile whose image matches `<sceneFile>.png` by image alt / name.
// Kling stores the uploaded file name in the image alt or a sibling text.
await step(`pick tile matching ${sceneFile}.png`, async () => {
  const picked = await page.evaluate((sceneFile) => {
    const tiles = Array.from(document.querySelectorAll(
      "#panel-reference-upload-container .image-item, #panel-reference-upload-container .image-item-source"
    ));
    for (const t of tiles) {
      const img = t.tagName === "IMG" ? t : t.querySelector("img");
      if (!img) continue;
      const hay = [img.alt, img.src, img.title, t.textContent].join(" ").toLowerCase();
      if (hay.includes(sceneFile.toLowerCase())) {
        (t.closest(".image-item") || t).scrollIntoView({ block: "center" });
        (t.closest(".image-item") || t).click();
        return true;
      }
    }
    return false;
  }, sceneFile);
  if (!picked) throw new Error(`tile for ${sceneFile}.png not found — is it uploaded?`);
});
await page.waitForTimeout(600);

await step("click Confirm", async () => {
  await page.getByRole("button", { name: "Confirm" }).first().click({ timeout: 4000 });
});
await page.waitForTimeout(1000);

// ───────────── 3. Bind subjects ─────────────
console.log(`\n[bind subjects]`);
await step("open bind dialog", async () => {
  await page.locator(".svg-icon.bind-subject__options-setting").first().click({ timeout: 5000 });
});
await page.waitForTimeout(800);

// Auto-match each subject in spec.subjects to a tile by the tile's visible text.
for (const subject of spec.subjects) {
  await step(`tick ${subject}`, async () => {
    const clicked = await page.evaluate((subject) => {
      const tiles = Array.from(document.querySelectorAll(
        ".bind-subject-dialog__item, .bind-subject-dialog-container .bind-subject-dialog__item"
      ));
      const lcs = subject.toLowerCase();
      for (const t of tiles) {
        const hay = (t.textContent || "").toLowerCase();
        if (hay.includes(lcs)) {
          const avatar = t.querySelector(".bind-subject-dialog__item-avatar");
          (avatar || t).scrollIntoView({ block: "center" });
          (avatar || t).click();
          return true;
        }
      }
      return false;
    }, subject);
    if (!clicked) throw new Error(`${subject} tile not found in bind dialog`);
  });
  await page.waitForTimeout(250);
}

await step("close bind dialog", async () => {
  await page.locator(".bind-subject-dialog__title > svg").first().click({ timeout: 3000 });
});
await page.waitForTimeout(800);

// ───────────── 4. Custom Multi-Shot ─────────────
console.log(`\n[multi-shot mode]`);
const inMulti = await page.locator('div:has-text("Cancel Custom Multi-Shot")').count().catch(() => 0);
if (!inMulti) {
  await step("click Custom Multi-Shot", async () => {
    await page.getByText("Custom Multi-Shot", { exact: true }).first().click({ timeout: 5000 });
  });
  await page.waitForTimeout(1500);
} else {
  console.log("  ✓ already in Custom Multi-Shot");
}

// ───────────── 5. Fill shots ─────────────
for (let i = 0; i < spec.shots.length; i++) {
  const n = i + 1;
  const sh = spec.shots[i];
  console.log(`\n[shot ${n} · ${sh.durationSec}s]`);

  // Add shot for i > 0
  if (i > 0) {
    await step(`click + Shot`, async () => {
      await page.getByRole("button", { name: "Shot" }).last().click({ timeout: 5000 });
    });
    await page.waitForTimeout(600);
  }

  // Scope to the i-th storyboard-item
  const itemCount = await page.locator(".storyboard-item").count();
  if (itemCount <= i) {
    console.log(`  ❌ only ${itemCount} storyboard items for shot ${n}`);
    continue;
  }
  const item = page.locator(".storyboard-item").nth(i);

  // Expand header (in case collapsed)
  await step("expand header", async () => {
    const header = item.locator(".storyboard-item__header");
    await header.scrollIntoViewIfNeeded();
    await header.click({ timeout: 3000 }).catch(() => {});
  });
  await page.waitForTimeout(300);

  // Fill prompt — locate the editor inside this item
  await step("fill prompt", async () => {
    const editor = item.locator("div.editor, .tiptap.ProseMirror").first();
    await editor.click({ timeout: 3000 });
    await page.waitForTimeout(150);
    await page.keyboard.press("Meta+A");
    await page.waitForTimeout(50);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(50);
    // type() is slow but lets contenteditable register input events cleanly
    await page.keyboard.type(sh.prompt, { delay: 1 });
  });
  await page.waitForTimeout(300);

  // Set duration — number input scoped to the item
  await step(`set duration = ${sh.durationSec}s`, async () => {
    const inp = item.locator('input[type="number"]').first();
    await inp.click({ clickCount: 3, timeout: 3000 });
    await inp.fill(String(sh.durationSec));
    await inp.press("Tab").catch(() => {});
  });
  await page.waitForTimeout(300);
}

// ───────────── 6. Credit check ─────────────
console.log(`\n[credit check]`);
const genText = await page.locator('text=/^\\d+\\s*Generate/i').first().textContent({ timeout: 5000 }).catch(() => null);
if (genText) {
  const shown = Number((genText.match(/(\d+)/) || [])[1] || 0);
  const ok = shown === spec.expectedCredits;
  console.log(`  Generate shows: ${shown}  (expected ${spec.expectedCredits})  ${ok ? "✓" : "⚠️"}`);
  if (!ok) {
    console.log(`  ⚠️  Credit mismatch — verify 720p + Native Audio ON + shot durations = ${spec.durationSec}s total before clicking Generate.`);
  }
} else {
  console.log("  ⚠️  couldn't read Generate button text");
}

if (AUTO) {
  console.log(`\n[submit]`);
  await step("click Generate", async () => {
    await page.locator('text=/^\\d+\\s*Generate/i').first().click({ timeout: 5000 });
  });
} else {
  console.log(`\n✅ READY — review in the Kling tab. Click Generate manually when you're happy.`);
}

await browser.close();
