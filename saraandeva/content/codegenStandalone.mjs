#!/usr/bin/env node
/**
 * Standalone codegen recorder with cookies — does NOT use the running pipeline
 * Chrome on port 9222. Launches its own Chrome window from a dedicated profile
 * dir that already has cookies seeded into it.
 *
 * Profile: /Users/admin1/chrome-codegen-profile  (full clone of
 * ~/chrome-pipeline-profile — cookies, localStorage, IndexedDB, prefs;
 * persists between runs).
 *
 * Re-sync the clone after a fresh login:
 *   sqlite3 "/Users/admin1/chrome-pipeline-profile/Default/Cookies" \
 *     ".backup '/Users/admin1/chrome-codegen-profile/Default/Cookies'"
 *
 * Why `channel: 'chrome'` and not bundled Chromium:
 *   macOS encrypts cookie values with a key in the login Keychain. The key is
 *   tied to the app bundle ID — Google Chrome uses "Chrome Safe Storage",
 *   Playwright's bundled Chromium uses "Chromium Safe Storage" (different
 *   key). Using channel:'chrome' makes Playwright drive your installed Google
 *   Chrome.app, which decrypts the seeded cookies fine.
 *
 * Why a separate profile from chrome-pipeline-profile:
 *   The pipeline Chrome (PID running with --remote-debugging-port=9222) holds
 *   an exclusive lock on chrome-pipeline-profile. Two browsers can't open the
 *   same profile at once. So codegen gets its own dir.
 *
 * Usage:
 *   node content/codegenStandalone.mjs                                  # Kling
 *   node content/codegenStandalone.mjs https://kling.ai/app/video/new
 *   node content/codegenStandalone.mjs https://www.youtube.com/
 *
 * Flow:
 *   1. Chrome window opens, lands on the URL — already logged in.
 *   2. Playwright Inspector window opens alongside it.
 *   3. Click red Record button in Inspector → click around in Chrome.
 *   4. Copy generated code from Inspector.
 *   5. Close Inspector or Ctrl+C terminal — closes the Chrome window too.
 */

import { chromium } from "playwright";

const PROFILE_DIR = "/Users/admin1/chrome-codegen-profile";
const TARGET_URL = process.argv[2] || "https://kling.ai/app/video/new?ac=1";

console.log(`🚀 Launching standalone Chrome from ${PROFILE_DIR}`);
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chrome",
  headless: false,
  viewport: null,
  args: ["--no-first-run", "--no-default-browser-check"],
});

const page = context.pages()[0] || (await context.newPage());
await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
await page.bringToFront();

console.log(`
═══════════════════════════════════════════════════════════════════
 PLAYWRIGHT INSPECTOR — codegen with auth
═══════════════════════════════════════════════════════════════════
 1. Click the red "Record" button in the Inspector (top-left).
 2. Click around in the Chrome window — every action emits code.
 3. Copy the generated code from the Inspector's right pane.
 4. Close the Inspector, or Ctrl+C this terminal.
═══════════════════════════════════════════════════════════════════
`);

await page.pause();

console.log("👋 Closing standalone Chrome and exiting.");
await context.close();
