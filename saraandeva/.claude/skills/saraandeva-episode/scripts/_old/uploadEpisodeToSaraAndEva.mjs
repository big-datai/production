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

// Scopes — full YouTube permission set so we never have to do another
// OAuth scope-upgrade dance. Covers: upload, manage playlists, manage
// captions/comments, channel admin, analytics (incl. monetary), partner
// rights. Re-auth fires on first run after this commit (cached token
// lacks the wider scopes).
const SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
  'https://www.googleapis.com/auth/youtubepartner',
];
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
// Playlist auto-add — strategy work post-ep11 v7. Adding every uploaded
// episode to a single "Season 1" playlist makes YouTube's autoplay sidebar
// chain episodes in order, which is the biggest unlock for cross-episode
// retention on a young channel (per kid-show YouTube best-practice review).
//
// Default: the live "Season 1" playlist. Override with --playlist-id <PL...>
// or skip entirely with --no-playlist.
const SEASON_1_PLAYLIST_ID = 'PLMLz_1vaheL70se8M2xV0vQttiZlIJJ6f';
const playlistIdFlag = argFlag('playlist-id') || SEASON_1_PLAYLIST_ID;
const playlistName = argFlag('playlist-name')
  || 'Sara and Eva 🌟 Season 1 — Real Sisters, Real Puppies, Real Adventures';
const skipPlaylistAdd = argv.includes('--no-playlist');

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
    // Scope-upgrade detection: if the cached token doesn't include every scope
    // we now require, force re-auth. This handles the post-ep11 v7 upgrade
    // from `youtube.upload` only → adding `youtube` (for playlist writes).
    const tokenScopes = (tok.scope || '').split(' ').filter(Boolean);
    const missing = SCOPES.filter(s => !tokenScopes.includes(s));
    if (missing.length === 0) {
      oauth.setCredentials(tok);
      return oauth;
    }
    console.log(`\n🔐 OAuth scope upgrade required.`);
    console.log(`   Cached token is missing: ${missing.join(', ')}`);
    console.log(`   Re-authenticating with the full scope set...\n`);
  }

  // Re-auth path (also first-time path): print URL, user opens, pastes code back
  const authUrl = oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
  console.log(`\n🔐 OAuth for the SaraAndEva channel — full scope set.`);
  console.log(`1) Open this URL in a browser logged into the SaraAndEva Google account:`);
  console.log(`\n   ${authUrl}\n`);
  console.log(`2) Authorize, copy the code from the redirect URL, paste here.`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => rl.question('\nPaste the authorization code: ', resolve));
  rl.close();

  const { tokens } = await oauth.getToken(code.trim());
  oauth.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`✓ Saved token (with new scope) to ${TOKEN_PATH}`);
  return oauth;
}

/**
 * Resolve the playlist ID from a name. Pages through `playlists.list?mine=true`
 * (max 50 per page) to handle channels with many playlists. Match is case-
 * insensitive and trims whitespace + emoji-rendering quirks.
 */
async function findPlaylistIdByName(youtube, name) {
  const wantTitle = name.trim().toLowerCase();
  let pageToken = undefined;
  for (let page = 0; page < 10; page++) {
    const res = await youtube.playlists.list({
      part: ['snippet'],
      mine: true,
      maxResults: 50,
      pageToken,
    });
    for (const pl of res.data.items || []) {
      if ((pl.snippet?.title || '').trim().toLowerCase() === wantTitle) return pl.id;
    }
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return null;
}

/**
 * Add an uploaded video to a playlist. Idempotent — silently no-ops if the
 * video is already in the playlist (paginates through to check). Failures
 * are warnings (don't block the upload from completing).
 */
async function addVideoToPlaylist(youtube, videoId, playlistId) {
  // Idempotency: scan playlist for this videoId before inserting.
  let pageToken = undefined;
  for (let page = 0; page < 20; page++) {
    const res = await youtube.playlistItems.list({
      part: ['snippet'],
      playlistId,
      maxResults: 50,
      pageToken,
    });
    for (const item of res.data.items || []) {
      if (item.snippet?.resourceId?.videoId === videoId) {
        console.log(`   Playlist: already in playlist (skipping add)`);
        return;
      }
    }
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  await youtube.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId },
      },
    },
  });
}

async function main() {
  // HARD precondition (post-ep10): validate the assembled episode before
  // spending the YouTube upload quota + minutes. Catches missing thumbnail,
  // tags > 500 chars, music-segment duration mismatch, sequence gaps.
  // Override with --skip-validation if you must (don't).
  const skipValidation = argv.includes('--skip-validation');
  if (!skipValidation) {
    const m = videoPath.match(/episode_(\d+)\//);
    if (m) {
      const epNum = Number(m[1]);
      const validator = path.join(path.dirname(new URL(import.meta.url).pathname), 'validateEpisode.mjs');
      console.log(`\n🩺 Pre-upload validation — validateEpisode --episode=${epNum}`);
      const { spawnSync } = await import('node:child_process');
      const v = spawnSync('node', [validator, `--episode=${epNum}`], { stdio: 'inherit' });
      if (v.status === 1) {
        console.error(`\n❌ validateEpisode found errors. Fix the deliverables or pass --skip-validation. Aborting upload.`);
        process.exit(1);
      }
    }
  }

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
  // Playlist auto-add — Season 1 series binding. This is the single biggest
  // unlock for cross-episode retention on @SaraAndEva — videos in the same
  // playlist auto-chain in the YouTube "Up Next" sidebar.
  if (!skipPlaylistAdd) {
    try {
      let playlistId = playlistIdFlag;
      if (!playlistId) {
        playlistId = await findPlaylistIdByName(youtube, playlistName);
      }
      if (!playlistId) {
        console.warn(`\n⚠ Playlist not found by name: "${playlistName}"`);
        console.warn(`   Pass --playlist-id <PL...> directly, or --no-playlist to skip.`);
      } else {
        await addVideoToPlaylist(youtube, videoId, playlistId);
        console.log(`   Playlist: ✓ added to "${playlistName}"`);
        console.log(`   ${`https://youtube.com/playlist?list=${playlistId}`}`);
      }
    } catch (err) {
      // Don't block on playlist failure — upload itself succeeded. Most
      // common failure: 403 because the cached token still has only the
      // youtube.upload scope. Fix is to delete the token and re-run (the
      // scope-upgrade path in getOAuthClient will fire next time).
      console.warn(`\n⚠ Playlist add failed: ${err.message}`);
      if (err.message?.includes('403') || err.message?.includes('insufficientPermissions')) {
        console.warn(`   Likely a scope issue. Delete ${TOKEN_PATH} and re-run`);
        console.warn(`   to re-authorize with the full scope set.`);
      }
    }
  }

  if (privacy === 'unlisted') {
    console.log(`\n📋 Status: UNLISTED — review the video in YouTube Studio.`);
    console.log(`   When ready, flip privacy to PUBLIC in the Studio editor.`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
