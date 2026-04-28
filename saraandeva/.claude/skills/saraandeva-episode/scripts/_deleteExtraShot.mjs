import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
await page.bringToFront();

let count = await page.locator(".storyboard-item").count();
console.log(`shots: ${count}`);

// Trim down to exactly 4 shots by deleting from the last
while (count > 4) {
  const last = page.locator(".storyboard-item").last();
  await last.scrollIntoViewIfNeeded();
  const del = last.locator(".header-right a").first();
  await del.click({ timeout: 4000 });
  await page.waitForTimeout(600);

  // Confirm dialog? If a "Confirm"/"Delete"/"OK" button appears, click it
  await page.getByRole("button", { name: /confirm|delete|ok|yes/i })
    .first().click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(400);

  const newCount = await page.locator(".storyboard-item").count();
  console.log(`  after delete → ${newCount}`);
  if (newCount === count) { console.log("  ❌ delete had no effect — aborting"); break; }
  count = newCount;
}

const gen = await page.locator('text=/^\\d+\\s*Generate/i').first().textContent({ timeout: 5000 }).catch(() => "?");
console.log(`\nGenerate: ${gen}`);
await browser.close();
