#!/usr/bin/env node
/**
 * Split Shorts out of a playlist so it stays a clean "full episodes only"
 * series playlist. Optionally moves the removed Shorts into a dedicated
 * Shorts playlist (created if it doesn't exist).
 *
 * Why: a mixed episodes+shorts playlist breaks the "watch the next full
 * episode" autoplay rhythm — kid finishes ep5 → autoplays a 30s Short →
 * kid bored. Cleaner to have two playlists (one episodes-only for autoplay
 * marathon, one Shorts-only for fast-discovery).
 *
 * What's a Short? Either:
 *   - duration ≤ 65s (a hair over 60s to handle 60.x rounding), OR
 *   - title contains "#Shorts" or "#shorts"
 *
 * Usage:
 *   node splitShortsFromPlaylist.mjs                       # dry-run by default
 *   node splitShortsFromPlaylist.mjs --apply               # actually remove
 *   node splitShortsFromPlaylist.mjs --apply --move-to-shorts-playlist
 *
 * Flags:
 *   --playlist-id <PL...>          Source playlist (default: Season 1)
 *   --shorts-playlist-name "..."   Name for the Shorts playlist
 *                                  (default: "Sara and Eva — Shorts (Quick Moments)")
 *   --apply                        Actually mutate (without this, dry-run only)
 *   --move-to-shorts-playlist      Also create + populate the Shorts playlist
 *
 * Idempotent: safe to re-run.
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
const sourcePlaylistId = argFlag('playlist-id') || SEASON_1_PLAYLIST_ID;
const shortsPlaylistName = argFlag('shorts-playlist-name') || 'Sara and Eva — Shorts (Quick Moments)';
const apply = argv.includes('--apply');
const moveToShorts = argv.includes('--move-to-shorts-playlist');

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
    console.log(`\n🔐 OAuth scope upgrade required. Missing: ${missing.join(', ')}\n`);
  }
  const authUrl = oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
  console.log(`🔐 Open this URL:\n\n   ${authUrl}\n\nThen paste the code below.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => rl.question('Code: ', resolve));
  rl.close();
  const { tokens } = await oauth.getToken(code.trim());
  oauth.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  return oauth;
}

// Convert ISO 8601 duration (PT5M52S) to seconds
function isoToSeconds(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseFloat(m[3] || '0');
}

async function getPlaylistItems(youtube, playlistId) {
  const items = [];
  let pageToken = undefined;
  for (let page = 0; page < 30; page++) {
    const res = await youtube.playlistItems.list({
      part: ['snippet', 'id'],
      playlistId,
      maxResults: 50,
      pageToken,
    });
    for (const item of res.data.items || []) {
      items.push({
        playlistItemId: item.id,
        videoId: item.snippet?.resourceId?.videoId,
        title: item.snippet?.title || '',
      });
    }
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}

async function getVideoDurations(youtube, videoIds) {
  const durations = new Map();
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const res = await youtube.videos.list({
      part: ['contentDetails'],
      id: chunk.join(','),
    });
    for (const v of res.data.items || []) {
      durations.set(v.id, isoToSeconds(v.contentDetails?.duration));
    }
  }
  return durations;
}

async function findOrCreatePlaylist(youtube, name) {
  // Find by title
  let pageToken = undefined;
  for (let page = 0; page < 10; page++) {
    const res = await youtube.playlists.list({
      part: ['snippet'],
      mine: true,
      maxResults: 50,
      pageToken,
    });
    for (const pl of res.data.items || []) {
      if ((pl.snippet?.title || '').trim() === name.trim()) return pl.id;
    }
    pageToken = res.data.nextPageToken;
    if (!pageToken) break;
  }
  // Create if not found
  console.log(`\n📁 Creating new playlist: "${name}"`);
  const res = await youtube.playlists.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: name,
        description: 'Quick moments from the Sara and Eva channel — short clips perfect for a smile-break! Subscribe for new full episodes every week.',
      },
      status: { privacyStatus: 'public' },
    },
  });
  console.log(`   Created: ${res.data.id}`);
  return res.data.id;
}

async function main() {
  const auth = await getOAuthClient();
  const youtube = google.youtube({ version: 'v3', auth });

  console.log(`\n📂 Source playlist: ${sourcePlaylistId}`);
  console.log(`   Mode: ${apply ? 'APPLY (will mutate)' : 'DRY-RUN (will only print)'}`);
  if (moveToShorts) console.log(`   Will move Shorts to: "${shortsPlaylistName}"`);
  console.log('');

  const items = await getPlaylistItems(youtube, sourcePlaylistId);
  console.log(`   ${items.length} item(s) in source playlist`);

  const videoIds = items.map(i => i.videoId).filter(Boolean);
  const durations = await getVideoDurations(youtube, videoIds);

  // Phase 1: dedupe — group by videoId, keep first occurrence, mark rest as
  // duplicates. Earlier addVideoToPlaylist --all runs left the playlist with
  // ~8 episodes appearing twice each.
  const seenVideoIds = new Set();
  const duplicates = [];
  const uniqueItems = [];
  for (const item of items) {
    if (seenVideoIds.has(item.videoId)) {
      duplicates.push(item);
    } else {
      seenVideoIds.add(item.videoId);
      uniqueItems.push(item);
    }
  }

  // Phase 2: classify unique items into Shorts vs full episodes
  const shorts = [];
  const fullEpisodes = [];
  for (const item of uniqueItems) {
    const dur = durations.get(item.videoId) || 0;
    const titleHasShortsTag = /#shorts/i.test(item.title);
    const isShort = (dur > 0 && dur <= 65) || titleHasShortsTag;
    (isShort ? shorts : fullEpisodes).push({ ...item, duration: dur });
  }

  console.log(`\n📊 Classification:`);
  console.log(`   ${duplicates.length} duplicate item(s) — to be removed (keep first occurrence)`);
  console.log(`   ${fullEpisodes.length} unique full episode(s) — keep in playlist`);
  console.log(`   ${shorts.length} unique Short(s) — to be removed from source playlist`);
  console.log(`\n📺 Full episodes (KEEP in playlist):`);
  for (const f of fullEpisodes) {
    const m = Math.floor(f.duration / 60), s = Math.floor(f.duration % 60);
    console.log(`   ✓ [${String(m).padStart(2)}:${String(s).padStart(2,'0')}] ${f.title.slice(0, 80)}`);
  }
  console.log(`\n⏩ Shorts (REMOVE from playlist):`);
  for (const s of shorts) {
    const dur = Math.round(s.duration);
    console.log(`   ✗ [${dur}s] ${s.title.slice(0, 80)}`);
  }
  if (duplicates.length > 0) {
    console.log(`\n♻️  Duplicates (REMOVE — keep only first occurrence):`);
    for (const d of duplicates) {
      console.log(`   ✗ ${d.videoId} — ${d.title.slice(0, 80)}`);
    }
  }

  if (!apply) {
    console.log(`\n💡 Dry-run only. Re-run with --apply to actually remove the Shorts.`);
    if (!moveToShorts) {
      console.log(`   Add --move-to-shorts-playlist to also put them in a separate Shorts playlist.`);
    }
    return;
  }

  // ───── APPLY MODE ──────
  let shortsPlaylistId = null;
  if (moveToShorts && shorts.length > 0) {
    shortsPlaylistId = await findOrCreatePlaylist(youtube, shortsPlaylistName);
    // Build set of video IDs already in the shorts playlist (for idempotency)
    const existingShortItems = await getPlaylistItems(youtube, shortsPlaylistId);
    const alreadyInShorts = new Set(existingShortItems.map(i => i.videoId));
    console.log(`\n📁 Adding ${shorts.length} Short(s) to "${shortsPlaylistName}":`);
    for (const s of shorts) {
      if (alreadyInShorts.has(s.videoId)) {
        console.log(`   ⏭  ${s.videoId} — already in shorts playlist`);
        continue;
      }
      await youtube.playlistItems.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            playlistId: shortsPlaylistId,
            resourceId: { kind: 'youtube#video', videoId: s.videoId },
          },
        },
      });
      console.log(`   ✓ ${s.videoId} — added to shorts playlist`);
    }
  }

  if (duplicates.length > 0) {
    console.log(`\n♻️  Removing ${duplicates.length} duplicate(s) from source playlist:`);
    for (const d of duplicates) {
      await youtube.playlistItems.delete({ id: d.playlistItemId });
      console.log(`   ✓ ${d.videoId} (dup) — removed`);
    }
  }

  console.log(`\n🗑  Removing ${shorts.length} Short(s) from source playlist:`);
  for (const s of shorts) {
    await youtube.playlistItems.delete({ id: s.playlistItemId });
    console.log(`   ✓ ${s.videoId} — removed`);
  }

  console.log(`\n✅ Done.`);
  console.log(`   Source playlist: https://youtube.com/playlist?list=${sourcePlaylistId}`);
  console.log(`   Final count: ${fullEpisodes.length} full episode(s) only`);
  if (shortsPlaylistId) console.log(`   Shorts playlist: https://youtube.com/playlist?list=${shortsPlaylistId}`);
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
