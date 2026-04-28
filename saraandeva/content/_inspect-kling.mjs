import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
await page.bringToFront();
console.log("URL:", page.url());

// Wait for content to lazy-load
await page.waitForTimeout(5000);

const report = await page.evaluate(() => {
  const R = {};
  R.videos = [...document.querySelectorAll("video")].map((v) => ({
    src: v.currentSrc || v.src || null,
    sources: [...v.querySelectorAll("source")].map((s) => s.src),
    poster: v.poster,
    bounds: v.getBoundingClientRect(),
  }));
  R.imgSample = [...document.querySelectorAll("img")].slice(0, 5).map((i) => i.src);
  R.linksSample = [...document.querySelectorAll("a[href]")].slice(0, 10).map((a) => a.href);
  // Any element with data- attrs that look video-ish
  R.dataAttrs = [];
  for (const el of document.querySelectorAll("*")) {
    for (const a of el.attributes || []) {
      if (a.name.startsWith("data-") && /mp4|webm|video/i.test(a.value || a.name)) {
        R.dataAttrs.push({ tag: el.tagName, attr: a.name, value: a.value.slice(0, 120) });
      }
    }
    if (R.dataAttrs.length > 20) break;
  }
  R.iframeCount = document.querySelectorAll("iframe").length;
  R.totalDivs = document.querySelectorAll("div").length;
  return R;
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
