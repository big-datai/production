#!/usr/bin/env node
/**
 * Upload the missing character + scene PNGs to Kling's Uploads library via
 * CDP-attached Playwright. Uses the same browser-level WS pattern as the
 * recorder.
 *
 * Safe behaviour:
 *  - Attaches to the EXISTING Kling tab — does NOT open a new one.
 *  - Uses `setInputFiles` on the hidden input[name="file"] — no UI clicks
 *    required (no risk of accidentally clicking Generate).
 *  - Waits 4s after each upload for the UI to process it.
 *  - Skips anything already present in /tmp/kling-actions.jsonl log.
 *
 * Usage:
 *   node content/saraandeva/uploadToKling.mjs
 *   node content/saraandeva/uploadToKling.mjs --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const CDP_URL = "http://127.0.0.1:9222";
const LOG_FILE = "/tmp/kling-actions.jsonl";
const DRY_RUN = process.argv.includes("--dry-run");

function alreadyUploaded() {
  const seen = new Set();
  if (fs.existsSync(LOG_FILE)) {
    for (const line of fs.readFileSync(LOG_FILE, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const a = JSON.parse(line);
        if (a.kind === "upload" && Array.isArray(a.files)) {
          a.files.forEach((f) => seen.add(f));
        }
      } catch {}
    }
  }
  return seen;
}

function missingFiles() {
  const charsDir = path.join(ROOT, "assets/characters/saraandeva");
  const scenesDir = path.join(charsDir, "scenes");
  const uploaded = alreadyUploaded();

  const charFiles = fs
    .readdirSync(charsDir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => ({ name: f, path: path.join(charsDir, f), kind: "character" }));
  const sceneFiles = fs
    .readdirSync(scenesDir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => ({ name: f, path: path.join(scenesDir, f), kind: "scene" }));

  return [...charFiles, ...sceneFiles].filter((f) => !uploaded.has(f.name));
}

async function main() {
  const toUpload = missingFiles();
  console.log(`📊 ${toUpload.length} files to upload to Kling\n`);
  for (const f of toUpload) {
    console.log(`   [${f.kind}] ${f.name}`);
  }
  if (DRY_RUN) {
    console.log("\n[dry-run] exiting without uploading");
    return;
  }
  if (toUpload.length === 0) {
    console.log("Nothing to upload.");
    return;
  }

  // Attach to existing Kling tab via CDP browser WS
  console.log(`\n🔌 Looking up Kling tab at ${CDP_URL}/json...`);
  const resp = await fetch(`${CDP_URL}/json`);
  const tabs = await resp.json();
  const kling = tabs.find((t) => t.type === "page" && t.url.includes("kling.ai"));
  if (!kling) {
    console.error("❌ No Kling tab found. Open kling.ai/app/video/new in Chrome and rerun.");
    process.exit(1);
  }
  console.log(`📄 Found Kling tab: ${kling.url}`);

  console.log(`🔌 Connecting via CDP (5 min timeout for Kling worker-storm)...`);
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 300_000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
  if (!page) {
    console.error("❌ Kling page missing in context.");
    process.exit(1);
  }
  await page.bringToFront();

  let ok = 0,
    fail = 0;
  for (let i = 0; i < toUpload.length; i++) {
    const f = toUpload[i];
    process.stdout.write(
      `\n[${String(i + 1).padStart(2, "0")}/${toUpload.length}] ${f.name}  `
    );
    try {
      // Find the first visible, enabled file input on the page
      const inputs = await page.$$('input[name="file"]');
      if (inputs.length === 0) throw new Error("no file input on page");
      // Use the LAST one — on Kling the last input tends to be the active
      // upload target after a bind dialog is opened.
      const input = inputs[inputs.length - 1];
      await input.setInputFiles(f.path);
      process.stdout.write("uploaded → ");
      // Wait for the upload to settle. 4s is empirically safe.
      await page.waitForTimeout(4000);
      process.stdout.write("✓");
      ok += 1;
    } catch (err) {
      process.stdout.write(`❌ ${err.message}`);
      fail += 1;
    }
  }

  console.log(`\n\n✅ done — ${ok} uploaded, ${fail} failed (of ${toUpload.length})`);
  await browser.close();
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
