#!/usr/bin/env node
// Navigate Kling to the generations/history page, wait for video thumbnails,
// then scrape MP4 URLs and download via the same cookie jar.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const OUT_DIR = path.join(ROOT, "season_01/intro/clips");
fs.mkdirSync(OUT_DIR, { recursive: true });

const tabs = await (await fetch("http://127.0.0.1:9222/json")).json();
const kling = tabs.find((t) => t.type === "page" && t.url.includes("kling.ai"));
if (!kling) { console.error("No Kling tab"); process.exit(1); }

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("kling.ai"));
await page.bringToFront();
console.log("Currently on:", page.url());

// Try common Kling history / library URLs
const candidates = [
  "https://kling.ai/app/user-assets/materials?ac=1",
  "https://kling.ai/app/user-assets/materials",
  "https://kling.ai/app/user-assets/videos",
  "https://kling.ai/app/user-works/video",
];
for (const url of candidates) {
  console.log(`\n→ Trying ${url}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(4000); // let videos render
    const urls = await page.evaluate(() => {
      const found = new Set();
      for (const v of document.querySelectorAll("video")) {
        const s = v.currentSrc || v.src;
        if (s && /\.(mp4|webm)/i.test(s)) found.add(s);
        for (const src of v.querySelectorAll("source")) if (src.src) found.add(src.src);
      }
      for (const el of document.querySelectorAll("[data-video-url],[data-src]")) {
        for (const a of ["data-video-url","data-src"]) { const v = el.getAttribute(a); if (v && /\.(mp4|webm)/i.test(v)) found.add(v); }
      }
      return [...found];
    });
    console.log(`   ${urls.length} video URLs found`);
    if (urls.length > 0) {
      console.log(`   ✓ landed on a page with videos — URL stays: ${page.url()}`);
      const cookies = await ctx.cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      const letters = ["A","B","C","D","E"];
      // Take first N=3 (latest = first in my-works)
      for (let i = 0; i < Math.min(3, urls.length); i++) {
        const u = urls[i];
        const ext = u.match(/\.(mp4|webm)/i)?.[1] || "mp4";
        const out = path.join(OUT_DIR, `clip_${letters[i]}_raw.${ext}`);
        process.stdout.write(`   [${i+1}] ${path.basename(out)} ← ${u.slice(-50)}  `);
        try {
          const r = await fetch(u, { headers: { Cookie: cookieHeader, Referer: "https://kling.ai/" } });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const b = Buffer.from(await r.arrayBuffer());
          fs.writeFileSync(out, b);
          console.log(`✓ ${(b.length/1024/1024).toFixed(2)} MB`);
        } catch (e) { console.log(`❌ ${e.message}`); }
      }
      console.log(`\n📂 ${OUT_DIR}`);
      await browser.close();
      process.exit(0);
    }
  } catch (e) { console.log(`   (failed: ${e.message.slice(0,80)})`); }
}

console.log("\n❌ Couldn't find the generations page automatically. Navigate manually + rerun.");
await browser.close();
