import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
if (!page) { console.error("No Kling tab"); process.exit(1); }
await page.bringToFront();

// Make sure we're on materials page
if (!page.url().includes("/user-assets")) {
  await page.goto("https://kling.ai/app/user-assets/materials?ac=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
}

await page.screenshot({ path: "/tmp/kling-materials-before-scroll.png", fullPage: false });
console.log("✓ before-scroll screenshot");

// Count visible video tiles
const before = await page.evaluate(() => document.querySelectorAll('video, [class*="card"]:has(video), [class*="material"] video').length);
console.log("Video tiles visible before scroll:", before);

// Scroll down 2000px
await page.evaluate(() => window.scrollBy(0, 2000));
await page.waitForTimeout(1500);

await page.screenshot({ path: "/tmp/kling-materials-after-scroll.png", fullPage: false });
console.log("✓ after-scroll screenshot");

const after = await page.evaluate(() => document.querySelectorAll('video, [class*="card"]:has(video), [class*="material"] video').length);
console.log("Video tiles visible after scroll:", after);

await browser.close();
