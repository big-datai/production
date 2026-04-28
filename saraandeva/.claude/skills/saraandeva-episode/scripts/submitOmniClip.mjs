#!/usr/bin/env node
/**
 * Submit a single Kling Omni-mode clip to the user's Kling account via Playwright CDP.
 *
 * Why Omni: replaces single-shot/multi-shot for SaraAndEva from Ep 3 onward.
 *   - Up to 7 bound elements per clip (vs. 3-character cap in single-shot)
 *   - 6 chars + 1 scene typical configuration → unblocks full family ensemble scenes
 *   - 10s default clip length (vs. 5s)
 *   - Tag insertion via @-autocomplete dropdown, NOT literal "@Sara" text
 *
 * Verified mechanics (codegen 2026-04-27, see _codegen-omni-2026-04-27-v2.mjs):
 *   - Mode entry:   getByRole('link', { name: 'Omni' })
 *   - Quality default: 1080p · 5s — must downshift to 720p for credit parity
 *   - Cost formula: 30 × ceil(durationSec/5) × (nativeAudio ? 1.5 : 1)
 *     → 5s NA = 45 credits, 10s NA = 90, 15s NA = 135
 *   - Native Audio toggle: stays ON per-session (no programmatic flip needed)
 *   - Scene names auto-populate the @-autocomplete dropdown
 *   - Generate button lives in <footer> (role=contentinfo)
 *
 * Per-clip JSON spec schema (extends single-shot):
 *   {
 *     "mode": "omni",
 *     "durationSec": 10,
 *     "quality": "720p",
 *     "nativeAudio": true,
 *     "expectedCredits": 90,
 *     "boundElements": [
 *       { "tag": "Sara",   "source": "library" },
 *       { "tag": "Eva",    "source": "library" },
 *       { "tag": "Ginger", "source": "library" },
 *       { "tag": "Mama",   "source": "library" },
 *       { "tag": "Kitchen","source": "upload",
 *         "file": "assets/characters/saraandeva/scenes/kitchen_morning.png" }
 *     ],
 *     "prompt": "Wide shot in @Kitchen. @Sara walks in...",
 *     "negativePrompt": "extra people, twin, clone, mirrored figure"
 *   }
 *
 * Usage:
 *   node submitOmniClip.mjs <clip_json_path> [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// ─── PROMPT-RULE BLACKLIST (rejection enums from Ep 2 sidecars) ─────────────
// Note: the original `\bfive\b` guard was blocking high-five gestures which
// rendered awkwardly in Ep 1. With Ep 3+ educational counting beats (Eva
// counts "one, two, three, four, FIVE..."), we narrow the rule to ONLY the
// gesture phrasing — number-five-as-a-count is allowed.
const FORBIDDEN_PROMPT_PHRASES = [
  /\brace\b/i, /\bchase\b/i,
  /\bhigh[- ]?five\b/i, /\bhigh[- ]?fives\b/i,
  /\bgroup of\b/i, /\bcrowd\b/i, /\bfamily of\b/i,
  /\benters\b/i, /\barriving\b/i, /\bmirror(ed)? figure\b/i,
];

// ─── REQUIRED NEGATIVE PROMPT (Omni duplicate-character defense) ────────────
// Lesson from Ep 3 first test (2026-04-27): single bound character can render
// twice in wide shots. Force every Omni spec to include these.
const REQUIRED_NEGATIVE_TERMS = [
  "duplicate character", "twin", "clone", "two of the same",
  "mirrored figure", "second father", "second mother",
  "two Papa", "two Mama", "identical adults",
];

const argv = process.argv.slice(2);
const specPath = path.resolve(argv.find(a => !a.startsWith("--")) || "");
const dryRun = argv.includes("--dry-run");
const noGenerate = argv.includes("--no-generate");

if (!specPath || !fs.existsSync(specPath)) {
  console.error("Usage: submitOmniClip.mjs <clip_json_path> [--dry-run]");
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

// ─── VALIDATE SPEC ─────────────────────────────────────────────────────────
if (spec.mode !== "omni") {
  console.error(`❌ spec.mode must be "omni" (got "${spec.mode}"). Use submitSingleShotClip.mjs for legacy 5s clips.`);
  process.exit(1);
}
if (!spec.boundElements || spec.boundElements.length === 0 || spec.boundElements.length > 7) {
  console.error(`❌ spec.boundElements length must be 1-7 (got ${spec.boundElements?.length}).`);
  process.exit(1);
}
if (![5, 10, 15].includes(spec.durationSec)) {
  console.error(`❌ spec.durationSec must be 5, 10, or 15 (got ${spec.durationSec}).`);
  process.exit(1);
}
const expectedCredits = 30 * Math.ceil(spec.durationSec / 5) * (spec.nativeAudio ? 1.5 : 1);
if (spec.expectedCredits !== expectedCredits) {
  console.error(`❌ spec.expectedCredits (${spec.expectedCredits}) !== computed (${expectedCredits}). Fix the JSON.`);
  process.exit(1);
}

// Prompt-rule lint
for (const re of FORBIDDEN_PROMPT_PHRASES) {
  if (re.test(spec.prompt)) {
    console.error(`❌ prompt contains forbidden phrase ${re}. Edit the spec.`);
    process.exit(1);
  }
}

// Verify all @-tags reference declared boundElements
const tagsInPrompt = [...spec.prompt.matchAll(/@([A-Za-z][A-Za-z0-9_-]*)/g)].map(m => m[1]);
const declaredTags = spec.boundElements.map(e => e.tag);
for (const tag of tagsInPrompt) {
  if (!declaredTags.some(d => d.toLowerCase() === tag.toLowerCase())) {
    console.error(`❌ prompt uses @${tag} but no matching boundElement declared. Declared: [${declaredTags.join(", ")}]`);
    process.exit(1);
  }
}

// HARD GUARD: no duplicate tags in boundElements.
// Lesson from Ep 3 first test: clicking an empty slot without picking a specific
// element causes Kling to auto-fill with the most-recent pick → duplicate character
// in render. Hard-fail if the spec lists the same tag twice.
const dupTags = declaredTags.filter((t, i) => declaredTags.indexOf(t) !== i);
if (dupTags.length > 0) {
  console.error(`❌ duplicate boundElement tag(s): ${[...new Set(dupTags)].join(", ")}`);
  console.error(`   Each tag must appear at most once. Two slots bound to the same character causes Kling to render duplicates.`);
  process.exit(1);
}

// HARD GUARD: each tag must appear at most ONCE in the prompt.
// Lesson from Ep 3 first test (codegen 2026-04-28): tagging the same character
// twice (once for action, once for dialogue speaker) causes Kling to render the
// character TWICE on screen — clone bug. Single-bind only.
const tagCounts = {};
for (const t of tagsInPrompt) {
  const lc = t.toLowerCase();
  tagCounts[lc] = (tagCounts[lc] || 0) + 1;
}
const repeatedTags = Object.entries(tagCounts).filter(([_, n]) => n > 1).map(([t,n]) => `@${t} (×${n})`);
if (repeatedTags.length > 0) {
  console.error(`❌ prompt repeats @-tags: ${repeatedTags.join(", ")}`);
  console.error(`   Bind each element only ONCE per prompt. Repeated tags trigger duplicate renders (clone bug).`);
  console.error(`   For dialogue, use plain quoted text: \`@Postman walks ... \"line\"\` not \`@Postman walks ... @Postman: \"line\"\`.`);
  process.exit(1);
}

// HARD GUARD: bare @ with no tag in prompt — means a chip insertion failed.
// User saw this in the test render where '@: "Where did..."' resulted in
// improvised dialogue assignment by Kling.
const bareAtCount = (spec.prompt.match(/@(?![A-Za-z])/g) || []).length;
if (bareAtCount > 0) {
  console.error(`❌ prompt contains ${bareAtCount} bare "@" character(s) with no tag name following.`);
  console.error(`   Every "@" in the prompt must be immediately followed by a declared tag (e.g. @Sara, @kitchen).`);
  process.exit(1);
}

// HARD GUARD: @Image is a Kling default placeholder for un-named uploads.
// If we see it in the spec, the user forgot to name an uploaded element.
if (/@Image\b/i.test(spec.prompt)) {
  console.error(`❌ prompt contains "@Image" — that's Kling's default for un-named uploaded scenes.`);
  console.error(`   Every uploaded boundElement must be given a real name (e.g. "kitchen", "driveway").`);
  process.exit(1);
}

// HARD GUARD: prompt-pollution from un-dismissed autocomplete dropdown.
// Symptom seen in real test: prompt ends with a string of @-tags like
// "@Sara @Eva @Ginger @Joe @mama @Papa @Image" appended to the actual content.
// Detect a tail of 3+ consecutive @-tags separated only by whitespace.
const trailingTagSpam = /(?:@\w+[\s ]*){3,}\s*$/.test(spec.prompt.trim());
if (trailingTagSpam) {
  console.error(`❌ prompt ends with a tail of consecutive @-tags — likely autocomplete dropdown residue.`);
  console.error(`   Remove the trailing tag list. Only @-tags actually written into the script should remain.`);
  process.exit(1);
}

// Enforce required negative-prompt terms (defense against Kling rendering
// the same character twice in wide shots — first observed in Ep 3 dry run).
const negLower = (spec.negativePrompt || "").toLowerCase();
const missingNeg = REQUIRED_NEGATIVE_TERMS.filter(t => !negLower.includes(t.toLowerCase()));
if (missingNeg.length > 0) {
  console.error(`❌ negativePrompt missing required terms: ${missingNeg.join(", ")}`);
  console.error(`   Append these to spec.negativePrompt to defend against duplicate-character renders.`);
  process.exit(1);
}

// Library name verification — catch the "Joe rendered as Max" class of bug
const KNOWN_LIBRARY_NAMES = new Set(["Sara", "Eva", "Ginger", "Joe", "Mama", "Papa", "Grandma", "Postman"]);
for (const el of spec.boundElements) {
  if (el.source === "library" && !KNOWN_LIBRARY_NAMES.has(el.tag)) {
    console.warn(`⚠ boundElement tag "${el.tag}" not in known library set. If rendered output uses a different name (e.g. Joe → Max), the Kling library element is mis-named. Open the library and verify.`);
  }
}

console.log(`📋 ${path.basename(specPath)}`);
console.log(`   mode=${spec.mode} duration=${spec.durationSec}s quality=${spec.quality} NA=${spec.nativeAudio}`);
console.log(`   bind=${spec.boundElements.length} (${spec.boundElements.map(e=>e.tag).join(", ")})`);
console.log(`   credits=${expectedCredits}`);
if (dryRun) { console.log("✓ dry-run passed validation. Exiting."); process.exit(0); }

// ─── CONNECT TO BROWSER ─────────────────────────────────────────────────────
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 60_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

// Navigate to a Kling new-clip page if not already there.
// Kling's Omni mode lives at /app/omni/new; legacy single-shot at /app/video/new.
const url = page.url();
const onKlingNewPage = /\/app\/(omni|video)\/new/.test(url);
if (!onKlingNewPage) {
  console.log(`→ Navigating from ${url} → /app/omni/new`);
  await page.goto("https://kling.ai/app/omni/new?ac=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
}

// Click the Omni link only if we're not already in Omni mode.
if (!page.url().includes("/app/omni")) {
  console.log("→ Switching to Omni mode...");
  await page.getByRole("link", { name: "Omni" }).click();
  await page.waitForTimeout(1500);
} else {
  console.log("→ Already in Omni mode");
}

// CLEAR ANY PREVIOUS STATE — clicking Reset returns to a fresh page if the page
// already has bound elements / prompt text from a prior run.
const resetBtn = page.getByText("Reset", { exact: true }).first();
if (await resetBtn.isVisible().catch(() => false)) {
  console.log("→ Clicking Reset to clear previous state...");
  await resetBtn.click();
  await page.waitForTimeout(1200);
}

// Aggressively clear the prompt textbox via .fill('')
const promptBox = page.locator("#design-view-container").getByRole("textbox");
await promptBox.click().catch(() => {});
await promptBox.fill("").catch(() => {});
await page.waitForTimeout(300);

// ─── BIND ELEMENTS via Library / Upload ─────────────────────────────────────
// Library flow (codegen-verified): Add from Element Library → Characters/Scenes tab → click .cover
for (const el of spec.boundElements) {
  if (el.source === "library") {
    console.log(`  • Library: @${el.tag}`);
    await addLibraryElement(page, el.tag);
  } else if (el.source === "upload") {
    console.log(`  • Upload: @${el.tag} ← ${path.basename(el.file)}`);
    await addUploadElement(page, el.tag, path.resolve(el.file));
  }
  await page.waitForTimeout(700);
}

// ─── SET QUALITY + DURATION ─────────────────────────────────────────────────
// Verified codegen flow (v2 2026-04-27):
//   await page.locator('div').filter({ hasText: /^1080p · 5s$/ }).first().click();
//   await page.locator('#el-id-XXXX-XXX').getByText('720p').click();
//   await page.locator('#el-id-XXXX-XXX').getByText('10s').click();
//
// The trigger renders a single combined-text element "<quality> · <duration>".
// We match that with a regex so it works regardless of the current state.
// After opening, both options sit inside the same dropdown popper (an Element
// Plus .el-popper). We click both consecutively without re-opening.
console.log(`→ Quality=${spec.quality} Duration=${spec.durationSec}s`);
await setQualityAndDuration(page, spec.quality, spec.durationSec);

async function setQualityAndDuration(page, quality, durationSec) {
  // Try up to 3 times — Element Plus poppers are flaky if the previous one
  // hasn't fully unmounted.
  for (let attempt = 1; attempt <= 3; attempt++) {
    // Open the dropdown by clicking the combined "<quality> · <duration>" trigger.
    // Regex matches any current state (e.g. "1080p · 5s", "720p · 10s").
    const trigger = page.locator('div').filter({ hasText: /^\d{3,4}p · \d+s$/ }).first();
    if (await trigger.count() === 0) {
      console.warn(`  ⚠ attempt ${attempt}: combined-text trigger not found`);
      await page.waitForTimeout(500);
      continue;
    }
    await trigger.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);

    // The dropdown panel is an Element Plus popper. Take the visible one.
    // We re-locate fresh each time to avoid stale handles.
    const popper = page.locator('.el-popper:visible, [class*="popper"]:visible').last();
    if (await popper.count() === 0) {
      console.warn(`  ⚠ attempt ${attempt}: dropdown popper did not appear`);
      await page.waitForTimeout(500);
      continue;
    }

    // Click quality option, then duration option, inside the popper.
    const qOk = await popper.getByText(quality, { exact: true })
      .first().click({ timeout: 2500 }).then(() => true).catch(() => false);
    await page.waitForTimeout(300);
    const dOk = await popper.getByText(`${durationSec}s`, { exact: true })
      .first().click({ timeout: 2500 }).then(() => true).catch(() => false);
    await page.waitForTimeout(400);

    // Verify the trigger now reads "<quality> · <duration>"
    const triggerText = await page.locator('div').filter({ hasText: /^\d{3,4}p · \d+s$/ })
      .first().innerText().catch(() => "");
    const want = `${quality} · ${durationSec}s`;
    if (triggerText.trim() === want) {
      console.log(`  ✓ trigger now shows "${want}"`);
      // Click outside to dismiss any lingering popper
      await page.locator('body').click({ position: { x: 100, y: 100 } }).catch(() => {});
      await page.waitForTimeout(300);
      return;
    }

    console.warn(`  ⚠ attempt ${attempt}: trigger="${triggerText.trim()}" want="${want}" (qOk=${qOk} dOk=${dOk}) — retrying`);
    await page.locator('body').click({ position: { x: 100, y: 100 } }).catch(() => {});
    await page.waitForTimeout(700);
  }
  console.error(`  ❌ could not set ${quality} · ${durationSec}s after 3 attempts`);
}

// ─── TYPE PROMPT WITH @-AUTOCOMPLETE ────────────────────────────────────────
console.log("→ Typing prompt with @-autocomplete chips");
const textbox = page.locator("#design-view-container").getByRole("textbox");
await textbox.click();
// Clear any existing content (each library bind left an "@" + chip; we want a clean slate)
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.press("Backspace");
await page.waitForTimeout(300);

// Split prompt by @-tag boundaries and type each segment, inserting chips at @
const segments = spec.prompt.split(/@([A-Za-z][A-Za-z0-9_-]*)/);
// segments is [prefix, tag1, mid, tag2, ...]
for (let i = 0; i < segments.length; i++) {
  if (i % 2 === 0) {
    // even index = literal text
    if (segments[i]) await page.keyboard.type(segments[i], { delay: 8 });
  } else {
    // odd index = tag name to insert via dropdown
    const tag = segments[i];
    await page.keyboard.type("@");
    await page.waitForTimeout(350); // dropdown render
    // Click dropdown item — match by name (case-insensitive across library variations)
    const candidates = [
      page.getByRole("button", { name: tag, exact: true }),
      page.getByRole("button", { name: new RegExp(`^${tag}$`, "i") }),
    ];
    let inserted = false;
    for (const cand of candidates) {
      try { await cand.click({ timeout: 1500 }); inserted = true; break; } catch {}
    }
    if (!inserted) {
      console.error(`  ⚠ could not click @${tag} from autocomplete dropdown`);
      // Fallback: just leave literal @tag and continue
    }
    await page.waitForTimeout(150);
  }
}

// ─── ASSERT CREDIT COST ─────────────────────────────────────────────────────
await page.waitForTimeout(1200);
// Try multiple Generate-button locators (footer-scoped first, then any visible)
const genCandidates = [
  page.getByRole("contentinfo").getByRole("button", { name: /Generate/i }),
  page.getByRole("button", { name: /Generate/i }).last(),
  page.locator('button:has-text("Generate")').last(),
];
let generateBtn = null;
for (const cand of genCandidates) {
  if (await cand.isVisible().catch(() => false)) { generateBtn = cand; break; }
}
if (!generateBtn) {
  console.error("❌ Could not locate Generate button.");
  await browser.close();
  process.exit(2);
}
const btnText = (await generateBtn.innerText()).trim();
const costMatch = btnText.match(/(\d+)/);
if (!costMatch) {
  console.error(`❌ Could not read credit cost from Generate button. Text: "${btnText}"`);
  await browser.close();
  process.exit(2);
}
const actualCost = Number(costMatch[1]);
console.log(`💰 Generate button shows ${actualCost} credits (expected ${expectedCredits})`);
if (actualCost !== expectedCredits) {
  console.error(`❌ COST MISMATCH — expected ${expectedCredits}, got ${actualCost}. ABORTING (do not Generate).`);
  console.error("   Likely causes: Native Audio toggled off, wrong duration set, or 1080p selected.");
  await browser.close();
  process.exit(3);
}

// ─── GENERATE ───────────────────────────────────────────────────────────────
if (noGenerate) {
  console.log("⏸  --no-generate set: form is filled, Generate NOT clicked.");
  console.log(`   Review the page in Chrome. Click Generate manually when ready.`);
  console.log(`   Credit cost shown on button: ${actualCost}`);
  await browser.close();
  process.exit(0);
}
console.log("→ Clicking Generate (this WILL spend credits)...");
await generateBtn.click();
await page.waitForTimeout(2000);
console.log(`✅ Submitted ${path.basename(specPath)} — ${actualCost} credits`);
await browser.close();

// ─── HELPERS ────────────────────────────────────────────────────────────────

async function addLibraryElement(page, tag) {
  // Codegen-verified flow (2026-04-27 v3):
  //   0. Focus textbox + type "@" — this exposes the "Add from Element Library" button
  //   1. Click "Add from Element Library"
  //   2. Click category tab (Characters or Scenes — auto-detected)
  //   3. Click the element's .cover by exact name match
  //   4. Library panel closes; element bound; chip inserted at @ position

  // Close any stuck Create Element modal first
  if (await page.locator('.el-overlay-dialog:has-text("Create Element")').isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Cancel" }).first().click().catch(() => {});
    await page.waitForTimeout(400);
  }

  // 0. Focus textbox + type @ to trigger the Library button to render
  const textbox = page.locator("#design-view-container").getByRole("textbox");
  await textbox.click();
  await page.keyboard.type("@");
  await page.waitForTimeout(500);

  // 1. Open Library
  await page.getByRole("button", { name: "Add from Element Library" }).click();
  await page.waitForTimeout(800);

  // 2. Pick category — characters vs scenes (heuristic by tag casing/known set)
  const KNOWN_CHAR_TAGS = new Set(["Sara", "Eva", "Ginger", "Joe", "Mama", "Papa", "Grandma", "Postman"]);
  const category = KNOWN_CHAR_TAGS.has(tag) ? "Characters" : "Scenes";
  await page.getByText(category, { exact: true }).click().catch(() => {
    console.log(`    (category tab "${category}" not found, continuing without filter)`);
  });
  await page.waitForTimeout(500);

  // 3. Click the element by its visible name. The library panel renders
  //    .subject-item tiles with a label; click the one matching `tag`.
  const tile = page.locator(`.subject-item:has-text("${tag}")`).first();
  await tile.locator(".cover").click({ timeout: 5000 });
  console.log(`    ✓ selected library element @${tag} (${category})`);
  await page.waitForTimeout(500);

  // 4. Confirm if a confirm button is present
  const confirm = page.getByRole("button", { name: "Confirm" }).first();
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
    await page.waitForTimeout(400);
  }
}

async function addUploadElement(page, tag, filePath) {
  // Open subject panel + Add Image menu
  await page.locator(".subject-item").first().click();
  await page.waitForTimeout(400);
  await page.getByRole("menuitem", { name: "Add Image" }).click();
  await page.waitForTimeout(500);
  // Switch to Uploads tab
  await page.getByText("Uploads").click().catch(()=>{});
  await page.waitForTimeout(400);
  // Direct file upload via input
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(1500); // upload time
  // Pick the just-uploaded image (first in list)
  await page.locator(".image-item-mask, .image-item-source").first().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.waitForTimeout(500);
  // Name the new element
  const nameBox = page.getByRole("textbox", { name: "Enter Name" });
  await nameBox.click();
  await nameBox.fill(tag);
  await page.waitForTimeout(300);
  // Click the Generate-style "create" button (NOT the main generate at the footer —
  // this is the modal's Confirm/Done button to commit the new element).
  // The modal's generate button is contextual; some versions use "Create" or "Done".
  const createBtn = page.locator(
    'button:has-text("Create"), button:has-text("Done"), button:has-text("Generate")'
  ).filter({ hasNotText: /^\d+$/ }).first(); // skip the credit-counted main Generate
  await createBtn.click().catch(async () => {
    // Fallback: assume the contentinfo Generate finalizes element creation in this version
    await page.getByRole("contentinfo").getByRole("button", { name: "Generate" }).click();
  });
  await page.waitForTimeout(800);
}
