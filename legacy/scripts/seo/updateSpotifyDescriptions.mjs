#!/usr/bin/env node

/**
 * Update Spotify episode descriptions from SPOTIFY_MARKETING.md master file.
 * Connects to Chrome debug port (9222) and uses execCommand to replace descriptions.
 *
 * Usage:
 *   1. Launch Chrome with debug port, sign into creators.spotify.com
 *   2. node scripts/seo/updateSpotifyDescriptions.mjs
 *      node scripts/seo/updateSpotifyDescriptions.mjs --dry-run
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SHOW_ID = '5Xibl3BuCkhfxRJRu5v6ML';
const SHOW_URL = `https://creators.spotify.com/pod/show/${SHOW_ID}`;
const MARKETING_FILE = path.resolve(process.cwd(), 'exports/stories/SPOTIFY_MARKETING.md');
const dryRun = process.argv.includes('--dry-run');

const SPOTIFY_EPISODES = {
  'Aladdin and the Wonderful Lamp': '1A5SovrLl0pTrN71j2Rx5A',
  'Cinderella': '2U7QDEB2Oy8l2VzxtFzqZa',
  'Goldilocks and the Three Bears': '4rVhqq2mNt9iD02lzRJgYG',
  'Hansel and Gretel': '112PtgH19wejIqwkBICVEq',
  'Jack and the Beanstalk': '6i62kt0lJhUnfd0mbye71x',
  'Jack and the Seven League Boots': '0OmRbKP89GY2Hbpgv2TXnr',
  'Little Red Riding Hood': '6wleXG9hHTPf4hrFtWnObA',
  'Marina the Little Mermaid': '09aNs22bzwXy6I4Kpbawso',
  'Pinocchio, the Wooden Boy': '00GCnAqYMPxcmuRyuuuP6p',
  'Pocahontas, Daughter of the River': '0jr6SWN6v48N1OsgLIQqbC',
  'Puss in Boots': '69l9WabQfzWGjm2yKdOx5X',
  'Rapunzel': '6xXBdhjABZW5DKUyyOFWUD',
  'Rumpelstiltskin': '5FYn3OPzNDxovL0HiNC0oV',
  'Sleeping Beauty': '5gg6EwvTpIiBbdTZ5lUgzI',
  'Snow White and the Seven Dwarfs': '5nTbRMfzZuRbCKUX4ESSrw',
  'Stone Soup': '6jt4sFhpRaqyuZMcNcwylC',
  'The Boy Who Cried Wolf': '4oy9UvECt3a7C7YFwALmHe',
  'The Brave Little Tailor': '3aiLE1mRYrswCxlQQFcMsz',
  'The Bremen Town Musicians': '3uoYXZZsQRhQ9DFaGe7vE9',
  'The Elves and the Shoemaker': '6EjS8iYOQ5ZmuJE3ElO60g',
  "The Emperor's New Clothes": '1YNRXBf2Sck3Q8dXj9H9RQ',
  'The Frog Prince': '4Fa7o2ywuvZhpBenVef35a',
  'The Gingerbread Man': '204cHzI0bHeCaONWx7Eb8T',
  'The Golden Goose': '5giHpm4wRGPP0X1aO4SGoj',
  'The Little Red Hen': '3IrAqpEnraQ37Yu05FKbiB',
  'The Pied Piper of Hamelin': '2nvLtsU9EMxQEiuHBqB9kB',
  'The Princess and the Pea': '1WyRRxUtneY3M2AhlRuKSg',
  'The Steadfast Tin Soldier': '6Ts9xBT6kbK01JLqRUJ0HO',
  'The Tale of Peter Rabbit': '0tSRt3bG4ThlgxqPOldxza',
  'The Three Little Pigs': '2S0JvpI6tb6j3ox2isC14R',
  'The Tortoise and the Hare': '6BVPIN5Ri5aHxS0b2AHeVx',
  'The Twelve Dancing Princesses': '5WSxC0cgSMa2A49Sq4yw61',
  'The Ugly Duckling': '0ITeXMGewX5rPg7QMmLGhv',
  'The Wizard of Oz': '09dKY6qRoCTP0TsIC0s8iM',
  'Thumbelina': '2s5SkUYHJLwxMzwwhB3vWX',
  'Winnie-the-Pooh and the Honey Tree': '6BhRDwwqRdLbhGMwwurndG',
};

/** Parse SPOTIFY_MARKETING.md to extract description for each story */
function parseMarketingDescriptions() {
  const content = fs.readFileSync(MARKETING_FILE, 'utf8');
  const SEP = '═══════════════════════════════════════════════════';
  const parts = content.split(SEP);
  const descriptions = {};

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    const epMatch = part.match(/^EPISODE \d+: (.+)$/m);
    if (!epMatch) continue;

    const title = epMatch[1].trim();
    const nextPart = parts[i + 1] || '';

    // Extract description block between "Description:\n" and end of section
    const descMatch = nextPart.match(/Description:\n([\s\S]+?)$/);
    if (descMatch) {
      descriptions[title] = descMatch[1].trim();
    }
  }

  return descriptions;
}

async function main() {
  console.log(`🎙️ Updating Spotify descriptions from SPOTIFY_MARKETING.md${dryRun ? ' (DRY RUN)' : ''}...\n`);

  const marketingDescs = parseMarketingDescriptions();
  console.log(`📄 Parsed ${Object.keys(marketingDescs).length} descriptions from marketing file\n`);

  if (dryRun) {
    for (const [title, epId] of Object.entries(SPOTIFY_EPISODES)) {
      const desc = marketingDescs[title];
      console.log(`  ${desc ? '📝' : '⚠️'} [${title}] ${desc ? `${desc.length} chars` : 'No marketing entry'}`);
    }
    process.exit(0);
  }

  console.log('  🔌 Connecting to Chrome on port 9222...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();

  let updated = 0, failed = 0, skipped = 0;

  try {
    for (const [title, epId] of Object.entries(SPOTIFY_EPISODES)) {
      const newDesc = marketingDescs[title];
      if (!newDesc) {
        console.log(`  ⚠️ [${title}] No marketing entry — skipping`);
        skipped++;
        continue;
      }

      try {
        console.log(`\n  📝 [${title}]`);

        // Navigate to episode edit page
        await page.goto(`${SHOW_URL}/episode/${epId}/details`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);

        // Dismiss cookie consent
        try {
          const btn = page.getByRole('button', { name: 'Confirm My Choices' });
          if (await btn.isVisible({ timeout: 2000 })) { await btn.click(); await page.waitForTimeout(2000); }
        } catch {}

        // Find description field
        const descField = page.locator('[role="textbox"][contenteditable="true"]');
        if (!await descField.isVisible({ timeout: 5000 })) {
          console.log('     ⚠️ Description field not visible — skipping');
          skipped++;
          continue;
        }

        // Select all text, delete it, then paste new description via clipboard
        await descField.click();
        await page.waitForTimeout(300);

        // Select all and delete existing content
        await page.keyboard.press('Meta+a');
        await page.waitForTimeout(200);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(500);

        // Write new description to clipboard and paste it
        await page.evaluate(async (text) => {
          await navigator.clipboard.writeText(text);
        }, newDesc);
        await page.waitForTimeout(200);
        await page.keyboard.press('Meta+v');
        await page.waitForTimeout(2000);

        // Wait for Save button to be enabled and click
        console.log('     💾 Saving...');
        try {
          // Wait for the button to become enabled (Spotify validates content)
          await page.waitForFunction(() => {
            const btn = document.querySelector('button[data-encore-id="buttonPrimary"]');
            return btn && !btn.disabled;
          }, null, { timeout: 10000 });

          await page.getByRole('button', { name: 'Save' }).click();
          await page.waitForTimeout(3000);
          updated++;
          console.log(`     ✅ Updated (${newDesc.length} chars)`);
        } catch (saveErr) {
          // Save button might stay disabled if content didn't change
          console.log('     ⚠️ Save button disabled — content may be unchanged or validation error');
          skipped++;
        }

      } catch (e) {
        failed++;
        console.error(`     ❌ Failed: ${e.message.slice(0, 100)}`);
      }
    }
  } finally {
    await page.close();
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Done! ${updated} updated, ${skipped} skipped, ${failed} failed`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
