import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
if (!page) { console.error("No Kling tab"); process.exit(1); }
await page.bringToFront();

// Close any blocking dialog first
await page.locator(".bind-subject-dialog__title > svg").first().click({ timeout: 1500 }).catch(() => {});
await page.locator(".close > svg").first().click({ timeout: 1500 }).catch(() => {});
await page.waitForTimeout(500);

await page.screenshot({ path: "/tmp/kling-clean.png", fullPage: false });
console.log("✓ /tmp/kling-clean.png");

// Inspect candidate "add scene reference" affordances
const candidates = await page.evaluate(() => {
  const out = [];
  const kw = /reference|frame|scene|image|upload|add|\+/i;
  for (const el of document.querySelectorAll('button, [role="button"], p, span, div')) {
    const text = (el.innerText || "").trim();
    if (!text || text.length > 50) continue;
    if (!kw.test(text)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.x < 0 || r.y < 0 || r.x > 1440 || r.y > 900) continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      text: text.replace(/\s+/g, " ").slice(0, 45),
      cls: typeof el.className === "string" ? el.className.slice(0, 60) : "",
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width),
    });
    if (out.length > 40) break;
  }
  return out;
});
console.log("\nVISIBLE AFFORDANCES:");
for (const c of candidates) {
  console.log(`  ${c.tag.padEnd(6)} "${c.text.padEnd(40)}"  ${c.cls.slice(0,26).padEnd(28)} @(${c.x},${c.y})w${c.w}`);
}
await browser.close();
