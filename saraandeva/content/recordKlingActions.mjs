#!/usr/bin/env node
/**
 * DOM-event recorder for Kling.
 *
 * Attaches to your existing Chrome (CDP, 9222), finds the Kling tab, and
 * injects a tiny JS listener that captures every click / input / change
 * with the best available selector (id > data-testid > aria-label > text).
 *
 * Each event is logged to the Node terminal AND appended to
 * /tmp/kling-actions.jsonl for post-processing.
 *
 * When you're done clicking through the Clip 1 flow:
 *   - hit Ctrl+C in this terminal
 *   - I'll read /tmp/kling-actions.jsonl and turn it into the multi-shot
 *     Playwright automation.
 */

import fs from "node:fs";
import { chromium } from "playwright";

const CDP_URL = "http://127.0.0.1:9222";
const LOG_FILE = "/tmp/kling-actions.jsonl";

// Reset log file
fs.writeFileSync(LOG_FILE, "");

const RECORDER_JS = `
(() => {
  // Clean up any previous install so we always get a fresh recorder
  if (window.__klingRecorderInstalled) {
    const oldBanner = document.getElementById('__klingRecorderBanner');
    const oldCounter = document.getElementById('__klingRecorderCounter');
    if (oldBanner) oldBanner.remove();
    if (oldCounter) oldCounter.remove();
    console.log('[recorder] refreshing existing install');
  }
  window.__klingRecorderInstalled = true;
  console.log('[recorder] installed — recording clicks / inputs / changes');

  // Visible red banner in the browser so user knows recording is active
  const banner = document.createElement('div');
  banner.id = '__klingRecorderBanner';
  banner.textContent = '● RECORDING CLIP 1 — click through the Kling flow (clicks / inputs / toggles captured)';
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
    'background:#dc2626;color:white;font-family:-apple-system,sans-serif;' +
    'font-weight:700;font-size:14px;padding:8px 16px;text-align:center;' +
    'letter-spacing:0.3px;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
  document.body.appendChild(banner);

  // Counter chip on the right
  const counter = document.createElement('div');
  counter.id = '__klingRecorderCounter';
  counter.textContent = '0 events';
  counter.style.cssText =
    'position:fixed;top:40px;right:12px;z-index:2147483647;' +
    'background:#111;color:#10b981;font-family:ui-monospace,monospace;' +
    'font-size:12px;padding:6px 10px;border-radius:6px;pointer-events:none;' +
    'box-shadow:0 2px 6px rgba(0,0,0,0.4);';
  document.body.appendChild(counter);
  let eventCount = 0;

  function bestSelector(el) {
    if (!el || el === document) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    const testid = el.getAttribute('data-testid');
    if (testid) return '[data-testid="' + testid + '"]';
    const aria = el.getAttribute('aria-label');
    if (aria) return '[aria-label="' + aria + '"]';
    const name = el.getAttribute('name');
    if (name) return el.tagName.toLowerCase() + '[name="' + name + '"]';
    const text = (el.innerText || el.textContent || '').trim().slice(0, 60);
    if (text && text.length < 60) {
      return el.tagName.toLowerCase() + ':has-text("' + text.replace(/"/g, '\\\\"') + '")';
    }
    // Fallback: tag + class chain
    let c = el.className;
    if (typeof c !== 'string' && c && c.baseVal) c = c.baseVal;
    if (typeof c === 'string' && c.trim()) {
      const cls = c.trim().split(/\\s+/).slice(0, 2).join('.');
      return el.tagName.toLowerCase() + '.' + cls;
    }
    return el.tagName.toLowerCase();
  }

  function describe(el) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '?';
    const id = el.id || '';
    const cls = (typeof el.className === 'string') ? el.className.slice(0, 60) : '';
    const txt = (el.innerText || el.textContent || '').trim().slice(0, 80);
    return { tag, id, cls, text: txt, selector: bestSelector(el) };
  }

  function emit(event) {
    console.log('__KLING_ACTION__' + JSON.stringify(event));
    eventCount += 1;
    if (counter) counter.textContent = eventCount + ' events';
  }

  // Clicks
  document.addEventListener('click', (e) => {
    emit({ kind: 'click', target: describe(e.target), href: e.target.href || null, ts: Date.now() });
  }, true);

  // Inputs (typing)
  let lastInputKey = '';
  document.addEventListener('input', (e) => {
    const key = bestSelector(e.target) + ':' + (e.target.name || e.target.placeholder || '');
    if (key === lastInputKey) return;
    lastInputKey = key;
    emit({
      kind: 'input',
      target: describe(e.target),
      value: (e.target.value || e.target.textContent || '').slice(0, 200),
      ts: Date.now(),
    });
  }, true);

  // Changes (selects, toggles)
  document.addEventListener('change', (e) => {
    emit({
      kind: 'change',
      target: describe(e.target),
      value: e.target.value || e.target.checked,
      ts: Date.now(),
    });
  }, true);

  // File uploads
  document.addEventListener('change', (e) => {
    if (e.target.type === 'file' && e.target.files) {
      const names = Array.from(e.target.files).map((f) => f.name);
      emit({ kind: 'upload', target: describe(e.target), files: names, ts: Date.now() });
    }
  }, true);
})();
`;

async function main() {
  // Verify the Kling tab exists before we try to attach
  console.log(`🔌 Looking up Kling tab on ${CDP_URL}/json...`);
  const resp = await fetch(`${CDP_URL}/json`);
  const tabs = await resp.json();
  const kling = tabs.find((t) => t.type === "page" && t.url.includes("kling.ai"));
  if (!kling) {
    console.error("❌ No Kling tab found. Current pages:");
    tabs.filter((t) => t.type === "page").forEach((t, i) => console.error(`     ${i + 1}. ${t.url}`));
    process.exit(1);
  }
  console.log(`📄 Found Kling tab: ${kling.url}`);

  // Connect to the browser-level WS. Kling has many workers so the
  // attach handshake is slow — bump timeout to 5 minutes.
  console.log(`🔌 Connecting to Chrome via CDP browser WS (this can take ~30s for Kling)...`);
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 300_000 });
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("No browser context");

  const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
  if (!page) {
    console.error("❌ Kling page missing in context.pages(). All pages:");
    ctx.pages().forEach((p, i) => console.error(`     ${i + 1}. ${p.url()}`));
    process.exit(1);
  }
  console.log(`📄 Attached to: ${page.url()}`);
  await page.bringToFront();

  // Stream console messages — any __KLING_ACTION__ line becomes an event
  let count = 0;
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.startsWith("__KLING_ACTION__")) {
      count += 1;
      const json = text.slice("__KLING_ACTION__".length);
      fs.appendFileSync(LOG_FILE, json + "\n");
      let parsed;
      try {
        parsed = JSON.parse(json);
      } catch {
        return;
      }
      const t = parsed.target || {};
      const short =
        parsed.kind === "click"
          ? `click    → ${t.selector || "?"}  "${(t.text || "").slice(0, 40)}"`
          : parsed.kind === "input"
          ? `input    → ${t.selector || "?"}  value="${(parsed.value || "").slice(0, 40)}"`
          : parsed.kind === "change"
          ? `change   → ${t.selector || "?"}  value=${parsed.value}`
          : parsed.kind === "upload"
          ? `upload   → ${t.selector || "?"}  files=${(parsed.files || []).join(",")}`
          : `${parsed.kind} → ${t.selector || "?"}`;
      console.log(`  [${String(count).padStart(3, "0")}] ${short}`);
    } else if (text.startsWith("[recorder]")) {
      console.log(`  ${text}`);
    }
  });

  // Install the recorder
  await page.evaluate(RECORDER_JS);

  // Reinstall on navigation (SPA route changes)
  page.on("framenavigated", async (frame) => {
    if (frame === page.mainFrame()) {
      try {
        await page.evaluate(RECORDER_JS);
      } catch (e) {
        // Page might be transitioning; ignore
      }
    }
  });

  console.log(`
════════════════════════════════════════════════════════════════════
 RECORDER LIVE — log: ${LOG_FILE}
════════════════════════════════════════════════════════════════════

  Click through Kling now:
   1. "Bind elements to enhance consistency"
   2. Create → upload house_aerial.png → name it HouseAerial
   3. "Custom Multi-Shot"
   4. Fill Shot 1 / Shot 2 / Shot 3 + durations 5s each
   5. Native Audio OFF, verify 720p · 15s · 1
   6. HOVER Generate to confirm 90 credits  (do NOT click)
   7. When done → Ctrl+C here

════════════════════════════════════════════════════════════════════
`);

  // Hold open until Ctrl+C
  process.on("SIGINT", async () => {
    console.log(`\n✅ Captured ${count} actions → ${LOG_FILE}`);
    await browser.close();
    process.exit(0);
  });

  // Keep the process alive
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
