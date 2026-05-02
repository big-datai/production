import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT_DIR = process.argv[2];
if (!OUT_DIR) { console.error("Usage: grab_latest_omni.mjs <out_dir>"); process.exit(1); }
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 60_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();
console.log(`📺 Page: ${page.url()}`);

const saved = [];
page.on("download", async (dl) => {
  const fname = dl.suggestedFilename() || `download_${Date.now()}.bin`;
  const out = path.join(OUT_DIR, fname);
  await dl.saveAs(out);
  const sz = fs.statSync(out).size;
  console.log(`📥 saved ${fname} (${(sz/1024/1024).toFixed(2)} MB)  [suggested ext kept]`);
  saved.push(out);
});

// Always navigate fresh to reset any sticky select-mode state from prior runs
await page.goto("https://kling.ai/app/user-assets/materials?ac=1", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

await page.locator('[role="alert"] .close, .el-notification__closeBtn').first().click({ timeout: 1500 }).catch(()=>{});
await page.waitForTimeout(400);

// Enter Select mode (idempotent)
await page.getByRole("button", { name: "Select" }).click({ timeout: 5000 }).catch(() => console.log("(Select btn not found — may already be in select mode)"));
await page.waitForTimeout(1200);

// Tick first checkbox only
const cbs = await page.$$('.svg-icon.video-item-checkbox > .svg-icon');
console.log(`Found ${cbs.length} tiles. Ticking first...`);
if (cbs.length === 0) { console.error("❌ no tiles"); process.exit(2); }
await cbs[0].scrollIntoViewIfNeeded();
await cbs[0].click({ force: true, timeout: 2500 });
await page.waitForTimeout(800);

// Hover Download → click "Download without Watermark"
console.log("Hovering Download button...");
await page.locator('button:has-text("Download"), [class*="download"]:has-text("Download")').first().hover({ timeout: 5000 }).catch(()=>{});
await page.waitForTimeout(700);
console.log("Clicking 'Download without Watermark' menuitem...");
await page.getByRole("menuitem", { name: "Download without Watermark" }).click({ timeout: 8000 });

console.log("⏳ waiting up to 60s for download(s)...");
const start = saved.length;
for (let s = 0; s < 60; s++) {
  await page.waitForTimeout(1000);
  if (saved.length > start && s > 5) break;
}
console.log(`done. ${saved.length} file(s) saved.`);
for (const f of saved) console.log("  -", f);
await browser.close();
