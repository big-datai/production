#!/usr/bin/env node
/**
 * Upload ONLY the 6 new ep08 bound elements to Kling's Uploads library
 * (3 scenes + 3 props). Targeted version of uploadToKling.mjs — avoids
 * bulk-uploading every PNG in assets/scenes/ (which would also pull in
 * the v2/v3 prop variants we rejected and the coupon_book/papa_notepad
 * already uploaded for ep07).
 *
 * Prereqs:
 *   - Chrome running with --remote-debugging-port=9222
 *   - Kling tab open and logged in
 *
 * Usage:
 *   node saraandeva/content/uploadEp08Elements.mjs           # upload all 6
 *   node saraandeva/content/uploadEp08Elements.mjs --dry-run # preview
 */

import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SCENES_DIR = path.join(ROOT, "assets", "scenes");
const CDP_URL = "http://127.0.0.1:9222";
const DRY_RUN = process.argv.includes("--dry-run");

const TARGETS = [
  { tag: "dentist-waiting",    file: "dentist_waiting.png",     kind: "scene" },
  { tag: "dentist-chair",      file: "dentist_chair.png",       kind: "scene" },
  { tag: "tesla-interior",     file: "tesla_interior.png",      kind: "scene" },
  { tag: "gas-mask",           file: "gas_mask.png",            kind: "prop"  },
  { tag: "dental-coin",        file: "dental_coin.png",         kind: "prop"  },
  { tag: "dentist-goodie-bag", file: "dentist_goodie_bag.png",  kind: "prop"  },
];

async function main() {
  const toUpload = TARGETS.map((t) => ({ ...t, path: path.join(SCENES_DIR, t.file) }));

  // Sanity-check every file exists before opening a browser.
  for (const t of toUpload) {
    if (!fs.existsSync(t.path)) {
      console.error(`❌ missing: ${t.path}`);
      process.exit(1);
    }
  }

  console.log(`📊 ${toUpload.length} ep08 bound elements to upload to Kling library:\n`);
  for (const t of toUpload) {
    console.log(`   [${t.kind}]  @${t.tag.padEnd(22)} ← ${t.file}`);
  }

  if (DRY_RUN) {
    console.log("\n[dry-run] exiting without uploading");
    return;
  }

  console.log(`\n🔌 Looking up Kling tab at ${CDP_URL}/json...`);
  const resp = await fetch(`${CDP_URL}/json`);
  const tabs = await resp.json();
  const kling = tabs.find((t) => t.type === "page" && t.url.includes("kling.ai"));
  if (!kling) {
    console.error("❌ No Kling tab found. Open kling.ai in Chrome (debug port 9222) and rerun.");
    process.exit(1);
  }
  console.log(`📄 Found Kling tab: ${kling.url}`);

  console.log(`🔌 Connecting via CDP...`);
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 300_000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
  if (!page) {
    console.error("❌ Kling page missing in context.");
    process.exit(1);
  }
  await page.bringToFront();

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < toUpload.length; i++) {
    const t = toUpload[i];
    process.stdout.write(`\n[${String(i + 1).padStart(2, "0")}/${toUpload.length}] @${t.tag.padEnd(22)}  `);
    try {
      const inputs = await page.$$('input[name="file"]');
      if (inputs.length === 0) throw new Error("no file input on page");
      const input = inputs[inputs.length - 1];
      await input.setInputFiles(t.path);
      process.stdout.write("uploaded → ");
      await page.waitForTimeout(4000);
      process.stdout.write("✓");
      ok += 1;
    } catch (err) {
      process.stdout.write(`❌ ${err.message}`);
      fail += 1;
    }
  }

  console.log(`\n\n✅ done — ${ok} uploaded, ${fail} failed (of ${toUpload.length})`);
  console.log("\nNext: rename each upload to its canonical tag in Kling's library UI:");
  for (const t of toUpload) console.log(`   → @${t.tag}`);
  console.log("\nThen run submitOmniClip.mjs for clips 1-19 to start rendering.");
  await browser.close();
}

main().catch((e) => {
  console.error("\n❌", e.message);
  process.exit(1);
});
