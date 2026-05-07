// Flip one or more YouTube videos to PRIVATE. Used for emergency takedown
// when a published video has a defect.
//
// Usage:
//   node _yt_set_private.mjs <videoId1> <videoId2> ...
import fs from 'node:fs';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const ROOT = '/Volumes/Samsung500/goreadling';
const creds = JSON.parse(fs.readFileSync(`${ROOT}/credentials-saraandeva.json`, 'utf8'));
const tok = JSON.parse(fs.readFileSync(`${ROOT}/token-saraandeva.json`, 'utf8'));
const c = creds.installed || creds.web;
const oauth = new OAuth2Client(c.client_id, c.client_secret, c.redirect_uris?.[0]);
oauth.setCredentials(tok);
const yt = google.youtube({ version: 'v3', auth: oauth });

const ids = process.argv.slice(2);
if (!ids.length) { console.error('Usage: _yt_set_private.mjs <videoId1> [videoId2] ...'); process.exit(1); }

for (const id of ids) {
  try {
    await yt.videos.update({
      part: ['status'],
      requestBody: { id, status: { privacyStatus: 'private', selfDeclaredMadeForKids: true } },
    });
    console.log(`  ✓ ${id} → PRIVATE`);
  } catch (e) {
    console.log(`  ✗ ${id}  ${e.message}`);
  }
}
