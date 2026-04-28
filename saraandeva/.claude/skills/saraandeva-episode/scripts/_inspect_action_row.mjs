import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

// Hover the topmost video preview in the right-side asset panel
// The right panel is the "Kling Omni" feed showing rendered clips
const topPreview = page.locator('.omni-stream-item, [class*="omni-stream-item"]').first();

// Just dump all button/div-with-svg elements in the right panel
const rightPanel = await page.evaluate(() => {
  // Find the right-most panel (where the preview lives)
  const panels = document.querySelectorAll('[class*="panel"], [class*="asset"], [class*="stream"]');
  const allBtns = [];
  document.querySelectorAll('button, [role="button"], div[class*="action"], div[class*="icon"]').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 12 || r.width > 60) return;  // small icon size
    if (r.height < 12 || r.height > 60) return;
    if (r.x < window.innerWidth * 0.5) return;  // right half of screen only
    const svg = el.querySelector('svg');
    if (!svg) return;
    allBtns.push({
      tag: el.tagName,
      cls: (el.className?.baseVal || el.className || "").toString().slice(0, 60),
      svgPath: svg.querySelector('path')?.getAttribute('d')?.slice(0, 80) || "",
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  });
  return allBtns;
});

console.log(`Found ${rightPanel.length} small icon-buttons in the right half of screen:\n`);
rightPanel.forEach((b, i) => {
  console.log(`[${i}] <${b.tag}> ${b.w}x${b.h} @ (${b.x},${b.y}) cls="${b.cls}"`);
  if (b.svgPath) console.log(`    path="${b.svgPath}"`);
});
await browser.close();
