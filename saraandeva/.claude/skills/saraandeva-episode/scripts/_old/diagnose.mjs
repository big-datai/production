#!/usr/bin/env node
// Diagnostic: screenshot + DOM dump of the current Kling state.
import fs from "node:fs";
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
if (!page) { console.error("No Kling tab"); process.exit(1); }
await page.bringToFront();
console.log(`URL: ${page.url()}`);

// 1. Full-page screenshot
await page.screenshot({ path: "/tmp/kling-diag.png", fullPage: true });
console.log(`Screenshot → /tmp/kling-diag.png`);

// 2. DOM dump — all clickable buttons / tabs / toggles with their text + selector
const report = await page.evaluate(() => {
  const items = [];
  const clickables = document.querySelectorAll(
    "button, [role='button'], [role='tab'], li, span, div"
  );
  for (const el of clickables) {
    const text = (el.innerText || "").trim();
    if (!text || text.length > 80) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.x < 0 || rect.y < 0) continue;
    const cls = typeof el.className === "string" ? el.className.slice(0, 60) : "";
    items.push({
      tag: el.tagName.toLowerCase(),
      text: text.replace(/\s+/g, " ").slice(0, 50),
      cls: cls.split(/\s+/).slice(0, 3).join(" "),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    });
    if (items.length > 200) break;
  }
  return items;
});

// Filter to interesting items — buttons + tabs + texts relevant to our flow
const interesting = report.filter((r) =>
  /Shot|Upload|History|Confirm|Generate|Bind|Audio|Add|720|1080|s$/.test(r.text) ||
  r.tag === "button"
);
console.log("\nVISIBLE INTERESTING ELEMENTS (tag · text · class · position):");
for (const i of interesting.slice(0, 60)) {
  console.log(`  ${i.tag.padEnd(6)} "${i.text}"`.padEnd(70) + ` ${i.cls.slice(0,40)}  @(${i.x},${i.y}) ${i.w}×${i.h}`);
}

// 3. Specifically: find all storyboard items
const storyboard = await page.evaluate(() => {
  const rows = [];
  for (const el of document.querySelectorAll('[class*="storyboard"]')) {
    const t = (el.innerText || "").trim().slice(0, 50);
    const c = typeof el.className === "string" ? el.className.slice(0, 80) : "";
    rows.push({ text: t.replace(/\s+/g, " "), cls: c });
    if (rows.length > 30) break;
  }
  return rows;
});
console.log("\nSTORYBOARD ELEMENTS:");
for (const r of storyboard) {
  console.log(`  "${r.text}"  |  ${r.cls}`);
}

// 4. Find the frame-picker dialog if it's open
const frameDialog = await page.evaluate(() => {
  const dialogs = [];
  for (const el of document.querySelectorAll('.el-dialog, [role="dialog"], [class*="dialog"], [class*="modal"]')) {
    const t = (el.innerText || "").trim().slice(0, 120);
    dialogs.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === "string" ? el.className : "").slice(0,60), text: t.replace(/\s+/g, " ") });
    if (dialogs.length > 5) break;
  }
  return dialogs;
});
console.log("\nOPEN DIALOGS / MODALS:");
for (const d of frameDialog) {
  console.log(`  ${d.tag}.${d.cls}\n    "${d.text.slice(0,200)}"`);
}

await browser.close();
