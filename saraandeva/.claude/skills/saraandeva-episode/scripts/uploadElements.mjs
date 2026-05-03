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

// ─── Phase 2b: per-element create flow (codegen 2026-05-02) ────────────────
let ok = 0, fail = 0;
for (let i = 0; i < toCreate.length; i++) {
  const t = toCreate[i];
  console.log(`\n[${String(i + 1).padStart(2, "0")}/${toCreate.length}] @${t.tag}  ← ${path.basename(t.file)}`);
  try {
    // 1. Primary upload (top-level Image/Video upload button)
    await page.getByRole("button", { name: "Image/Video" }).setInputFiles(t.file);
    await page.waitForTimeout(2000);
    console.log("   ✓ primary uploaded");

    // 2. Open subject panel → History → Add Image
    await page.locator(".subject-item").first().click();
    await page.getByRole("button", { name: "History" }).click();
    await page.getByLabel("History").getByText("Add Image").click();

    // 3. Switch to Uploads tab and pick the most recent (just-uploaded) image
    await page.getByText("Uploads").click();
    await page.waitForTimeout(500);
    await page.locator(".image-item-mask").first().click();
    await page.getByRole("button", { name: "Confirm" }).click();
    console.log("   ✓ picked from Uploads");

    // 4. Name the element
    const nameBox = page.getByRole("textbox", { name: "Enter Name" });
    await nameBox.click();
    await nameBox.fill(t.tag);
    console.log(`   ✓ named "${t.tag}"`);

    // 5. Secondary reference upload (same file → consistent style)
    await page.locator(
      ".secondary-reference > .upload > div > .el-upload > .el-upload-dragger > .upload-content > svg"
    ).click();
    await page.locator(".secondary-reference > .upload > div > .el-upload").setInputFiles(t.file);
    await page.waitForTimeout(2000);
    console.log("   ✓ secondary reference uploaded");

    // 6. Auto × 2 (style sliders default to Auto)
    const autoBtn = page.getByRole("button", { name: "Auto" });
    await autoBtn.click();
    await autoBtn.click();

    // 7. Generate (footer button)
    await page.getByRole("contentinfo").getByRole("button", { name: "Generate" }).click();
    console.log("   ✓ Generate clicked");

    // 8. Wait for the element panel to settle before next element
    await page.waitForTimeout(3500);
    ok++;
  } catch (err) {
    console.log(`   ❌ ${err.message}`);
    fail++;
  }
}

console.log(`\n✅ done — ${ok} created, ${fail} failed, ${skip.length} skipped (of ${targets.length} total)`);
console.log(`\nNext: verify in Kling library, then run submitOmniClip.mjs for clips that need them.`);
await browser.close();
