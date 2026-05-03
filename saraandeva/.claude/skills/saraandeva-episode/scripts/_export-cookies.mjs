#!/usr/bin/env node
/**
 * Export cookies + localStorage from the debug-port Chrome's Kling tab to
 * .auth/kling-storage.json in Playwright's storage-state format.
 *
 * Use it to clone the user's logged-in session into a fresh Playwright
 * codegen window (so they don't have to re-login):
 *
 *   node _export-cookies.mjs
 *   npx playwright codegen --target=javascript \
 *     --load-storage=.auth/kling-storage.json \
 *     https://kling.ai/app/omni/new?ac=1
 *
 * Uses Playwright's connectOverCDP + ctx.storageState() — no `ws` dependency.
 */
import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

// Project-local persistent storage, resolved from this script's location.
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const STORAGE = path.join(PROJECT_ROOT, ".auth", "kling-storage.json");
fs.mkdirSync(path.dirname(STORAGE), { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
console.log(`📄 Source tab: ${page.url()}`);

const state = await ctx.storageState({ path: STORAGE });
const lsCount = state.origins.reduce((n, o) => n + o.localStorage.length, 0);
console.log(`✓ ${state.cookies.length} cookies + ${lsCount} localStorage entries → ${STORAGE}`);
console.log(`\nLoad in codegen (persistent — saves changes back to same file):`);
console.log(`  npx playwright codegen --target=javascript \\`);
console.log(`    --load-storage=${STORAGE} \\`);
console.log(`    --save-storage=${STORAGE} \\`);
console.log(`    https://kling.ai/app/omni/new?ac=1`);

await browser.close();
