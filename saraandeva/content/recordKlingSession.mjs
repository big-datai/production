#!/usr/bin/env node
/**
 * Connect to the user's existing Chrome via CDP (remote-debugging-port 9222),
 * attach to their already-logged-in Kling tab (or open one), and pause in
 * the Playwright Inspector so actions can be recorded.
 *
 * Pre-req: Chrome must be running with --remote-debugging-port=9222.
 *   One-time command (if Chrome isn't already launched with the flag):
 *     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *       --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-pipeline-profile
 *
 * Usage:
 *   node content/saraandeva/recordKlingSession.mjs
 *
 * When the Inspector window opens:
 *   1. Click the "Record" button (red circle) in the Inspector toolbar.
 *   2. Click through Kling in the browser — every click/type generates code
 *      in the Inspector's code panel.
 *   3. When done, copy the generated code from the Inspector.
 *   4. Paste it into this terminal (or save manually).
 *   5. Close the Inspector (or press Ctrl+C in the terminal) — the Node
 *      script exits but YOUR Chrome keeps running with the CDP port alive.
 */

import { chromium } from "playwright";

const CDP_URL = "http://127.0.0.1:9222";

async function main() {
  console.log(`🔌 Connecting to Chrome via CDP at ${CDP_URL}...`);
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    throw new Error("No browser contexts found. Is Chrome actually running?");
  }
  const context = contexts[0];

  // Find an existing Kling tab. Creating a new tab over CDP fails on the
  // user's daily-driver Chrome ("Browser context management is not
  // supported"). Require the tab to already exist.
  const allPages = context.pages();
  const page = allPages.find((p) => p.url().includes("kling.ai"));
  if (!page) {
    throw new Error(
      "No Kling tab found in your Chrome.\n\n" +
        "   → Open https://kling.ai/app/video/new?ac=1 manually in your Chrome,\n" +
        "     then rerun this script.\n\n" +
        "   Open tabs right now:\n" +
        allPages.map((p, i) => `     ${i + 1}. ${p.url()}`).join("\n")
    );
  }
  console.log(`📄 Attached to existing Kling tab: ${page.url()}`);
  await page.bringToFront();

  console.log(`
════════════════════════════════════════════════════════════════════
 PLAYWRIGHT INSPECTOR OPENING
════════════════════════════════════════════════════════════════════

 1. In the Inspector window, click the red "Record" button (top-left).
 2. Switch to the Chrome window and click through Kling:
    - Click "Bind elements to enhance consistency"
    - Create → upload house_aerial.png → name it HouseAerial
    - Click "Custom Multi-Shot"
    - Fill Shot 1 / Shot 2 / Shot 3 prompts + 5s each
    - Native Audio OFF, verify 720p · 15s · 1
    - HOVER (don't click) the Generate button to confirm 90 credits
 3. Every action shows up as code in the Inspector's right pane.
 4. When done, copy the code and paste it in the terminal.
 5. Close this terminal (Ctrl+C) to exit — Chrome keeps running.

════════════════════════════════════════════════════════════════════
`);

  // Open the Inspector. This blocks here until user resumes or closes.
  await page.pause();

  console.log("👋 Inspector closed. Disconnecting from Chrome (Chrome keeps running).");
  await browser.close();
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  if (err.message.includes("ECONNREFUSED")) {
    console.error(
      "\nChrome is not listening on port 9222. Start it with:\n" +
        '  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-pipeline-profile\n'
    );
  }
  process.exit(1);
});
