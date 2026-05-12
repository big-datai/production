#!/usr/bin/env node
/**
 * Add an existing video to the Sara and Eva Season 1 playlist (or any playlist
 * by ID). Idempotent — silently skips if the video is already there.
 *
 * Use this to backfill episodes that were uploaded before the
 * uploadEpisodeToSaraAndEva.mjs auto-add was wired up, or to re-add a video
 * that was accidentally removed.
 *
 * Usage:
 *   node addVideoToPlaylist.mjs <video_id_or_url>
 *   node addVideoToPlaylist.mjs <id> --playlist-id <PL...>
 *   node addVideoToPlaylist.mjs --all          # add ALL channel uploads to default playlist (paginates)
 *
 * Examples:
 *   node addVideoToPlaylist.mjs BZCFoXQ4pWA
 *   node addVideoToPlaylist.mjs https://youtu.be/BZCFoXQ4pWA
 *   node addVideoToPlaylist.mjs --all
 *
 * On first run after the upload-script's scope upgrade (post-ep11 v7), this
 * will re-trigger the OAuth flow to authorize the wider permission set.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

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
const SEASON_1_PLAYLIST_ID = 'PLMLz_1vaheL70se8M2xV0vQttiZlIJJ6f';

const argv = process.argv.slice(2);
const argFlag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i+1] : null; };
const playlistId = argFlag('playlist-id') || SEASON_1_PLAYLIST_ID;
const addAll = argv.includes('--all');
const positional = argv.find(a => !a.startsWith('--'));

function extractVideoId(input) {
  if (!input) return null;
  // Strip any URL form, return the bare 11-char video ID
  const m = input.match(/(?:youtu\.be\/|v=|\/video\/|^)([A-Za-z0-9_-]{11})(?:$|[?&/])/);
  return m ? m[1] : (input.length === 11 ? input : null);
}

async function getOAuthClient() {
  const credsRaw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const key = credsRaw.installed || credsRaw.web;
  const oauth = new OAuth2Client(key.client_id, key.client_secret, key.redirect_uris[0]);
  if (fs.existsSync(TOKEN_PATH)) {
    const tok = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const tokenScopes = (tok.scope || '').split(' ').filter(Boolean);
    const missing = SCOPES.filter(s => !tokenScopes.includes(s));
    if (missing.length === 0) {
      oauth.setCredentials(tok);
      return oauth;
    }
    console.log(`\n🔐 OAuth scope upgrade required. Missing: ${missing.join(', ')}\n   Re-authenticating...\n`);
  }
  const authUrl = oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
  console.log(`🔐 Open this URL in a browser logged into the SaraAndEva Google account:\n\n   ${authUrl}\n`);
  console.log(`Then paste the authorization code below.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => rl.question('\nCode: ', resolve));
  rl.close();
  const { tokens } = await oauth.getToken(code.trim());
  oauth.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`✓ Saved token to ${TOKEN_PATH}\n`);
  return oauth;
}

async function getPlaylistItems(youtube, playlistId) {
  const ids = new Set();
  let pageToken = undefined;
  for (let page = 0; page < 30; page++) {
    const res = await youtube.playlistItems.list({
      part: ['snippet'],
      playlistId,
      maxResults: 50,
      pageToken,
    });
    for (const item of res.data.items || []) {
      const vid = item.snippet?.resourceId?.videoId;
      if (vid) ids.add(vid);
    }
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return ids;
}

async function getAllChannelUploads(youtube) {
  // Find the user's "uploads" playlist via channels.list?mine=true
  const ch = await youtube.channels.list({ part: ['contentDetails'], mine: true });
  const uploadsId = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) throw new Error('Could not find the channel uploads playlist.');
  // Get every video in the uploads playlist (chronological — oldest last by default)
  const videos = [];
  let pageToken = undefined;
  for (let page = 0; page < 30; page++) {
    const res = await youtube.playlistItems.list({
      part: ['snippet'],
      playlistId: uploadsId,
      maxResults: 50,
      pageToken,
    });
    for (const item of res.data.items || []) {
      const vid = item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title || '';
      const publishedAt = item.snippet?.publishedAt || '';
      if (vid) videos.push({ id: vid, title, publishedAt });
    }
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return videos;
}

async function addOne(youtube, videoId, playlistId, existingIds) {
  if (existingIds.has(videoId)) {
    console.log(`  ⏭  ${videoId} — already in playlist`);
    return false;
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
  console.log(`  ✓ ${videoId} — added`);
  return true;
}

async function main() {
  if (!addAll && !positional) {
    console.error(`Usage: addVideoToPlaylist.mjs <video_id_or_url> [--playlist-id <PL...>]`);
    console.error(`       addVideoToPlaylist.mjs --all   # backfill every channel upload`);
    process.exit(1);
  }
  const auth = await getOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  console.log(`📂 Playlist: ${playlistId}`);
  console.log(`   Loading current playlist contents...`);
  const existingIds = await getPlaylistItems(youtube, playlistId);
  console.log(`   ${existingIds.size} video(s) already in playlist\n`);

  if (addAll) {
    console.log(`🔄 Backfill mode — scanning all channel uploads...`);
    const all = await getAllChannelUploads(youtube);
    // Sort oldest first so the playlist order is chronological
    all.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
    console.log(`   ${all.length} total uploads on channel\n`);
    let added = 0;
    for (const v of all) {
      const titlePreview = v.title.length > 60 ? v.title.slice(0, 57) + '...' : v.title;
      process.stdout.write(`  ${titlePreview.padEnd(62)} `);
      const wasAdded = await addOne(youtube, v.id, playlistId, existingIds);
      if (wasAdded) { added++; existingIds.add(v.id); }
    }
    console.log(`\n📊 Added ${added} new video(s); ${all.length - added} already in playlist.`);
  } else {
    const videoId = extractVideoId(positional);
    if (!videoId) {
      console.error(`❌ Could not extract a YouTube video ID from: ${positional}`);
      process.exit(1);
    }
    console.log(`🎯 Adding single video: ${videoId}`);
    const wasAdded = await addOne(youtube, videoId, playlistId, existingIds);
    console.log(wasAdded
      ? `\n✅ Done. https://youtube.com/playlist?list=${playlistId}`
      : `\n📋 No-op — already in the playlist.`);
  }
}

main().catch(e => {
  console.error('\n❌', e.message);
  if (e.message?.includes('insufficient') || e.message?.includes('403')) {
    console.error(`   Likely a scope issue. Delete ${TOKEN_PATH} and re-run.`);
  }
  process.exit(1);
});
