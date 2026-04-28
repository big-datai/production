import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai"));
if (!page) { console.log("NO_KLING_TAB"); process.exit(0); }
await page.bringToFront();
await page.screenshot({ path: "/tmp/kling-screenshot.png", fullPage: false });
const state = await page.evaluate(() => ({
  url: location.href,
  viewport: { w: innerWidth, h: innerHeight },
  banner: !!document.getElementById('__klingRecorderBanner'),
  counter: !!document.getElementById('__klingRecorderCounter'),
  installed: !!window.__klingRecorderInstalled,
  bodyChildren: document.body ? document.body.childElementCount : 0,
  visible: document.visibilityState,
  title: document.title,
}));
console.log("state:", JSON.stringify(state, null, 2));
console.log("screenshot: /tmp/kling-screenshot.png");
await browser.close();
