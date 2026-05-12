import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
await page.bringToFront();

// Open bind dialog and dump every tile's name + selected state
await page.locator(".svg-icon.bind-subject__options-setting").first().click({ timeout: 5000 });
await page.waitForTimeout(800);

const tiles = await page.evaluate(() => {
  return Array.from(document.querySelectorAll(".bind-subject-dialog__item")).map((t, i) => ({
    idx: i + 1,
    text: (t.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
    selected: t.classList.contains("bind-subject-dialog__item--selected"),
    disabled: t.classList.contains("bind-subject-dialog__item--disabled"),
  }));
});
console.log("\nBIND DIALOG TILES:");
for (const t of tiles) {
  const mark = t.selected ? "✓" : t.disabled ? "·" : " ";
  console.log(`  [${t.idx}] ${mark} ${t.text}`);
}

// Count how many tiles mention "eva"
const evaCount = tiles.filter(t => t.text.toLowerCase().includes("eva")).length;
console.log(`\n⚠️  Eva tiles: ${evaCount}  (should be 1)`);

await page.locator(".bind-subject-dialog__title > svg").first().click({ timeout: 3000 }).catch(()=>{});
await browser.close();
