#!/usr/bin/env node
/**
 * Bulk-request Google indexing for all prebuilt story pages + static pages.
 * Uses the same Google Indexing API as dailyStory.mjs Step 7.
 *
 * Prerequisites:
 *   1. "Web Search Indexing API" enabled in Google Cloud Console
 *   2. Service account added as Owner in Google Search Console
 *   3. gcloud auth application-default configured
 *
 * Usage:
 *   node scripts/seo/requestIndexing.mjs          # submit all URLs
 *   node scripts/seo/requestIndexing.mjs --dry-run # list URLs without submitting
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { execSync, spawnSync } from 'child_process';

// ── Firebase setup ──────────────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}
const db = getFirestore(admin.app(), 'google-gemini-firestore');

const titleToSlug = title => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const DELAY_MS = 500;
const dryRun = process.argv.includes('--dry-run');

async function main() {
  // 1. Load all prebuilt stories
  console.log('📦 Loading prebuilt stories from Firestore...');
  const snap = await db.collection('stories').where('isPrebuilt', '==', true).get();
  console.log(`   Found ${snap.size} prebuilt stories`);

  const urls = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (d.title) {
      urls.push(`https://goreadling.com/stories/${titleToSlug(d.title)}`);
    }
  });

  // Add static pages
  urls.push(
    'https://goreadling.com/',
    'https://goreadling.com/stories',
    'https://goreadling.com/podcast',
    'https://goreadling.com/blog',
    'https://goreadling.com/blog/best-bedtime-stories-for-toddlers',
    'https://goreadling.com/blog/classic-fairy-tales-for-kids',
    'https://goreadling.com/blog/how-to-build-a-bedtime-reading-routine',
    'https://goreadling.com/blog/bedtime-stories-with-morals',
    'https://goreadling.com/blog/short-bedtime-stories-for-kids',
    'https://goreadling.com/blog/personalized-bedtime-stories',
  );

  console.log(`\n📋 Total URLs to submit: ${urls.length}`);

  if (dryRun) {
    console.log('\n🔍 DRY RUN — URLs that would be submitted:\n');
    urls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
    process.exit(0);
  }

  // 2. Get access token (same approach as dailyStory.mjs)
  console.log('\n🔑 Getting access token...');
  let accessToken;
  try {
    accessToken = execSync(
      'gcloud auth application-default print-access-token',
      { encoding: 'utf8', env: { ...process.env, PATH: `/usr/local/share/google-cloud-sdk/bin:/usr/local/bin:${process.env.PATH}` } }
    ).trim();
    console.log('   ✅ Token acquired');
  } catch (e) {
    console.error('❌ Failed to get access token. Run: gcloud auth application-default login');
    process.exit(1);
  }

  // 3. Submit each URL
  let success = 0, failed = 0;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const res = spawnSync('curl', [
        '-s', '-X', 'POST',
        'https://indexing.googleapis.com/v3/urlNotifications:publish',
        '-H', 'Content-Type: application/json',
        '-H', `Authorization: Bearer ${accessToken}`,
        '-H', 'x-goog-user-project: gen-lang-client-0430249113',
        '-d', JSON.stringify({ url, type: 'URL_UPDATED' }),
      ], { encoding: 'utf8', stdio: 'pipe' });

      const body = JSON.parse(res.stdout || '{}');
      if (body.urlNotificationMetadata) {
        success++;
        console.log(`  ✅ [${i + 1}/${urls.length}] ${url}`);
      } else if (body.error) {
        failed++;
        console.log(`  ❌ [${i + 1}/${urls.length}] ${url} — ${body.error.code}: ${body.error.message}`);

        if (body.error.code === 429) {
          console.log('  ⏳ Rate limited, waiting 30s...');
          await new Promise(r => setTimeout(r, 30000));
        }
      } else {
        success++;
        console.log(`  ⚠️ [${i + 1}/${urls.length}] ${url} — ${res.stdout?.slice(0, 120)}`);
      }
    } catch (e) {
      failed++;
      console.error(`  ❌ [${i + 1}/${urls.length}] ${url} — ${e.message}`);
    }

    if (i < urls.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Done! ${success} succeeded, ${failed} failed out of ${urls.length} URLs`);
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
