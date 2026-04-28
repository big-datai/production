#!/usr/bin/env node
/**
 * Attach to the debug-port Chrome and navigate the active tab to Kling's
 * video-new page. Prints whether a login is needed.
 */
import { chromium } from "playwright";

const CDP_URL = "http://127.0.0.1:9222";
const KLING_URL = "https://kling.ai/app/video/new?ac=1";

const browser = await chromium.connectOverCDP(CDP_URL);
const ctx = browser.contexts()[0];
if (!ctx) {
  console.error("No context");
  process.exit(1);
}
const pages = ctx.pages();
let page = pages.find((p) => p.url().includes("kling.ai"));
if (!page) {
  page = pages[0] || (await ctx.newPage());
  console.log(`Navigating existing tab to ${KLING_URL}`);
  await page.goto(KLING_URL, { waitUntil: "load", timeout: 30000 }).catch(() => {});
}
await page.bringToFront();
console.log("Current URL:", page.url());
console.log("Title:", await page.title().catch(() => "?"));
await browser.close();
