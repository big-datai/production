#!/usr/bin/env node
/**
 * Export cookies + localStorage from the debug-port Chrome's Kling tab to
 * /tmp/kling-storage.json in Playwright's storage-state format.
 *
 * Use it to clone the user's logged-in session into a fresh Playwright
 * codegen window (so they don't have to re-login):
 *
 *   node _export-cookies.mjs
 *   npx playwright codegen --target=javascript \
 *     --load-storage=/tmp/kling-storage.json \
 *     https://kling.ai/app/omni/new?ac=1
 *
 * Uses Playwright's connectOverCDP + ctx.storageState() — no `ws` dependency.
 */
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
console.log(`📄 Source tab: ${page.url()}`);

const state = await ctx.storageState({ path: "/tmp/kling-storage.json" });
const lsCount = state.origins.reduce((n, o) => n + o.localStorage.length, 0);
console.log(`✓ ${state.cookies.length} cookies + ${lsCount} localStorage entries → /tmp/kling-storage.json`);
console.log(`\nLoad in codegen:`);
console.log(`  npx playwright codegen --target=javascript --load-storage=/tmp/kling-storage.json https://kling.ai/app/omni/new?ac=1`);

await browser.close();
