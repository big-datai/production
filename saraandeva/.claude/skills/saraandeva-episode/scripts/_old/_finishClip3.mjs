#!/usr/bin/env node
/**
 * One-shot: finish Clip 3 — upload scene via setInputFiles + bind
 * Sara/Eva/Ginger/Joe by name. Does NOT touch the already-filled shot
 * prompts or durations.
 */
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
if (!page) { console.error("No Kling tab"); process.exit(1); }
await page.bringToFront();

const SCENE = "/Volumes/Samsung500/goreadling/assets/characters/saraandeva/scenes/livingroom.png";
const SUBJECTS = ["Sara", "Eva", "Ginger", "Joe"];

async function step(label, fn) {
  process.stdout.write(`→ ${label}…  `);
  try { await fn(); console.log("✓"); return true; }
  catch (e) { console.log(`❌  ${e.message.slice(0,160)}`); return false; }
}

// Close any open bind dialog (leftover from earlier run)
await page.locator(".bind-subject-dialog__title > svg").first().click({ timeout: 1500 }).catch(() => {});
await page.waitForTimeout(400);

// Upload the scene PNG directly to the key-frames file input
await step("upload scene PNG via .el-upload", async () => {
  const fileInput = page.locator('.key-frames-box .el-upload input[type="file"], .first-uploader-box input[type="file"], .el-upload--text input[type="file"]').first();
  await fileInput.setInputFiles(SCENE, { timeout: 8000 });
});
await page.waitForTimeout(2500);

// If a confirm pops up after upload, click it
await page.getByRole("button", { name: "Confirm" }).first().click({ timeout: 2000 })
  .then(() => console.log("→ Confirm clicked ✓"))
  .catch(() => console.log("→ no Confirm dialog"));
await page.waitForTimeout(1000);

// Open bind-elements dialog
await step("open bind dialog", async () => {
  await page.locator(".svg-icon.bind-subject__options-setting").first().click({ timeout: 5000 });
});
await page.waitForTimeout(800);

// Inspect what tiles exist, dump for debug
const tiles = await page.evaluate(() => {
  const out = [];
  const items = document.querySelectorAll(".bind-subject-dialog__item");
  items.forEach((t, i) => {
    out.push({
      idx: i + 1,
      text: (t.textContent || "").replace(/\s+/g, " ").slice(0, 60),
      ticked: t.classList.contains("active") || !!t.querySelector(".is-checked, .checked"),
    });
  });
  return out;
});
console.log(`\n  tiles in bind dialog (${tiles.length} total):`);
for (const t of tiles) console.log(`    [${t.idx}] ${t.ticked ? "✓" : " "} "${t.text}"`);

// Tick each subject by matching tile text
for (const subj of SUBJECTS) {
  await step(`tick ${subj}`, async () => {
    const clicked = await page.evaluate((subj) => {
      const items = Array.from(document.querySelectorAll(".bind-subject-dialog__item"));
      const lcs = subj.toLowerCase();
      for (const t of items) {
        const text = (t.textContent || "").toLowerCase();
        if (text.includes(lcs)) {
          if (t.classList.contains("active") || t.querySelector(".is-checked, .checked")) return "already";
          const btn = t.querySelector(".bind-subject-dialog__item-avatar") || t;
          btn.scrollIntoView({ block: "center" });
          btn.click();
          return "clicked";
        }
      }
      return "notfound";
    }, subj);
    if (clicked === "notfound") throw new Error(`${subj} not in dialog`);
  });
  await page.waitForTimeout(250);
}

// Close bind dialog
await step("close bind dialog", async () => {
  await page.locator(".bind-subject-dialog__title > svg").first().click({ timeout: 3000 });
});
await page.waitForTimeout(800);

// Read Generate credit cost
const genText = await page.locator('text=/^\\d+\\s*Generate/i').first().textContent({ timeout: 5000 }).catch(() => null);
console.log(`\nGenerate button reads: ${genText || "?"}`);

await browser.close();
