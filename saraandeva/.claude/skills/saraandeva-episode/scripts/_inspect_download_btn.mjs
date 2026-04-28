import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

// Look for any download-related element on the page
const elements = await page.evaluate(() => {
  const results = [];
  const all = document.querySelectorAll('button, [role="button"], [class*="download"], svg[class*="download"]');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cls = (el.className?.baseVal || el.className || "").toString().slice(0, 80);
    const txt = (el.innerText || "").trim().slice(0, 40);
    const aria = el.getAttribute("aria-label") || "";
    const title = el.getAttribute("title") || "";
    if (cls.toLowerCase().includes("download") || aria.toLowerCase().includes("download") ||
        title.toLowerCase().includes("download") || txt.toLowerCase().includes("download")) {
      results.push({
        tag: el.tagName,
        cls,
        txt,
        aria,
        title,
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
      });
    }
  }
  return results;
});

console.log(`Found ${elements.length} download-related elements:\n`);
elements.forEach((e, i) => {
  console.log(`[${i}] <${e.tag}> at (${e.x},${e.y}) ${e.w}x${e.h}`);
  console.log(`     cls="${e.cls}"`);
  if (e.txt) console.log(`     text="${e.txt}"`);
  if (e.aria) console.log(`     aria="${e.aria}"`);
  if (e.title) console.log(`     title="${e.title}"`);
  console.log();
});
await browser.close();
