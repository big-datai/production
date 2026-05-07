#!/usr/bin/env node
/**
 * Push a custom thumbnail to a Sara & Eva YouTube video.
 *
 * Usage:
 *   node _updateYoutubeThumbnail.mjs --video <youtube_id> --thumbnail <path/to/thumb.jpg>
 *
 * Quota cost per call: 50 units (default daily quota: 10000).
 */
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  if (eq > 0) {
    flags[a.slice(2, eq)] = a.slice(eq + 1);
  } else {
    flags[a.slice(2)] = argv[i + 1];
    i++;
  }
}

const videoId = flags.video;
const thumbnailPath = flags.thumbnail ? path.resolve(flags.thumbnail) : null;

if (!videoId || !thumbnailPath) {
  console.error('Usage: _updateYoutubeThumbnail.mjs --video <id> --thumbnail <path.jpg>');
  process.exit(1);
}
if (!fs.existsSync(thumbnailPath)) {
  console.error(`❌ thumbnail file not found: ${thumbnailPath}`);
  process.exit(1);
}

const ROOT = '/Volumes/Samsung500/goreadling';
const cred = JSON.parse(fs.readFileSync(`${ROOT}/credentials-saraandeva.json`, 'utf8'));
const tok = JSON.parse(fs.readFileSync(`${ROOT}/token-saraandeva.json`, 'utf8'));
const k = cred.installed || cred.web;
const oauth = new OAuth2Client(k.client_id, k.client_secret, k.redirect_uris[0]);
oauth.setCredentials(tok);

const youtube = google.youtube({ version: 'v3', auth: oauth });

console.log(`🖼  Pushing ${path.basename(thumbnailPath)} → ${videoId}`);
try {
  const res = await youtube.thumbnails.set({
    videoId,
    media: { body: fs.createReadStream(thumbnailPath) },
  });
  console.log(`✅ ${videoId}`);
  console.log(`   Watch: https://youtu.be/${videoId}`);
  console.log(`   Edit:  https://studio.youtube.com/video/${videoId}/edit`);
  if (res.data?.items?.[0]?.default?.url) {
    console.log(`   New default thumb URL: ${res.data.items[0].default.url}`);
  }
} catch (err) {
  console.error(`❌ thumbnail push failed: ${err.message}`);
  if (err.response?.data) {
    console.error(JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
}
