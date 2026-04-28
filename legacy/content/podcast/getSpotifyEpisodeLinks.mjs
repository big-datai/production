#!/usr/bin/env node

/**
 * Fetch Spotify episode IDs for all published episodes.
 * Navigates through all pages, extracts episode IDs, and maps to story titles.
 *
 * Usage:
 *   node content/podcast/getSpotifyEpisodeLinks.mjs
 *   node content/podcast/getSpotifyEpisodeLinks.mjs --update-seed  # auto-update seedBednightStories.mjs
 *
 * Prerequisites:
 *   - /tmp/spotify-storage.json (export from Chrome with debug port)
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const SHOW_ID = "5Xibl3BuCkhfxRJRu5v6ML";
const SHOW_URL = `https://creators.spotify.com/pod/show/${SHOW_ID}`;
const STORAGE_FILE = "/tmp/spotify-storage.json";
const SEED_FILE = path.resolve("content/podcast/seedBednightStories.mjs");

// Known title patterns on Spotify → canonical story title
const TITLE_PATTERNS = [
  // New format: "Title — Bedtime Story for Kids (XX Min)"
  { regex: /^(.+?)\s*[—–]\s*Bedtime Story/i, group: 1 },
  // Old format: "Bednight Stories: Title | GoReadling"
  { regex: /^Bednight Stories:\s*(.+?)\s*\|\s*GoReadling/i, group: 1 },
  // Alt: "Bedtime Stories: Title | GoReadling" or "Bedtime Stories : Title | GoReadling"
  { regex: /^Bedtime Stor(?:y|ies)\s*:\s*(.+?)\s*\|\s*GoReadling/i, group: 1 },
  // Alt: "Title | Bedtime Story for Kids | XX Min"
  { regex: /^(.+?)\s*\|\s*Bedtime Story/i, group: 1 },
];

// Manual overrides for misspelled/inconsistent titles on Spotify
const TITLE_OVERRIDES = {
  "Aladdin and the wonderful lampa": "Aladdin and the Wonderful Lamp",
  "The Little Mermaid": "Marina the Little Mermaid",
  "The tree little pigs": "The Three Little Pigs",
  "The Ugly duckling": "The Ugly Duckling",
  "Tortoise and the Hare": "The Tortoise and the Hare",
  "The Tortoise and the Hare": "The Tortoise and the Hare",
  "Snow white and the seven dwarfs": "Snow White and the Seven Dwarfs",
  "Pocahontas Daughter of the river": "Pocahontas, Daughter of the River",
};

function extractStoryTitle(episodeTitle) {
  for (const { regex, group } of TITLE_PATTERNS) {
    const match = episodeTitle.match(regex);
    if (match) {
      const raw = match[group].trim();
      return TITLE_OVERRIDES[raw] || raw;
    }
  }
  const raw = episodeTitle.trim();
  return TITLE_OVERRIDES[raw] || raw;
}

async function main() {
  const updateSeed = process.argv.includes("--update-seed");

  if (!fs.existsSync(STORAGE_FILE)) {
    console.error(`❌ ${STORAGE_FILE} not found. Export Spotify cookies first.`);
    process.exit(1);
  }

  console.log("\n🎙️  Fetching Spotify episode links...\n");

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
  });
  const context = await browser.newContext({
    storageState: STORAGE_FILE,
  });
  const page = await context.newPage();

  try {
    // Navigate to show
    console.log("  🌐 Navigating to show...");
    await page.goto(`${SHOW_URL}/home`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(5000);

    // Dismiss cookie consent if present
    try {
      const confirmBtn = page.getByRole("button", {
        name: "Confirm My Choices",
      });
      if (await confirmBtn.isVisible({ timeout: 3000 })) {
        await confirmBtn.click();
        console.log("  🍪 Dismissed cookie consent");
        await page.waitForTimeout(2000);
      }
    } catch {
      // No cookie dialog
    }

    // Navigate to episodes list
    await page.getByTestId("episodes-link").click();
    await page.waitForSelector('a[href*="/episode/"]', { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Collect episodes across all pages
    const allEps = new Map();

    for (let pg = 0; pg < 20; pg++) {
      const eps = await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll('a[href*="/episode/"]')
        )
          .filter((a) => a.href.includes("/details"))
          .map((a) => {
            const m = a.href.match(/\/episode\/([a-zA-Z0-9]+)/);
            return m ? { id: m[1], title: a.textContent.trim() } : null;
          })
          .filter(Boolean);
      });

      for (const ep of eps) allEps.set(ep.id, ep.title);
      console.log(
        `  📄 Page ${pg + 1}: ${eps.length} episodes (total: ${allEps.size})`
      );

      // Try next page
      try {
        const nextBtn = page.locator(
          'button[aria-label="Load the next page of episodes"]'
        );
        if (await nextBtn.isEnabled({ timeout: 2000 })) {
          await nextBtn.click();
          await page.waitForTimeout(4000);
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    console.log(`\n  📋 Found ${allEps.size} episodes total\n`);

    // Map to canonical story titles
    const episodeMap = {};
    for (const [id, rawTitle] of allEps) {
      const storyTitle = extractStoryTitle(rawTitle);
      episodeMap[storyTitle] = id;
      console.log(`  ✅ ${storyTitle}: '${id}'`);
    }

    // Output as JS object
    console.log("\n══════════════════════════════════════════════════");
    console.log("📋 SPOTIFY_IDS for seedBednightStories.mjs:\n");
    const sorted = Object.entries(episodeMap).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    for (const [title, id] of sorted) {
      const padded = `'${title}':`.padEnd(52);
      console.log(`  ${padded} '${id}',`);
    }
    console.log("══════════════════════════════════════════════════\n");

    // If --update-seed, merge into the seed file
    if (updateSeed) {
      console.log("  📝 Updating seedBednightStories.mjs...");
      let seedContent = fs.readFileSync(SEED_FILE, "utf8");

      // Read existing SPOTIFY_IDS
      const existing = {};
      const idsBlock = seedContent.match(
        /const SPOTIFY_IDS = \{([\s\S]*?)\};/
      );
      if (idsBlock) {
        for (const [, title, id] of idsBlock[1].matchAll(
          /['"]([^'"]+)['"]:\s*'([^']+)'/g
        )) {
          existing[title] = id;
        }
      }

      // Merge: new values override existing
      const merged = { ...existing, ...episodeMap };
      const sortedMerged = Object.entries(merged).sort(([a], [b]) =>
        a.localeCompare(b)
      );

      // Build new block
      let newBlock = "const SPOTIFY_IDS = {\n";
      for (const [title, id] of sortedMerged) {
        const escapedTitle = title.includes("'")
          ? `"${title}"`
          : `'${title}'`;
        const paddedKey = `${escapedTitle}:`.padEnd(54);
        newBlock += `  ${paddedKey} '${id}',\n`;
      }
      newBlock += "};";

      const regex = /const SPOTIFY_IDS = \{[\s\S]*?\};/;
      if (regex.test(seedContent)) {
        seedContent = seedContent.replace(regex, newBlock);
        fs.writeFileSync(SEED_FILE, seedContent);
        console.log(
          `  ✅ Updated SPOTIFY_IDS: ${sortedMerged.length} entries`
        );
      } else {
        console.error("  ❌ Could not find SPOTIFY_IDS block in seed file");
      }
    }
  } catch (err) {
    console.error(`\n❌ Failed: ${err.message}`);
    const screenshotPath = `/tmp/spotify-links-error-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`📸 Screenshot saved: ${screenshotPath}`);
    process.exit(1);
  } finally {
    await context.close();
    await browser.close();
  }
}

main();
