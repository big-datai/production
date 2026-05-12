import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

await page.goto("https://kling.ai/app/user-assets/materials?ac=1", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

await page.screenshot({ path: "/tmp/kling_materials.png", fullPage: false });
console.log("/tmp/kling_materials.png");

// Also dump some page text + tile classes
const info = await page.evaluate(() => {
  const checkboxes = document.querySelectorAll('.svg-icon.video-item-checkbox');
  const allClasses = new Set();
  // Sample top 10 elements with class containing 'video' / 'material' / 'creation' / 'item'
  const candidates = document.querySelectorAll('[class*="video"], [class*="material"], [class*="creation"], [class*="item"]');
  let n = 0;
  for (const c of candidates) {
    if (n >= 30) break;
    const cls = (typeof c.className === "string" ? c.className : c.className.toString()).slice(0, 80);
    allClasses.add(cls);
    n++;
  }
  return {
    checkboxCount: checkboxes.length,
    bodyTextSample: (document.body.innerText || "").slice(0, 600),
    sampleClasses: [...allClasses].slice(0, 30),
  };
});
console.log(JSON.stringify(info, null, 2));

await browser.close();
