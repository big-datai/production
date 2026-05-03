#!/usr/bin/env node
/**
 * Standalone codegen against the running pipeline Chrome (CDP port 9222).
 *
 * Pre-req: Chrome already running with the persistent pipeline profile and
 * remote debugging on port 9222 (you already have this set up).
 *
 * Usage:
 *   node content/codegenCdp.mjs                                  # opens Kling
 *   node content/codegenCdp.mjs https://kling.ai/app/video/new
 *   node content/codegenCdp.mjs https://www.youtube.com/
 *
 * What happens:
 *   1. Connects to your pipeline Chrome over CDP.
 *   2. Reuses an existing tab on the URL's host if it's open, otherwise opens
 *      a new tab.
 *   3. Calls page.pause() — the Playwright Inspector window appears.
 *   4. Click the red Record button in the Inspector, then click around in
 *      Chrome — every action emits code in the Inspector's right pane.
 *   5. Copy the generated code, then close the Inspector (or Ctrl+C the
 *      terminal). Chrome and your tabs stay alive.
 */

import { chromium } from "playwright";

const CDP_URL = "http://127.0.0.1:9222";
const TARGET_URL = process.argv[2] || "https://kling.ai/app/video/new?ac=1";

const browser = await chromium.connectOverCDP(CDP_URL);
const [context] = browser.contexts();
if (!context) throw new Error("No browser context — is pipeline Chrome running?");

const targetHost = new URL(TARGET_URL).host;
let page = context.pages().find((p) => {
  try { return new URL(p.url()).host === targetHost; } catch { return false; }
});

if (page) {
  console.log(`📄 Reusing existing tab: ${page.url()}`);
} else {
  console.log(`🆕 Opening new tab on ${TARGET_URL}`);
  page = await context.newPage();
  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

console.log(`
════════════════════════════════════════════════════════════════════
 PLAYWRIGHT INSPECTOR OPENING — codegen recorder
════════════════════════════════════════════════════════════════════

 1. The Inspector window pops up shortly. Click the red "Record"
    button (top-left).
 2. Switch to your Chrome window and click around — every click,
    type, navigation gets emitted as code in the Inspector's right
    pane.
 3. Copy the generated code when you're done.
 4. Close the Inspector or Ctrl+C this terminal — Chrome and tabs
    stay alive.

════════════════════════════════════════════════════════════════════
`);

await page.pause();

console.log("👋 Inspector closed. Disconnecting (Chrome keeps running).");
// Don't browser.close() — that can detach tabs we opened. Process exit is enough.
