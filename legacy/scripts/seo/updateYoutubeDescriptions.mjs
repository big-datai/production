#!/usr/bin/env node
/**
 * Update YouTube video descriptions from YOUTUBE_MARKETING.md master file.
 * Fully replaces each video's description with the clean version from the file.
 *
 * Usage:
 *   node scripts/seo/updateYoutubeDescriptions.mjs          # update all
 *   node scripts/seo/updateYoutubeDescriptions.mjs --dry-run # preview
 */

import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

const TOKEN_PATH = path.resolve(process.cwd(), 'token.json');
const MARKETING_FILE = path.resolve(process.cwd(), 'exports/stories/YOUTUBE_MARKETING.md');
const dryRun = process.argv.includes('--dry-run');

const YOUTUBE_IDS = {
  'Aladdin and the Wonderful Lamp': 'eZCFp0HF3mM',
  'Cinderella': 'uhKDhGx1fak',
  'Goldilocks and the Three Bears': 'oVd-GkB666E',
  'Hansel and Gretel': 'sFQb2kQzZvk',
  'Jack and the Beanstalk': 'RLRzAMrb8b4',
  'Jack and the Seven League Boots': 'TPPFUOPkp9I',
  'Little Red Riding Hood': '7sU6bhrcCOQ',
  'Marina the Little Mermaid': 'b0XJ_vtvUWQ',
  'Pinocchio, the Wooden Boy': 'c0MpyJxO6YM',
  'Pocahontas, Daughter of the River': 'YsKVI8QucXo',
  'Puss in Boots': 'LNQrNMiFZbI',
  'Rapunzel': 'aqF9VU4d9Bw',
  'Rumpelstiltskin': 'y3_abdpdYl4',
  'The Elves and the Shoemaker': 'a3zaSrAxFw8',
  'The Gingerbread Man': 'lA9rM1vh1Xc',
  'The Princess and the Pea': 'H-L4UxrkQJM',
  'The Tale of Peter Rabbit': 'QfYEf22mLAQ',
  'The Three Little Pigs': 'sRPHxISGLtw',
  'The Tortoise and the Hare': 'r9D4m-CAuhY',
  'The Ugly Duckling': 'c4fJoeGwykU',
  'The Wizard of Oz': 'h4d9QAv5dnY',
  'Thumbelina': '0iA6aggNRrI',
  'The Frog Prince': 'CdC8AJdKfLo',
  'Sleeping Beauty': 'xJrtZKUfEyk',
  'Winnie-the-Pooh and the Honey Tree': 'pDoKGnjlQzI',
  'The Boy Who Cried Wolf': 'drwW4mMMY3k',
  'The Bremen Town Musicians': 'yPWnWP4ykUw',
  'The Golden Goose': 'XsmWRXqKrsw',
  'The Brave Little Tailor': 'RKgm3v_Dn_A',
  'The Pied Piper of Hamelin': 'ZDIBKikyFOA',
  'Stone Soup': 'OqT_BOPahs4',
  'The Little Red Hen': '9GyFFxmNf_U',
  'The Steadfast Tin Soldier': 'dX_GlZIGhio',
  'The Twelve Dancing Princesses': '4gJ923UQTqA',
  "The Emperor's New Clothes": 'Ihb6S7lw1xk',
  'Snow White and the Seven Dwarfs': 't90gc2zEZlw',
};

/** Parse YOUTUBE_MARKETING.md to extract description for each story */
function parseMarketingDescriptions() {
  const content = fs.readFileSync(MARKETING_FILE, 'utf8');
  const SEP = '═══════════════════════════════════════════════════';
  const parts = content.split(SEP);
  const descriptions = {};

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    const videoMatch = part.match(/^VIDEO \d+: (.+)$/m);
    if (!videoMatch) continue;

    const title = videoMatch[1].trim();
    // The description is in the NEXT part (after the separator)
    const nextPart = parts[i + 1] || '';

    // Extract description block: between "Description:\n" and "\n\nTags:\n" (or end)
    const descMatch = nextPart.match(/Description:\n([\s\S]+?)(?:\n\nTags:\n|$)/);
    if (descMatch) {
      descriptions[title] = descMatch[1].trim();
    }
  }

  return descriptions;
}

async function getAuthClient() {
  try {
    const content = fs.readFileSync(TOKEN_PATH, 'utf8');
    return google.auth.fromJSON(JSON.parse(content));
  } catch (err) {
    console.error('❌ No token.json found.');
    process.exit(1);
  }
}

async function main() {
  console.log(`📺 Updating YouTube descriptions from YOUTUBE_MARKETING.md${dryRun ? ' (DRY RUN)' : ''}...\n`);

  // Parse marketing file
  const marketingDescs = parseMarketingDescriptions();
  console.log(`📄 Parsed ${Object.keys(marketingDescs).length} descriptions from marketing file\n`);

  const auth = await getAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  let updated = 0, failed = 0, skipped = 0;

  for (const [title, videoId] of Object.entries(YOUTUBE_IDS)) {
    const newDesc = marketingDescs[title];
    if (!newDesc) {
      console.log(`  ⚠️ [${title}] No marketing entry found — skipping`);
      skipped++;
      continue;
    }

    try {
      // Fetch current video details
      const res = await youtube.videos.list({ part: 'snippet', id: videoId });
      if (!res.data.items?.length) {
        console.log(`  ❌ [${title}] Video not found: ${videoId}`);
        failed++;
        continue;
      }

      const snippet = res.data.items[0].snippet;
      const currentDesc = snippet.description || '';

      if (dryRun) {
        const changed = currentDesc !== newDesc;
        console.log(`  ${changed ? '📝' : '⏭️'} [${title}] ${changed ? `Would update (${currentDesc.length} → ${newDesc.length} chars)` : 'Already matches'}`);
        if (changed) updated++;
        else skipped++;
        continue;
      }

      // Fully replace description
      await youtube.videos.update({
        part: 'snippet',
        requestBody: {
          id: videoId,
          snippet: { ...snippet, description: newDesc },
        },
      });

      updated++;
      console.log(`  ✅ [${title}] Updated (${newDesc.length} chars)`);

      // Rate limit
      await new Promise(r => setTimeout(r, 500));

    } catch (e) {
      failed++;
      const msg = e.response?.data?.error?.message || e.message;
      console.error(`  ❌ [${title}] ${msg}`);
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Done! ${updated} updated, ${skipped} skipped, ${failed} failed`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
