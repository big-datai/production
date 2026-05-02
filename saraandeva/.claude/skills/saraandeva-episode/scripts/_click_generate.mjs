import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

const candidates = [
  page.getByRole("contentinfo").getByRole("button", { name: /Generate/i }),
  page.getByRole("button", { name: /Generate/i }).last(),
];
let btn = null;
for (const c of candidates) {
  if (await c.isVisible().catch(() => false)) { btn = c; break; }
}
if (!btn) { console.error("❌ Generate button not visible"); process.exit(2); }

const text = (await btn.innerText()).trim();
const cost = (text.match(/(\d+)/) || [, "?"])[1];
console.log(`▶ Generate button: "${text}" (${cost} credits)`);
console.log(`→ clicking...`);
await btn.click();
await page.waitForTimeout(2000);
console.log(`✅ submitted at ${new Date().toISOString()}`);
await browser.close();
