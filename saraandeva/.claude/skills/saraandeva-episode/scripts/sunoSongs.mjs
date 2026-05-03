#!/usr/bin/env node
/**
 * Generate songs on Suno from lyric .md files in assets/music/lyrics/.
 *
 * Per file: opens Suno's Create page, picks a saved voice (default "Sara"),
 * pastes the lyrics body (everything after the `---` separator), clicks
 * Create song, waits up to 5 min for one of the two variants to render,
 * opens its More-options menu and downloads the MP3 → saves to
 * assets/music/<lyrics-stem>.mp3.
 *
 * Suno generates two variants per Create. We keep the FIRST (top-of-list)
 * variant by default; pass --variant=2 to take the second instead.
 *
 * Prereqs:
 *   - Chrome at debug port 9222 with logged-in Suno tab (or any tab —
 *     this script will navigate to suno.com/create itself)
 *   - The voice (default "Sara") exists in your saved Suno voices
 *
 * Usage:
 *   node sunoSongs.mjs <path/to/lyrics.md>
 *   node sunoSongs.mjs --all                  # every .md without matching .mp3
 *   node sunoSongs.mjs --check                # list lyric files vs. existing mp3s
 *   node sunoSongs.mjs <input> --voice=Sara
 *   node sunoSongs.mjs <input> --variant=2
 *   node sunoSongs.mjs <input> --force        # overwrite existing mp3
 *   node sunoSongs.mjs <input> --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const LYRICS_DIR = path.join(PROJECT_ROOT, "assets", "music", "lyrics");
const MUSIC_DIR  = path.join(PROJECT_ROOT, "assets", "music");
const CDP_URL = "http://127.0.0.1:9222";

// ─── Args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv.filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const positional = argv.filter(a => !a.startsWith("--"));
const voiceName = flags.voice ?? "Sara";
const variant   = Math.max(1, Math.min(2, Number(flags.variant ?? 1)));  // 1 or 2
const dryRun    = flags["dry-run"] === "true";
const force     = flags.force === "true";
const checkOnly = flags.check === "true";

// ─── Build target list ──────────────────────────────────────────────────────
function listLyricFiles() {
  if (!fs.existsSync(LYRICS_DIR)) return [];
  return fs.readdirSync(LYRICS_DIR)
    .filter(f => f.endsWith(".md"))
    .map(f => path.join(LYRICS_DIR, f));
}

function expectedMp3For(lyricsFile) {
  const stem = path.basename(lyricsFile, ".md");
  return path.join(MUSIC_DIR, `${stem}.mp3`);
}

let targets;
if (positional[0]) {
  targets = [path.resolve(positional[0])];
} else if (flags.all === "true" || checkOnly) {
  targets = listLyricFiles();
} else {
  console.error(`Usage:
  node sunoSongs.mjs <lyrics.md>
  node sunoSongs.mjs --all
  node sunoSongs.mjs --check
  options: --voice=Sara  --variant=1|2  --force  --dry-run`);
  process.exit(1);
}

// ─── --check / planning mode ────────────────────────────────────────────────
console.log(`📂 lyrics dir: ${path.relative(PROJECT_ROOT, LYRICS_DIR)}`);
console.log(`📂 music dir:  ${path.relative(PROJECT_ROOT, MUSIC_DIR)}`);
console.log("");

const plan = [];
for (const f of targets) {
  if (!fs.existsSync(f)) {
    console.error(`❌ not found: ${f}`);
    process.exit(1);
  }
  const mp3 = expectedMp3For(f);
  const has = fs.existsSync(mp3);
  plan.push({ md: f, mp3, has });
  console.log(`   ${has ? "✓" : "✗"}  ${path.basename(f).padEnd(40)} ${has ? "→ " + path.basename(mp3) : "(needs generating)"}`);
}

if (checkOnly) process.exit(0);

const todo = plan.filter(p => force || !p.has);
console.log(`\n→ ${todo.length} to generate, ${plan.length - todo.length} skipped`);
if (todo.length === 0) {
  console.log(`\n✅ nothing to do (use --force to overwrite existing mp3s)`);
  process.exit(0);
}
if (dryRun) {
  console.log(`\n[dry-run] would generate via Suno using voice "${voiceName}", variant ${variant}`);
  process.exit(0);
}

// ─── Strip lyric file metadata (keep only the body after `---`) ─────────────
function bodyLyrics(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const idx = text.indexOf("\n---\n");
  let body = idx >= 0 ? text.slice(idx + 5) : text;
  body = body.replace(/^\s*#.*$/gm, "").replace(/^\s*\*\*[^*]+\*\*.*$/gm, "");
  return body.replace(/^\s*\n+/, "").trim();
}

// ─── Connect to Chrome ──────────────────────────────────────────────────────
console.log(`\n🔌 Connecting to Chrome at ${CDP_URL}...`);
const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 30_000 });
const ctx = browser.contexts()[0];
let page = ctx.pages().find(p => p.url().includes("suno.com"));
if (!page) {
  console.log(`   no suno.com tab found — opening one`);
  page = await ctx.newPage();
}
await page.bringToFront();

// ─── Process each target ────────────────────────────────────────────────────
let ok = 0, fail = 0;
for (let i = 0; i < todo.length; i++) {
  const t = todo[i];
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`▶  [${i + 1}/${todo.length}]  ${path.basename(t.md)}`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  try {
    const lyrics = bodyLyrics(t.md);
    if (!lyrics) throw new Error("lyrics body is empty after metadata strip");
    console.log(`   📝 ${lyrics.length} chars of lyrics`);

    // 1. Open Create page
    if (!page.url().includes("suno.com/create")) {
      await page.goto("https://suno.com/create", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
    }

    // 2. Dismiss onboarding popup if present
    try {
      await page.getByRole("button", { name: "Close onboarding challenges" }).click({ timeout: 1500 });
    } catch {}

    // 3. Snapshot existing Play-button accessible names so we can detect new ones.
    //    (Suno virtualizes the song list — count alone doesn't change as new
    //    songs scroll old ones out of view.)
    const before = new Set(
      await page.getByRole("button", { name: /^Play / })
        .evaluateAll(els => els.map(e => e.getAttribute("aria-label") || ""))
    );

    // 4. Add Voice (best-effort)
    try {
      await page.getByRole("button", { name: "Add Voice" }).click({ timeout: 4000 });
      await page.getByRole("img", { name: `Voice image for ${voiceName}` }).click({ timeout: 4000 });
      console.log(`   ✓ voice "${voiceName}" picked`);
    } catch {
      console.log(`   ⚠ voice "${voiceName}" not picked (button hidden or missing) — continuing`);
    }

    // 5. Fill lyrics textbox — Custom mode preferred ("Write some lyrics"),
    //    Simple mode fallback ("...song about...")
    let lyricsBox = page.getByRole("textbox", { name: /write some lyrics/i });
    if ((await lyricsBox.count()) === 0) {
      lyricsBox = page.getByRole("textbox", { name: /song about/i });
    }
    if ((await lyricsBox.count()) === 0) {
      throw new Error("could not locate Suno lyrics textbox (tried Custom + Simple mode placeholders)");
    }
    await lyricsBox.first().click();
    await lyricsBox.first().press("ControlOrMeta+a");
    await lyricsBox.first().press("Delete");
    await lyricsBox.first().fill(lyrics);
    console.log(`   ✓ lyrics pasted (${(await lyricsBox.first().inputValue()).length} chars in box)`);

    // 6. Click Create song
    await page.getByRole("button", { name: "Create song" }).click();
    console.log(`   ▶ Create clicked — waiting for render (up to 5 min)`);

    // 7. Poll for NEW Play buttons (labels not in `before`), ordered by visual
    //    Y (topmost first — Suno puts newest at the top of the workspace).
    //    Note: Suno auto-titles the song from the chorus phrase, NOT from the
    //    lyric file's # heading — don't try to match the file's title.
    const deadline = Date.now() + 5 * 60 * 1000;
    let topNew = null;
    while (Date.now() < deadline) {
      await page.waitForTimeout(15000);
      try { await page.getByRole("button", { name: "Close onboarding challenges" }).click({ timeout: 500 }); } catch {}
      const fresh = await page.getByRole("button", { name: /^Play / }).evaluateAll((els, beforeArr) => {
        const beforeSet = new Set(beforeArr);
        return els.map(e => ({
          label: e.getAttribute("aria-label") || "",
          y: Math.round(e.getBoundingClientRect().y),
        })).filter(m => m.label && m.y >= 0 && !beforeSet.has(m.label))
          .sort((a, b) => a.y - b.y);
      }, [...before]);
      const elapsed = Math.round((5 * 60 * 1000 - (deadline - Date.now())) / 1000);
      console.log(`   ⏳ ${elapsed}s — fresh: ${fresh.length}${fresh.length ? "  topmost=" + JSON.stringify(fresh[0]) : ""}`);
      if (fresh.length >= variant) { topNew = fresh[variant - 1]; break; }
    }
    if (!topNew) throw new Error("timed out waiting for Suno render");
    console.log(`   ✓ ready: ${JSON.stringify(topNew)}`);

    // 8. Find the song's row, open its More options menu, hover Download → click MP3 Audio.
    //    (The Download item is a submenu trigger — must hover first, can't click.)
    const playBtn = page.getByRole("button", { name: topNew.label, exact: true }).first();
    await playBtn.scrollIntoViewIfNeeded();
    await playBtn.hover();
    await page.waitForTimeout(400);
    const row = playBtn.locator(`xpath=ancestor::*[descendant::button[@aria-label="More options"]][1]`);
    await row.first().getByRole("button", { name: "More options" }).first().click();
    await page.waitForTimeout(1200);
    await page.getByText("Download", { exact: true }).first().hover();
    await page.waitForTimeout(800);
    const dlPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByText("MP3 Audio", { exact: true }).first().click();
    const download = await dlPromise;
    await download.saveAs(t.mp3);
    console.log(`   ✓ saved → ${path.relative(PROJECT_ROOT, t.mp3)}`);
    ok++;
  } catch (err) {
    console.log(`   ❌ ${err.message}`);
    fail++;
  }
}

console.log(`\n✅ done — ${ok} generated, ${fail} failed (of ${todo.length})`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
