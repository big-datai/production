#!/usr/bin/env node
/**
 * Connect Playwright to the pipeline Chrome via CDP and open a new tab.
 *
 * Pre-req: Chrome running with the persistent pipeline profile and remote
 * debugging on port 9222:
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --remote-debugging-port=9222 \
 *     --user-data-dir=/Users/admin1/chrome-pipeline-profile
 *
 * Usage:
 *   node content/connectCdp.mjs            # opens https://www.google.com/
 *   node content/connectCdp.mjs <url>      # opens <url>
 */

import { chromium } from "playwright";

const CDP_URL = "http://127.0.0.1:9222";
const TARGET_URL = process.argv[2] || "https://www.google.com/";

const browser = await chromium.connectOverCDP(CDP_URL);
const [context] = browser.contexts();
if (!context) throw new Error("No browser context — is Chrome actually running?");

const page = await context.newPage();
await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
await page.bringToFront();

console.log(`✅ Opened tab: ${page.url()}`);
console.log(`   Title: ${await page.title()}`);
console.log(`   Total tabs in context: ${context.pages().length}`);

// Don't call browser.close() here — it can detach tabs we opened via newPage().
// Just disconnect cleanly; the Node process exits and Chrome lives on.
await browser._channel.dispose?.().catch(() => {});
