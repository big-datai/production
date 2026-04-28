#!/usr/bin/env node

/**
 * Upload a podcast episode to Spotify for Podcasters using Playwright.
 * Uses saved cookies from /tmp/spotify-storage.json.
 *
 * Usage:
 *   node content/podcast/uploadToSpotify.mjs "The Pied Piper of Hamelin"
 *
 * Prerequisites:
 *   - /tmp/spotify-storage.json (export from Chrome with debug port)
 *   - exports/stories/SPOTIFY_MARKETING.md (run generateSpotifyMarketing.mjs first)
 *   - MP3 + intro.png in the story's export folder
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { patchSpotifyId } from "./patchSeedIds.mjs";

// ── Config ──
const SHOW_ID = "5Xibl3BuCkhfxRJRu5v6ML";
const SHOW_URL = `https://creators.spotify.com/pod/show/${SHOW_ID}`;
const STORAGE_FILE = "/tmp/spotify-storage.json";
const STORIES_DIR = "exports/stories";
const MARKETING_FILE = path.join(STORIES_DIR, "SPOTIFY_MARKETING.md");

const safeTitle = (title) =>
  title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");

// ── Find story folder ──
function findStoryDir(title) {
  const safe = safeTitle(title);
  if (!fs.existsSync(STORIES_DIR)) return null;
  const matches = fs
    .readdirSync(STORIES_DIR)
    .filter(
      (d) =>
        d.startsWith(safe + "_") &&
        fs.statSync(path.join(STORIES_DIR, d)).isDirectory()
    )
    .sort()
    .reverse();
  return matches.length > 0 ? path.join(STORIES_DIR, matches[0]) : null;
}

// ── Parse marketing metadata ──
function parseMarketingData(storyTitle) {
  if (!fs.existsSync(MARKETING_FILE)) {
    throw new Error(
      `${MARKETING_FILE} not found — run generateSpotifyMarketing.mjs first`
    );
  }
  const content = fs.readFileSync(MARKETING_FILE, "utf8");

  // Find the episode header for this story
  const headerPattern = `EPISODE `;
  const lines = content.split("\n");
  let blockStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].startsWith(headerPattern) &&
      lines[i].includes(storyTitle)
    ) {
      blockStart = i;
      break;
    }
  }
  if (blockStart < 0) {
    throw new Error(
      `No marketing entry found for "${storyTitle}" in ${MARKETING_FILE}`
    );
  }

  // Find Title: and Description: within this block
  let title = null;
  let descLines = [];
  let inDesc = false;
  for (let i = blockStart + 1; i < lines.length; i++) {
    // Stop at next EPISODE header
    if (lines[i].startsWith(headerPattern)) break;
    if (lines[i].startsWith("Title:")) {
      title = lines[i + 1]?.trim() || "";
      continue;
    }
    if (lines[i].startsWith("Description:")) {
      inDesc = true;
      continue;
    }
    if (inDesc) {
      descLines.push(lines[i]);
    }
  }

  if (!title) {
    throw new Error(
      `Could not parse title for "${storyTitle}" from ${MARKETING_FILE}`
    );
  }

  return {
    title: title.trim(),
    description: descLines.join("\n").trim(),
  };
}

// ── Main ──
async function main() {
  const storyTitle = process.argv[2];
  if (!storyTitle) {
    console.error('Usage: node content/podcast/uploadToSpotify.mjs "Story Title"');
    process.exit(1);
  }

  console.log(`\n🎙️  Uploading to Spotify: "${storyTitle}"\n`);

  // Validate storage file
  if (!fs.existsSync(STORAGE_FILE)) {
    console.error(
      `❌ ${STORAGE_FILE} not found. Export Spotify cookies first:\n` +
        '   1. Launch Chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-pipeline-profile\n' +
        "   2. Sign into podcasters.spotify.com\n" +
        "   3. Export cookies with the CDP script"
    );
    process.exit(1);
  }

  // Find story files
  const storyDir = findStoryDir(storyTitle);
  if (!storyDir) {
    console.error(`❌ Story folder not found for "${storyTitle}"`);
    process.exit(1);
  }

  const safe = safeTitle(storyTitle);
  const mp3Path = path.resolve(storyDir, "spotify", `${safe}.mp3`);
  if (!fs.existsSync(mp3Path)) {
    console.error(`❌ MP3 not found: ${mp3Path}`);
    process.exit(1);
  }

  // Cover image: prefer cover.png → intro.png → page_001.png
  const youtubeDir = path.join(storyDir, "youtube", safe);
  let coverPath = path.resolve(storyDir, "cover.png");
  if (!fs.existsSync(coverPath)) {
    coverPath = path.resolve(youtubeDir, "illustrations", "intro.png");
  }
  if (!fs.existsSync(coverPath)) {
    coverPath = path.resolve(youtubeDir, "illustrations", "page_001.png");
  }
  if (!fs.existsSync(coverPath)) {
    console.error(`❌ Cover image not found in ${youtubeDir}/illustrations/`);
    process.exit(1);
  }

  // Parse marketing metadata
  const marketing = parseMarketingData(storyTitle);

  console.log(`  📁 Story dir: ${storyDir}`);
  console.log(`  🎵 MP3: ${mp3Path}`);
  console.log(`  🖼️  Cover: ${coverPath}`);
  console.log(`  📝 Title: ${marketing.title}`);
  console.log(`  📄 Description: ${marketing.description.slice(0, 80)}...`);
  console.log();

  // Launch browser
  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
  });
  const context = await browser.newContext({
    storageState: STORAGE_FILE,
  });
  const page = await context.newPage();

  try {
    // Step 1: Navigate to show home
    console.log("  🌐 Navigating to show...");
    await page.goto(`${SHOW_URL}/home`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);

    // Dismiss cookie consent if present
    try {
      const confirmBtn = page.getByRole("button", { name: "Confirm My Choices" });
      if (await confirmBtn.isVisible({ timeout: 3000 })) {
        await confirmBtn.click();
        console.log("  🍪 Dismissed cookie consent");
        await page.waitForTimeout(2000);
      }
    } catch {}

    // Step 2: Click "New episode" in sidebar/header
    console.log("  ➕ Creating new episode...");
    await page.getByRole("link", { name: "New episode" }).click();
    await page.waitForTimeout(5000);

    // Step 3: Upload MP3 — use the file chooser event pattern
    console.log("  📤 Uploading MP3 (this may take a while)...");
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 30000 }),
      page.getByTestId("uploadAreaWrapper").getByRole("button", { name: "Select a file" }).click(),
    ]);
    await fileChooser.setFiles(mp3Path);

    // Wait for upload to complete — watch for the wizard URL
    console.log("  ⏳ Waiting for upload to complete...");
    await page.waitForURL(/\/wizard/, { timeout: 600000 }); // 10 min timeout for large MP3s
    await page.waitForTimeout(5000);

    // Step 5: Fill in title
    console.log("  ✏️  Filling in title...");
    const titleInput = page.getByRole("textbox", {
      name: "Title (required)",
    });
    await titleInput.click();
    await titleInput.fill(marketing.title);

    // Step 6: Fill in description via clipboard paste (keyboard.type garbles text)
    console.log("  📝 Filling in description...");
    const descriptionArea = page
      .getByRole("region", { name: "Episode info" })
      .getByRole("paragraph");
    await descriptionArea.click();
    await page.waitForTimeout(300);
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, marketing.description);
    await page.waitForTimeout(200);
    await page.keyboard.press("Meta+v");
    await page.waitForTimeout(2000);

    // Step 7: Upload cover image
    console.log("  🖼️  Uploading cover image...");
    const [coverChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 30000 }),
      page.getByRole("button", { name: "Change", exact: true }).click(),
    ]);
    await coverChooser.setFiles(coverPath);

    // Wait for image upload
    await page.waitForTimeout(5000);

    // Step 8: Save
    console.log("  💾 Saving...");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(2000);

    // Step 9: Next
    console.log("  ➡️  Proceeding to publish...");
    await page.getByRole("button", { name: "Next" }).click();
    await page.waitForTimeout(3000);

    // Step 10: Select "Full Episode" radio (first option)
    console.log("  🔘 Selecting episode type...");
    await page.locator(".e-10270-form-radio__indicator").first().click();

    // Step 11: Wait for preview generation, then publish
    console.log("  🚀 Waiting for preview to finish...");
    await page.getByRole("button", { name: "Publish" }).waitFor({ state: "visible", timeout: 300000 });
    // Wait until the button is enabled (preview generation done)
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button[type="submit"][form="review-form"]');
        return btn && !btn.disabled;
      },
      null,
      { timeout: 300000 }
    );
    console.log("  🚀 Publishing...");
    await page.getByRole("button", { name: "Publish" }).click();
    await page.waitForTimeout(3000);

    // Step 12: Done
    console.log("  ✅ Confirming...");
    await page.getByRole("button", { name: "Done" }).click();
    await page.waitForTimeout(2000);

    // Try to extract episode ID from URL
    let currentUrl = page.url();
    let episodeIdMatch = currentUrl.match(
      /\/episode\/([a-zA-Z0-9]+)/
    );
    let episodeId = episodeIdMatch ? episodeIdMatch[1] : null;

    // Fallback: if URL redirected to /episodes, find the newest episode
    if (!episodeId) {
      console.log("  🔍 Fetching episode ID from episodes list...");
      try {
        // Dismiss cookie consent if present
        try {
          const confirmBtn = page.getByRole("button", { name: "Confirm My Choices" });
          if (await confirmBtn.isVisible({ timeout: 2000 })) {
            await confirmBtn.click();
            await page.waitForTimeout(2000);
          }
        } catch {}

        await page.getByTestId("episodes-link").click();
        await page.waitForSelector('a[href*="/episode/"]', { timeout: 15000 });
        await page.waitForTimeout(3000);

        // The newest episode is at the top
        const topEpisode = await page.evaluate(() => {
          const link = document.querySelector('a[href*="/episode/"][href*="/details"]');
          if (!link) return null;
          const m = link.href.match(/\/episode\/([a-zA-Z0-9]+)/);
          return m ? { id: m[1], title: link.textContent.trim() } : null;
        });

        if (topEpisode) {
          episodeId = topEpisode.id;
          console.log(`  ✅ Found: ${topEpisode.title} → ${episodeId}`);
        }
      } catch (err) {
        console.log(`  ⚠️  Could not fetch episode ID: ${err.message}`);
      }
    }

    console.log("\n══════════════════════════════════════════════════");
    console.log(`✅ "${storyTitle}" uploaded to Spotify!`);
    if (episodeId) {
      console.log(`📎 Episode ID: ${episodeId}`);
      console.log(
        `🔗 URL: https://open.spotify.com/episode/${episodeId}`
      );

      // Auto-patch seedBednightStories.mjs
      try {
        patchSpotifyId(storyTitle, episodeId);
      } catch (err) {
        console.log(`  ⚠️  Could not auto-patch seed file: ${err.message}`);
        console.log(`  📋 Manually add to SPOTIFY_IDS: '${storyTitle}': '${episodeId}',`);
      }
    } else {
      console.log(
        "⚠️  Could not extract episode ID. Run getSpotifyEpisodeLinks.mjs --update-seed"
      );
    }
    console.log("══════════════════════════════════════════════════\n");
  } catch (err) {
    console.error(`\n❌ Upload failed: ${err.message}`);

    // Take screenshot for debugging
    const screenshotPath = `/tmp/spotify-upload-error-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`📸 Screenshot saved: ${screenshotPath}`);

    process.exit(1);
  } finally {
    await context.close();
    await browser.close();
  }
}

main();
