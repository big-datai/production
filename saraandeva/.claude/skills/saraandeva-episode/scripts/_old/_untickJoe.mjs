import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
if (!page) { console.error("No Kling tab"); process.exit(1); }
await page.bringToFront();

await page.locator(".svg-icon.bind-subject__options-setting").first().click({ timeout: 5000 });
await page.waitForTimeout(700);

// Tick state before
const before = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".bind-subject-dialog__item")).map(t => ({
    text: (t.textContent || "").trim().slice(0, 20),
    html: t.outerHTML.slice(0, 200),
  }));
});
console.log("BEFORE:");
for (const t of before) console.log("  ", t.text, "|", t.html.replace(/\n/g," ").slice(0,100));

await page.evaluate(() => {
  for (const t of document.querySelectorAll(".bind-subject-dialog__item")) {
    if ((t.textContent || "").toLowerCase().includes("joe")) {
      const btn = t.querySelector(".bind-subject-dialog__item-avatar") || t;
      btn.click();
      return;
    }
  }
});
await page.waitForTimeout(500);

await page.locator(".bind-subject-dialog__title > svg").first().click({ timeout: 3000 });
await page.waitForTimeout(600);

const gen = await page.locator('text=/^\\d+\\s*Generate/i').first().textContent({ timeout: 5000 }).catch(() => "?");
console.log(`\nGenerate: ${gen}`);
await browser.close();
