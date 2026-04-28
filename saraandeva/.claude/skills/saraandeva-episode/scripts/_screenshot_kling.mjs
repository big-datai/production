import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();
console.log("URL:", page.url());
await page.screenshot({ path: "/tmp/kling-current.png", fullPage: false });
console.log("📸 saved /tmp/kling-current.png");
await browser.close();
