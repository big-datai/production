#!/usr/bin/env node
/**
 * Upload a SaraAndEva episode MP4 to YouTube on the SaraAndEva channel.
 * - Made-for-Kids = ON (forced, COPPA compliance)
 * - Privacy = UNLISTED initially (per the publish-family-story Phase 5 plan,
 *   user reviews then flips to public manually)
 * - Uses credentials-saraandeva.json + token-saraandeva.json (DIFFERENT
 *   channel than the goreadling/podcast publishing flow which uses
 *   credentials.json + token.json)
 *
 * On first run: walks user through OAuth (opens browser → user copies a code
 * back into terminal). After that, token-saraandeva.json caches the refresh
 * token and uploads run unattended.
 *
 * Usage:
 *   node uploadEpisodeToSaraAndEva.mjs <video_path> [--title "..."] [--description-file path] [--tags-file path] [--privacy unlisted|public|private]
 *
 * --tags-file: newline-separated tags file. If omitted, falls back to the ep01
 * default tag list below.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const ROOT = '/Volumes/Samsung500/goreadling';
const CREDENTIALS_PATH = path.join(ROOT, 'credentials-saraandeva.json');
const TOKEN_PATH = path.join(ROOT, 'token-saraandeva.json');

// CLI args
const argv = process.argv.slice(2);
const videoPath = argv.find(a => !a.startsWith('--'));
if (!videoPath || !fs.existsSync(videoPath)) {
  console.error('Usage: uploadEpisodeToSaraAndEva.mjs <video.mp4> [--title "..."] [--description-file path] [--privacy unlisted|public|private]');
  process.exit(1);
}
const argFlag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i+1] : null; };
const title = argFlag('title') || 'Sara and Eva — Episode 1: The Puppies Want Pancakes';
const descFile = argFlag('description-file');
const tagsFile = argFlag('tags-file');
const thumbnailPath = argFlag('thumbnail');
const privacy = argFlag('privacy') || 'unlisted';

const tags = tagsFile && fs.existsSync(tagsFile)
  ? fs.readFileSync(tagsFile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
  : [
      'kids cartoon', 'sara and eva', 'pixar style',
      'puppy cartoon', 'cartoons for kids', 'kids stories',
      'family cartoon', 'preschool', 'jack russell', 'pomeranian',
      'breakfast', 'pancakes', 'morning routine', 'school bus',
    ];

const description = descFile && fs.existsSync(descFile)
  ? fs.readFileSync(descFile, 'utf8')
  : `Wake up, eat pancakes, count to five, brush teeth, off to school! Join Sara, Eva, Mama, Papa, Ginger, and Joe for a sunny family morning.

This is Episode 1 of Sara and Eva — a Pixar-style animated kids' show about two real-life sisters and their two real-life dogs.

⏱️ Episode chapters
0:00 House
0:03 Meet Sara
0:08 Meet Eva
0:13 Meet Mama
0:19 Bedroom — wake up
0:33 Run to the kitchen
0:43 Mama at the stove
0:57 Sisters greet Mama
1:11 Papa joins the party
1:25 Counting pancakes 1-2-3-4-5
1:34 Family table — Joe spins
1:48 Final family closer
1:53 Mama packs lunchboxes
1:58 Off to school 🚌

#SaraAndEva #KidsCartoon #CartoonsForKids #PreschoolLearning #PuppyStories
`;

async function getOAuthClient() {
  const credsRaw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const key = credsRaw.installed || credsRaw.web;
  const oauth = new OAuth2Client(key.client_id, key.client_secret, key.redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const tok = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth.setCredentials(tok);
    return oauth;
  }

  // First-time OAuth: print URL, user opens, pastes code back
  const authUrl = oauth.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\n🔐 First-time auth for the SaraAndEva channel.');
  console.log('1) Open this URL in a browser logged into the SaraAndEva Google account:');
  console.log(`\n   ${authUrl}\n`);
  console.log('2) Authorize, copy the code from the redirect URL, paste here.');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => rl.question('\nPaste the authorization code: ', resolve));
  rl.close();

  const { tokens } = await oauth.getToken(code.trim());
  oauth.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`✓ Saved token to ${TOKEN_PATH}`);
  return oauth;
}

async function main() {
  const auth = await getOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const fileSize = fs.statSync(videoPath).size;
  console.log(`\n📤 Uploading: ${path.basename(videoPath)} (${(fileSize/1024/1024).toFixed(1)} MB)`);
  console.log(`   Title:   ${title}`);
  console.log(`   Privacy: ${privacy}`);
  console.log(`   Made for Kids: ON (forced)`);

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    notifySubscribers: false,
    requestBody: {
      snippet: {
        title,
        description,
        tags,
        categoryId: '24', // Entertainment
        defaultLanguage: 'en',
      },
      status: {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: true,
        embeddable: true,
      },
    },
    media: { body: fs.createReadStream(videoPath) },
  });

  const videoId = res.data.id;
  console.log(`\n✅ Uploaded.`);
  console.log(`   Video ID:  ${videoId}`);
  console.log(`   Watch:     https://youtu.be/${videoId}`);
  console.log(`   Edit:      https://studio.youtube.com/video/${videoId}/edit`);

  // Custom thumbnail — uses youtube.thumbnails.set, requires the channel to
  // have thumbnail-upload privileges. Made-for-Kids and Shorts both support
  // custom thumbnails (Shorts thumbnails are taken from the video frame in
  // the feed but appear in the video's own page).
  if (thumbnailPath) {
    if (!fs.existsSync(thumbnailPath)) {
      console.warn(`\n⚠ thumbnail file not found: ${thumbnailPath} — skipping thumbnail upload`);
    } else {
      try {
        await youtube.thumbnails.set({
          videoId,
          media: { body: fs.createReadStream(thumbnailPath) },
        });
        console.log(`   Thumbnail: ${path.basename(thumbnailPath)} ✓`);
      } catch (err) {
        console.warn(`\n⚠ thumbnail upload failed: ${err.message}`);
        console.warn(`   (channel may need verification — set thumbnail manually in YouTube Studio)`);
      }
    }
  }
  if (privacy === 'unlisted') {
    console.log(`\n📋 Status: UNLISTED — review the video in YouTube Studio.`);
    console.log(`   When ready, flip privacy to PUBLIC in the Studio editor.`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
