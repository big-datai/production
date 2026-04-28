#!/usr/bin/env node
/**
 * Single-shot Kling submission — one micro-clip at a time.
 *
 * Reads a micro-clip JSON spec (mode: "single-shot", one prompt, one duration)
 * and fills Kling's normal Image-to-Video / Text-to-Video flow:
 *   1. Reset / pop popups
 *   2. Upload scene PNG via .el-upload setInputFiles
 *   3. Open bind dialog → search each subject by name → tick → close
 *   4. Fill the single main prompt in #design-view-container
 *   5. Read settings + report; pause for user (NO Generate click unless --auto-submit)
 *
 * Built off the second codegen capture (which exposed the search-by-name
 * textbox in the bind dialog — fixes tile-index brittleness).
 *
 * Usage:
 *   node .../submitSingleShotClip.mjs content/saraandeva/episodes/ep01/clip_02a.json
 *   node .../submitSingleShotClip.mjs <clip.json> --auto-submit
 */

import fs from "node:fs";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const specPath = argv.find((a) => !a.startsWith("--"));
const AUTO = argv.includes("--auto-submit");
if (!specPath) { console.error("Usage: submitSingleShotClip.mjs <clip.json> [--auto-submit]"); process.exit(1); }

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

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
  Driveway:       "driveway",
};
const sceneFile = SCENE_FILE_MAP[spec.scene];
if (!sceneFile) { console.error(`Unknown scene: ${spec.scene}`); process.exit(1); }

// Scene-specific auto-negative-prompt augmentation (learned from Ep 1 audit).
// Append phantom-trigger-specific negatives that affect this scene type.
const SCENE_NEGATIVES = {
  Bathroom: "mirror reflection, twin sister, second sister, third child, fourth child",
  KitchenMorning: "dog on counter, dogs on counter, third dog, extra puppy, pancake monster",
  DiningRoom: "extra hands, fourth person at table, fifth chair occupant, second sister, second girl, dog under table, dog on table",
  Livingroom: "second couch, two dogs running together duplicate",
  BedroomSisters: "second bunk bed, twin beds, separate beds, third bed, second mama, second papa",
  FrontFenceSidewalk: "second school bus, multiple buses, second girl, second sister",
  FrontWalk: "second car, multiple parents, second girl, second sister",
  Driveway: "third car, multiple buses, fourth car, second girl, walking up the driveway",
};
if (SCENE_NEGATIVES[spec.scene]) {
  const extra = SCENE_NEGATIVES[spec.scene];
  spec.negativePrompt = (spec.negativePrompt || "") + ", " + extra;
}
const scenePath = `/Volumes/Samsung500/goreadling/assets/characters/saraandeva/scenes/${sceneFile}.png`;

console.log(`📋 ${spec.title}`);
console.log(`   beat ${spec.beat}${spec.microClip}  ·  ${spec.durationSec}s  ·  single-shot`);
console.log(`   scene:    ${spec.scene} → ${sceneFile}.png`);
console.log(`   subjects: ${spec.subjects.join(", ")}`);
console.log(`   credits:  ~${spec.expectedCredits} (Native Audio ${spec.nativeAudio ? "ON" : "OFF"})\n`);

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
if (!page) { console.error("No Kling tab"); process.exit(1); }
await page.bringToFront();
console.log(`📄 attached: ${page.url()}\n`);

async function step(label, fn) {
  process.stdout.write(`→ ${label}…  `);
  try { await fn(); console.log("✓"); return true; }
  catch (e) { console.log(`❌  ${e.message.slice(0, 160)}`); return false; }
}

// If we navigated away (downloads, materials, etc.), hop back
if (!page.url().includes("/app/video/new")) {
  await step("nav → /app/video/new", async () => {
    await page.goto("https://kling.ai/app/video/new?ac=1", { waitUntil: "domcontentloaded" });
  });
  await page.waitForTimeout(1500);
}

// ───────────── 0. Reset state ─────────────
console.log("[reset]");
// Close any leftover bind dialog + popup
await page.locator(".bind-subject-dialog__title > svg").first().click({ timeout: 1500 }).catch(() => {});
await page.locator(".close > svg").first().click({ timeout: 1500 }).catch(() => {});
// If we're in Custom Multi-Shot mode (from a previous run), exit it
const inMulti = await page.locator('div:has-text("Cancel Custom Multi-Shot")').count().catch(() => 0);
if (inMulti) {
  await step("exit Custom Multi-Shot", async () => {
    await page.locator('div:has-text("Cancel Custom Multi-Shot")').first().click({ timeout: 3000 });
  });
  await page.waitForTimeout(800);
}
console.log("");

// ───────────── 1. Upload scene PNG ─────────────
console.log(`[scene · ${sceneFile}.png]`);
await step("setInputFiles on .el-upload", async () => {
  const fileInput = page.locator(
    '.key-frames-box .el-upload input[type="file"], ' +
    '.first-uploader-box input[type="file"], ' +
    '.el-upload--text input[type="file"]'
  ).first();
  await fileInput.setInputFiles(scenePath, { timeout: 8000 });
});
await page.waitForTimeout(2500);

// If a confirm pops up after upload, click it
await page.getByRole("button", { name: "Confirm" }).first().click({ timeout: 1500 })
  .then(() => console.log("→ Confirm popped (clicked) ✓"))
  .catch(() => {});
await page.waitForTimeout(800);
console.log("");

// ───────────── 2. Bind subjects (search-by-name) ─────────────
console.log("[bind subjects]");
await step("open bind dialog", async () => {
  await page.locator(".svg-icon.bind-subject__options-setting").first().click({ timeout: 5000 });
});
await page.waitForTimeout(800);

// Inspect current bind state for visibility/debug
const before = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".bind-subject-dialog__item")).map(t => ({
    text: (t.textContent || "").trim().slice(0, 30),
    selected: t.classList.contains("bind-subject-dialog__item--selected"),
  }));
});
const selectedNow = before.filter(t => t.selected).map(t => t.text).join(", ") || "none";
console.log(`  currently selected: ${selectedNow}`);

// Untick anything currently selected that's NOT in our subjects list
for (const t of before) {
  if (!t.selected) continue;
  const lcs = t.text.toLowerCase();
  const wanted = spec.subjects.some(s => lcs.includes(s.toLowerCase()));
  if (wanted) continue;
  await step(`untick stale: ${t.text}`, async () => {
    const clicked = await page.evaluate((needle) => {
      const items = Array.from(document.querySelectorAll(".bind-subject-dialog__item--selected"));
      for (const item of items) {
        if ((item.textContent || "").toLowerCase().includes(needle)) {
          (item.querySelector(".bind-subject-dialog__item-avatar") || item).click();
          return true;
        }
      }
      return false;
    }, lcs);
    if (!clicked) throw new Error("stale tile not found");
  });
  await page.waitForTimeout(250);
}

// Search-by-name and tick each subject in spec.subjects (skip if already on)
for (const subj of spec.subjects) {
  if (before.some(t => t.text.toLowerCase().includes(subj.toLowerCase()) && t.selected)) {
    console.log(`→ ${subj} already ticked ✓`);
    continue;
  }
  await step(`search "${subj}"`, async () => {
    const search = page.getByRole("textbox", { name: "search-subject-name" });
    await search.click({ timeout: 3000 });
    await search.fill(subj);
  });
  await page.waitForTimeout(500);

  await step(`tick ${subj}`, async () => {
    // After search, the matching tile is the first non-create item
    const clicked = await page.evaluate((subj) => {
      const items = Array.from(document.querySelectorAll(
        ".bind-subject-dialog__item:not(.bind-subject-dialog__item--create)"
      ));
      const lcs = subj.toLowerCase();
      for (const t of items) {
        if (!(t.textContent || "").toLowerCase().includes(lcs)) continue;
        if (t.classList.contains("bind-subject-dialog__item--selected")) return "already";
        if (t.classList.contains("bind-subject-dialog__item--disabled")) return "disabled";
        const cb = t.querySelector(".bind-subject-dialog__item-avatar") || t;
        cb.scrollIntoView({ block: "center" });
        cb.click();
        return "clicked";
      }
      return "notfound";
    }, subj);
    if (clicked === "notfound") throw new Error(`${subj} tile not found`);
    if (clicked === "disabled") throw new Error(`${subj} tile disabled (3-subject cap reached?)`);
  });
  await page.waitForTimeout(250);

  // Clear search for next iteration
  await page.locator(".el-icon.el-input__icon > svg").first().click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(200);
}

// Close bind dialog
await step("close bind dialog", async () => {
  await page.locator(".bind-subject-dialog__title > svg").first().click({ timeout: 3000 });
});
await page.waitForTimeout(800);
console.log("");

// ───────────── 3. Fill main prompt ─────────────
console.log("[prompt]");

// Lint anti-patterns BEFORE filling. Hard-fail on critical violations
// unless --force is passed. Calibrated from ~2,500 credits of audit (Ep 1, Apr 2026).
const FORCE = argv.includes("--force");

const antiPatterns = [
  // Phantom-spawning verbs (implies unspoken companions/objects)
  { rx: /\b(race|chase|catch up|follow|hide and seek|hide-and-seek|party|compete)\b/i, why: "phantom-spawning verb (use solo verbs: dash, sprint, hurry)" },
  // All-caps numbers attract counted phantoms
  { rx: /\b(FIVE|TEN|HUNDRED)!?\b/, why: "all-caps number attracts phantom counted objects (use lowercase)" },
  { rx: /\bhigh[-\s]?five[ds]?\b/i, why: "'high-five' verb spawns extra hands/characters" },
  // Group pronouns/nouns
  { rx: /\b(both|sisters|girls|everyone|all of them|they|them|their|his|her|kids|children)\b/i, why: "group/pronoun (re-use @Tag explicitly)" },
  // Entry verbs (only ok on first-shot appearance, but linter is conservative)
  { rx: /\b(skidding in|rushes in|appears|emerges|enters)\b/i, why: "entry verb (use stops / turns / sits / jumps)" },
  // Appearance descriptors (bound avatar handles look)
  { rx: /honey-(gold|brown)|curls bouncing|dimpled|wavy hair|pink pajamas|blue collar|red collar|fluffy|wearing.+backpack|messy.+hair/i, why: "appearance descriptor (bound avatar handles look)" },
  // Voice descriptors (Native Audio handles voice)
  { rx: /voice:|voice tone|bright.+\d.year.old/i, why: "voice descriptor (delete entirely — bound TTS profile handles)" },
  // Static (ignored by Kling)
  { rx: /\bstatic\b/i, why: "'static' is ignored by Kling — use 'locked camera' instead" },
  // Bathroom mirror trap
  { rx: /\bmirror\b(?!.*NO mirror)/i, why: "mirror in scene + multiple kids = duplicate render. Use 'NO MIRROR visible'" },
];

// Per-tag mention counter — hard fail if any tag mentioned >2 times
const tagCounts = {};
for (const m of (spec.prompt.match(/@[A-Z][a-z]+/g) || [])) {
  tagCounts[m] = (tagCounts[m] || 0) + 1;
}
const dupTags = Object.entries(tagCounts).filter(([, c]) => c > 2);

const warns = antiPatterns.filter(p => p.rx.test(spec.prompt));
// Has at least one quoted dialogue line AND at least one @Tag — looser
// than requiring @Name: "..." directly adjacent (allows "action-then-dialogue"
// patterns like `@Sara brushing happily: "Healthy teeth!"`).
const hasDialogue = /"[^"]{2,}"/.test(spec.prompt) && /@[A-Z][a-z]+/.test(spec.prompt);

if (warns.length || dupTags.length || !hasDialogue) {
  console.log(`  ⚠️ prompt-lint findings:`);
  for (const w of warns) console.log(`     · ${w.why}: matched ${w.rx}`);
  for (const [t, c] of dupTags) console.log(`     · TAG SPAM ${t} mentioned ${c}× (max 2 allowed — likely to spawn duplicates)`);
  if (!hasDialogue) console.log(`     · NO explicit @Name: "dialogue" line — Native Audio may generate gibberish`);
}

const blockers = dupTags.length || !hasDialogue;
if (blockers && !FORCE) {
  console.log(`\n❌ Prompt linter HARD-FAIL. Either fix the prompt or pass --force to override.`);
  console.log(`   Blocking: ${dupTags.length ? `tag-spam (${dupTags.map(([t,c]) => `${t} x${c}`).join(', ')})` : ''}${!hasDialogue ? ' missing-dialogue' : ''}`);
  await browser.close();
  process.exit(2);
}

await step("fill main prompt", async () => {
  const editor = page.locator("#design-view-container").getByRole("textbox").first();
  await editor.click({ timeout: 5000 });
  await page.waitForTimeout(150);
  await page.keyboard.press("Meta+A");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(80);
  await page.keyboard.type(spec.prompt, { delay: 1 });
});
await page.waitForTimeout(500);

// Inject negative prompt if Kling exposes a negative-prompt textarea
if (spec.negativePrompt) {
  await step("fill negative prompt", async () => {
    // Kling's negative prompt is in a collapsible "Advanced Settings" / "Negative Prompt" panel
    // Try to find a textbox labeled "Negative Prompt" — if not found, log and continue.
    // Open Advanced if collapsed
    const advToggle = page.getByText(/Negative Prompt|Advanced/i).first();
    if (await advToggle.count().catch(() => 0)) {
      await advToggle.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    const negBox = page.locator('textarea[placeholder*="negative" i], textarea[placeholder*="avoid" i], textarea[placeholder*="don\'t want" i]').first();
    if (await negBox.count().catch(() => 0)) {
      await negBox.click({ timeout: 1500 });
      await page.keyboard.press("Meta+A");
      await page.keyboard.press("Delete");
      await page.keyboard.type(spec.negativePrompt, { delay: 1 });
    } else {
      throw new Error("negative-prompt textarea not found in DOM (Kling UI may not expose it for single-shot mode)");
    }
  });
  await page.waitForTimeout(400);
}

console.log("");

// ───────────── 4. Settings — 720p / duration / Native Audio ─────────────
console.log("[settings]");

async function readSettingsBar() {
  return await page.evaluate(() => {
    for (const el of document.querySelectorAll("div, span")) {
      const t = (el.textContent || "").trim();
      if (/\b(720p|1080p)\s*·\s*\d+s\s*·/.test(t) && t.length < 80) return t;
    }
    return null;
  });
}

// Open the settings panel by clicking the bar
await step("open settings panel", async () => {
  const bar = page.locator('text=/\\b(720p|1080p)\\s*·\\s*\\d+s/').first();
  await bar.click({ timeout: 4000 });
});
await page.waitForTimeout(900);

// Click 720p inside the Mode/Resolution section
await step("set 720p", async () => {
  const r = await page.locator("xpath=//div[@class='inner'][normalize-space()='720p']").first();
  await r.click({ timeout: 3000 });
});
await page.waitForTimeout(500);

// Set duration via the slider — Kling's slider responds to keyboard arrows.
// Read aria-valuenow, press ArrowLeft/Right until it matches spec.durationSec.
await step(`set duration = ${spec.durationSec}s`, async () => {
  const slider = page.getByRole("slider").first();
  await slider.click({ timeout: 3000 });
  for (let i = 0; i < 30; i++) {
    const cur = Number(await slider.getAttribute("aria-valuenow"));
    if (cur === spec.durationSec) return;
    if (cur > spec.durationSec) await slider.press("ArrowLeft");
    else                         await slider.press("ArrowRight");
    await page.waitForTimeout(80);
  }
  throw new Error("could not reach desired duration via slider");
});
await page.waitForTimeout(400);

// Toggle Native Audio to spec.nativeAudio (default ON for SaraAndEva)
await step(`Native Audio ${spec.nativeAudio ? "ON" : "OFF"}`, async () => {
  const isOn = await page.evaluate(() => {
    const sw = document.querySelector("div.setting-switch");
    const u = sw && sw.querySelector("use");
    if (!u) return null;
    const href = u.getAttribute("xlink:href") || u.getAttribute("href") || "";
    if (href.includes("unchecked")) return false;
    if (href.includes("checked"))   return true;
    return null;
  });
  if (isOn === null) throw new Error("Native Audio switch not found");
  if (isOn === spec.nativeAudio) return; // already in desired state
  await page.getByText("Native Audio", { exact: true }).first().click({ timeout: 3000 });
});
await page.waitForTimeout(500);

// Close settings panel
await page.keyboard.press("Escape").catch(() => {});
await page.mouse.click(300, 300).catch(() => {});
await page.waitForTimeout(500);

const finalSettings = await readSettingsBar();
console.log(`  final settings: ${finalSettings || "(could not read)"}`);
console.log(`  desired:        720p · ${spec.durationSec}s · Native Audio ${spec.nativeAudio ? "ON" : "OFF"}`);

const genText = await page.locator('text=/^\\d+\\s*Generate/i').first().textContent({ timeout: 5000 }).catch(() => null);
if (genText) {
  const shown = Number((genText.match(/(\d+)/) || [])[1] || 0);
  const ok = shown === spec.expectedCredits;
  console.log(`  Generate button: ${shown} credits  (expected ${spec.expectedCredits}) ${ok ? "✓" : "⚠️"}`);
} else {
  console.log("  ⚠️  couldn't read Generate button");
}

if (AUTO) {
  console.log("\n[submit]");
  await step("click Generate", async () => {
    // Use role=button to explicitly target the Generate button (not the
// resolution panel's "<div class=\"inner\">720p</div>" element which was
// catching clicks earlier).
// Locked-in selector from DOM inspection: button.generic-button.critical.big.button-pay
// Has no role/aria-name set so getByRole fails — must use class.
// Kling alternates between `big` and `medium` size classes — match either
await page.locator('button.generic-button.critical.button-pay').first().click({ timeout: 5000 });
  });
} else {
  console.log("\n✅ READY — verify resolution/duration/audio in browser, then click Generate manually.");
}

await browser.close();
