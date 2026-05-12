import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
if (!page) { console.error("No Kling tab"); process.exit(1); }
await page.bringToFront();

// Try to close any open settings panel by pressing Escape + clicking off
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.mouse.click(800, 400);
await page.waitForTimeout(800);

const found = await page.evaluate(() => {
  const results = [];
  for (const el of document.querySelectorAll("*")) {
    const t = (el.textContent || "").trim();
    if (!/^\d{1,3}\s*Generate$|^Generate$/.test(t)) continue;
    if (el.children.length > 3) continue;  // skip large containers
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    results.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      cls: typeof el.className === "string" ? el.className.slice(0, 80) : "",
      text: t.slice(0, 50),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      visible: el.checkVisibility ? el.checkVisibility() : true,
    });
    if (results.length > 12) break;
  }
  return results;
});
console.log("ELEMENTS containing Generate text:");
for (const f of found) {
  console.log(`  ${f.tag.padEnd(8)} role=${(f.role||'-').padEnd(8)} vis=${f.visible} @(${f.x},${f.y}) ${f.w}×${f.h}`);
  console.log(`     class: ${f.cls}`);
  console.log(`     text:  "${f.text}"`);
}
await browser.close();
