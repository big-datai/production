import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
await page.bringToFront();

// First, hover over last shot to maybe reveal delete affordance
const last = page.locator(".storyboard-item").last();
await last.scrollIntoViewIfNeeded();
await last.hover().catch(() => {});
await page.waitForTimeout(500);

const html = await last.evaluate(el => el.outerHTML.slice(0, 4000));
console.log(html);
await browser.close();
