#!/usr/bin/env node
/**
 * Upload PNGs to Kling and create named bound elements (scenes / props).
 *
 * Replaces the old uploadEp<NN>Elements.mjs scripts which only uploaded files
 * to the Uploads tab — they did NOT create the named library element. This
 * one runs the full codegen-2026-05-02 flow: upload primary → open subject →
 * History → Add Image → Uploads → pick → Confirm → fill name → upload secondary
 * reference → Auto × 2 → Generate.
 *
 * Prereqs:
 *   - Chrome running with --remote-debugging-port=9222
 *   - Kling tab open at /app/omni/new and logged in
 *
 * Usage:
 *   # From a manifest file (JSON array of {tag, file, kind?})
 *   node uploadElements.mjs <manifest.json>
 *
 *   # From a consolidated episode JSON's newBoundElements
 *   node uploadElements.mjs --episode=8
 *
 *   # Inline single element
 *   node uploadElements.mjs --tag=pool --file=/abs/path/pool.png
 *
 *   # Dry-run (validate inputs only, no browser)
 *   node uploadElements.mjs <input> --dry-run
 */
import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

const CDP_URL = "http://127.0.0.1:9222";
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");

// ─── Parse args ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv.filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const positional = argv.filter(a => !a.startsWith("--"));
const dryRun = flags["dry-run"] === "true";

// ─── Build target list ──────────────────────────────────────────────────────
let targets = [];

if (flags.tag && flags.file) {
  targets = [{ tag: flags.tag, file: path.resolve(flags.file), kind: flags.kind ?? "scene" }];
} else if (flags.episode) {
  const epPath = path.join(PROJECT_ROOT, "content", "episodes", `ep${flags.episode.padStart(2, "0")}.json`);
  if (!fs.existsSync(epPath)) {
    console.error(`❌ episode JSON not found: ${epPath}`);
    process.exit(1);
  }
  const ep = JSON.parse(fs.readFileSync(epPath, "utf8"));
  targets = (ep.newBoundElements || []).map(e => ({
    tag: e.tag,
    file: path.isAbsolute(e.asset) ? e.asset : path.join(PROJECT_ROOT, e.asset),
    kind: e.purpose?.match(/scene|room|interior/i) ? "scene" : "prop",
  }));
} else if (positional[0]) {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(positional[0]), "utf8"));
  targets = manifest.map(e => ({
    tag: e.tag,
    file: path.isAbsolute(e.file) ? e.file : path.resolve(path.dirname(positional[0]), e.file),
    kind: e.kind ?? "scene",
  }));
} else {
  console.error(`Usage:
  node uploadElements.mjs <manifest.json>
  node uploadElements.mjs --episode=8
  node uploadElements.mjs --tag=pool --file=/abs/path/pool.png
  add --dry-run to preview`);
  process.exit(1);
}

if (targets.length === 0) {
  console.error("❌ no targets to upload");
  process.exit(1);
}

for (const t of targets) {
  if (!t.tag || !t.file) {
    console.error(`❌ malformed target: ${JSON.stringify(t)}`);
    process.exit(1);
  }
  if (!fs.existsSync(t.file)) {
    console.error(`❌ file missing: ${t.file}`);
    process.exit(1);
  }
}

console.log(`📊 ${targets.length} element(s) to upload + create on Kling:`);
for (const t of targets) {
  console.log(`   [${t.kind.padEnd(5)}]  @${t.tag.padEnd(24)} ← ${path.relative(PROJECT_ROOT, t.file)}`);
}

if (dryRun) {
  console.log(`\n[dry-run] exiting`);
  process.exit(0);
}

// ─── Connect to Chrome ──────────────────────────────────────────────────────
console.log(`\n🔌 Connecting to Chrome at ${CDP_URL}...`);
const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai"));
if (!page) {
  console.error(`❌ no kling.ai tab found in Chrome. Open https://kling.ai/app/omni/new and retry.`);
  process.exit(1);
}
console.log(`📄 ${page.url()}`);
await page.bringToFront();

// ─── Best-effort: dismiss header banner if present ─────────────────────────
try {
  await page.locator(".svg-icon.header-close").click({ timeout: 2000 });
  console.log("   ✓ closed header banner");
} catch {}

// ─── Phase 2a: scan Kling library, skip targets already there ──────────────
const forceCreate = flags["force-create"] === "true";
let existing = new Set();
if (!forceCreate) {
  console.log(`\n🔍 Scanning Kling library for existing elements...`);
  try {
    const textbox = page.locator("#design-view-container").getByRole("textbox");
    await textbox.click();
    await page.keyboard.type("@");
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Add from Element Library" }).click();
    await page.waitForTimeout(900);
    try {
      const allTab = page.locator("div")
        .filter({ has: page.locator('> span:text-is("All")') })
        .filter({ has: page.locator("> span.total-number") })
        .first();
      if (await allTab.isVisible({ timeout: 800 }).catch(() => false)) {
        await allTab.click({ timeout: 1500 });
      }
    } catch {}
    await page.waitForTimeout(500);

    // Scroll the library a few times so paginated tiles all load
    for (let s = 0; s < 6; s++) {
      const tiles = await page.locator(".subject-item").allInnerTexts().catch(() => []);
      for (const t of tiles) {
        const name = t.split("\n")[0].trim();
        if (name) existing.add(name.toLowerCase());
      }
      await page.locator(".subject-item").last().scrollIntoViewIfNeeded().catch(() => {});
      await page.mouse.wheel(0, 600).catch(() => {});
      await page.waitForTimeout(350);
    }
    // Final read after last scroll
    const tilesFinal = await page.locator(".subject-item").allInnerTexts().catch(() => []);
    for (const t of tilesFinal) {
      const name = t.split("\n")[0].trim();
      if (name) existing.add(name.toLowerCase());
    }
    console.log(`   ✓ ${existing.size} library elements found`);

    // Close the library panel + clear the lingering "@" from the textbox
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
    await textbox.click().catch(() => {});
    await page.keyboard.press("Backspace").catch(() => {});
  } catch (err) {
    console.warn(`   ⚠ library scan failed (${err.message}) — falling back to create-all`);
    existing = new Set();
  }
} else {
  console.log(`\n⚠ --force-create: skipping library scan, will attempt to create all targets`);
}

const skip = targets.filter(t => existing.has(t.tag.toLowerCase()));
const toCreate = targets.filter(t => !existing.has(t.tag.toLowerCase()));
for (const s of skip) console.log(`   ⏭  @${s.tag} (already in library)`);
console.log(`\n→ ${toCreate.length} to create, ${skip.length} already present`);

if (toCreate.length === 0) {
  console.log(`\n✅ nothing to do — all ${targets.length} target(s) already in library`);
  await browser.close();
  process.exit(0);
}

// ─── Phase 2b: per-element create flow (real codegen 2026-05-03) ───────────
// From a true Playwright codegen recording. Uses /user-assets/materials
// (not /omni/new) and triggers the Create Element dialog via the
// kwai-video-interactive widget. The CSS-module class has a hash suffix
// (e.g. `_kwai-player-video-interactive_5ef20_11`) that may change between
// Kling deploys — we use substring match for stability.
let ok = 0, fail = 0;
for (let i = 0; i < toCreate.length; i++) {
  const t = toCreate[i];
  console.log(`\n[${String(i + 1).padStart(2, "0")}/${toCreate.length}] @${t.tag}  ← ${path.basename(t.file)}`);
  try {
    // 1. Navigate to the Materials page
    await page.goto("https://kling.ai/app/user-assets/materials?ac=1", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    // 2. Click Principal Assets (best-effort — only on first iteration usually)
    try {
      await page.getByText("Principal Assets").first().click({ timeout: 3000 });
      await page.waitForTimeout(800);
    } catch {}

    // 3. Click the kwai-video-interactive widget — opens the create-context menu.
    //    Use substring match to survive CSS-module hash changes.
    const trigger = page.locator('[class*="kwai-player-video-interactive"]').first();
    await trigger.waitFor({ state: "visible", timeout: 15000 });
    await trigger.click();
    await page.waitForTimeout(700);

    // 4. Click "Add Image" menuitem from the popup
    await page.getByRole("menuitem", { name: /^Add Image$/ }).click({ timeout: 8000 });
    await page.waitForTimeout(1200);

    // 5. setInputFiles to the LAST <input type=file> that just appeared in
    //    the Create Element dialog (this is the primary image upload)
    let primaryInputs = await page.$$('input[type="file"]');
    if (primaryInputs.length === 0) throw new Error("no <input type=file> after Add Image click");
    await primaryInputs[primaryInputs.length - 1].setInputFiles(t.file);
    console.log("   → primary file submitted, waiting 3s for upload...");
    await page.waitForTimeout(3000);

    // 6. Fill the element name (Enter Name textbox)
    const nameBox = page.getByRole("textbox", { name: /^Enter Name$/ });
    await nameBox.waitFor({ state: "visible", timeout: 10000 });
    await nameBox.click();
    await nameBox.press("ControlOrMeta+a");
    await nameBox.fill(t.tag);
    console.log(`   ✓ named "${t.tag}"`);

    // 7. Open + upload secondary reference (same .secondary-reference path)
    await page.locator(
      ".secondary-reference > .upload > div > .el-upload > .el-upload-dragger > .upload-content > svg"
    ).click();
    await page.waitForTimeout(500);
    await page.locator(".secondary-reference > .upload > div > .el-upload").setInputFiles(t.file);
    await page.waitForTimeout(3000);
    console.log("   ✓ secondary uploaded");

    // 8. Auto-description (best-effort)
    await page.getByRole("button", { name: /^Auto$/i }).click().catch(() => {});
    await page.waitForTimeout(300);

    // 9. Generate (no contentinfo wrapper in this codegen)
    await page.getByRole("button", { name: /^Generate$/i }).click();
    console.log("   ✓ Generate clicked");

    // 10. Let Kling finalize the create. Watch for the dialog to close
    //     (Enter Name textbox detaches when dialog dismisses).
    await page.waitForFunction(
      () => {
        const el = document.querySelector('input[placeholder="Enter Name"], [aria-label="Enter Name"]');
        return !el || !el.offsetParent; // null OR not visible
      },
      null,
      { timeout: 60000 }
    ).catch(() => {});
    console.log(`   ✅ ${t.tag} created`);
    ok++;
  } catch (err) {
    console.log(`   ❌ ${err.message}`);
    fail++;
  }
}

console.log(`\n✅ done — ${ok} created, ${fail} failed, ${skip.length} skipped (of ${targets.length} total)`);
console.log(`\nNext: verify in Kling library, then run submitOmniClip.mjs for clips that need them.`);
await browser.close();
