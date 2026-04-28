#!/usr/bin/env node
/**
 * Upload YouTube Shorts and add pinned comments with app link.
 *
 * Usage:
 *   node scripts/upload-shorts.mjs              # upload all
 *   node scripts/upload-shorts.mjs --dry-run    # preview
 */

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const TOKEN_PATH = 'token.json';
const APP_STORE = 'https://apps.apple.com/app/goreadling/id6755505679';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.goreadling.app';

const dryRun = process.argv.includes('--dry-run');

const titleToSlug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  const creds = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const auth = google.auth.fromJSON(creds);
  const yt = google.youtube({ version: 'v3', auth });

  // Find all shorts
  const shorts = [];
  const searchDirs = ['exports/stories', 'exports/stories/_published'];
  for (const base of searchDirs) {
    if (!fs.existsSync(base)) continue;
    for (const dir of fs.readdirSync(base)) {
      if (dir.startsWith('_') || dir.startsWith('.')) continue;
      const shortsDir = path.join(base, dir, 'shorts');
      if (!fs.existsSync(shortsDir)) continue;
      for (const f of fs.readdirSync(shortsDir).sort()) {
        if (!f.endsWith('.mp4')) continue;

        // Build title
        const storyName = dir.replace(/_\d{8}$/, '').replace(/_/g, ' ');
        let videoTitle;
        if (f.includes('_part1')) {
          videoTitle = `${storyName} — Part 1 | Bedtime Story #shorts`;
        } else if (f.includes('_part2')) {
          videoTitle = `${storyName} — Part 2 | Bedtime Story #shorts`;
        } else {
          videoTitle = `${storyName} | Bedtime Story #shorts`;
        }

        // Build description
        const slug = titleToSlug(storyName);
        const descFile = fs.readdirSync(shortsDir).find(d => d.endsWith('_description.txt'));
        let description = '';
        if (descFile) {
          const raw = fs.readFileSync(path.join(shortsDir, descFile), 'utf8');
          // Take only the part before PINNED COMMENT
          description = raw.split('PINNED COMMENT')[0].trim();
        }
        if (!description) {
          description = `🌙 ${storyName} — a bedtime story in 60 seconds!\n\n` +
            `📖 Read along: https://goreadling.com/stories/${slug}\n` +
            `📱 Download GoReadling Free: ${APP_STORE}\n` +
            `🎧 Full story on Spotify: https://open.spotify.com/show/5Xibl3BuCkhfxRJRu5v6ML\n\n` +
            `#bedtimestory #kidsstory #shorts #goreadling #bedtimeforkids #storytime`;
        }

        // Pinned comment
        const pinnedComment = `🌙 Want the full story?\n` +
          `📖 Read along with illustrations: https://goreadling.com/stories/${slug}\n` +
          `📱 Get GoReadling FREE:\n` +
          `🍎 iOS: ${APP_STORE}\n` +
          `🤖 Android: ${PLAY_STORE}`;

        shorts.push({
          filePath: path.join(shortsDir, f),
          title: videoTitle,
          description,
          pinnedComment,
          storyName,
        });
      }
    }
  }

  console.log(`📺 Uploading ${shorts.length} YouTube Shorts${dryRun ? ' (DRY RUN)' : ''}\n`);

  let uploaded = 0, failed = 0;

  for (const short of shorts) {
    console.log(`\n📎 ${short.title}`);
    const sizeMB = (fs.statSync(short.filePath).size / 1024 / 1024).toFixed(0);
    console.log(`   ${sizeMB} MB — ${short.filePath}`);

    if (dryRun) {
      uploaded++;
      continue;
    }

    try {
      // Upload video
      const res = await yt.videos.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: short.title,
            description: short.description,
            tags: ['bedtime story', 'kids story', 'shorts', 'goreadling', 'fairy tale',
                   'bedtime', 'children story', 'sleep story', 'story time'],
            categoryId: '27', // Education
            defaultLanguage: 'en',
          },
          status: {
            privacyStatus: 'private', // Review before making public
            selfDeclaredMadeForKids: true,
          },
        },
        media: {
          body: fs.createReadStream(short.filePath),
        },
      });

      const videoId = res.data.id;
      console.log(`   ✅ Uploaded: https://youtube.com/shorts/${videoId}`);

      // Add pinned comment
      try {
        const commentRes = await yt.commentThreads.insert({
          part: 'snippet',
          requestBody: {
            snippet: {
              videoId,
              topLevelComment: {
                snippet: {
                  textOriginal: short.pinnedComment,
                },
              },
            },
          },
        });
        console.log(`   📌 Pinned comment added`);
      } catch (e) {
        // Comments might be disabled for made-for-kids content
        console.log(`   ⚠️ Could not add comment: ${e.message?.slice(0, 80)}`);
      }

      uploaded++;
      await new Promise(r => setTimeout(r, 2000)); // rate limit

    } catch (e) {
      console.log(`   ❌ ${e.message?.slice(0, 100)}`);
      failed++;
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Done! ${uploaded} uploaded, ${failed} failed`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
