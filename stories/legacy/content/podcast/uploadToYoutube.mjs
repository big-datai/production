#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { patchYoutubeId } from './patchSeedIds.mjs';

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const CREDENTIALS_PATH = path.resolve(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.resolve(process.cwd(), 'token.json');

const STORIES_DIR = path.resolve(process.cwd(), 'exports', 'stories');
const MARKETING_FILE = path.resolve(STORIES_DIR, 'YOUTUBE_MARKETING.md');

// Load API credentials
async function loadSavedCredentialsIfExist() {
  try {
    const content = fs.readFileSync(TOKEN_PATH, 'utf8');
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client) {
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  fs.writeFileSync(TOKEN_PATH, payload);
}

async function getAuthClient() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }

  console.error("Please provide a valid token in token.json locally using google-auth-library.");
  console.error("For a serverless setup you would usually implement an oauth flow.");
  console.error("Or use API Keys, however Youtube Data API Video Upload requires OAuth2.");
  process.exit(1);
}

// Parse Marketing MD — handles double-separator format (═══ VIDEO N: ═══)
function parseMarketingData() {
  const content = fs.readFileSync(MARKETING_FILE, 'utf8');
  const SEP = '═══════════════════════════════════════════════════';
  const parts = content.split(SEP);
  const videos = [];

  // The format is: ...content... ═══ VIDEO N: Title ═══ ...content...
  // So VIDEO headers are in odd-indexed parts, content follows in even-indexed parts
  for (let i = 0; i < parts.length; i++) {
    const headerMatch = parts[i].trim().match(/^VIDEO \d+: (.+)$/);
    if (headerMatch && i + 1 < parts.length) {
      const storyName = headerMatch[1].trim();
      const baseName = storyName.replace(/[.,'!?\-:]/g, '').replace(/\s+/g, '_');
      const body = parts[i + 1]; // content section follows the header

      const titleMatch = body.match(/Title:\n([^\n]+)/);
      const descMatch = body.match(/Description:\n([\s\S]+?)(?:#bedtimestory|\nTags:)/);
      const tagsMatch = body.match(/Tags:\n([\s\S]+?)$/);

      if (titleMatch && descMatch) {
        const hashtagMatch = body.match(/(#[a-zA-Z0-9#\s]+)\n\nTags:/);
        const hashtags = hashtagMatch ? hashtagMatch[1].trim() + '\n\n' : '';
        const description = (descMatch[1].trim() + '\n\n' + hashtags).trim();
        const tagsString = tagsMatch ? tagsMatch[1].trim() : '';
        const tags = tagsString.split(',').map(t => t.trim()).filter(Boolean);

        videos.push({
          baseName,
          title: titleMatch[1].trim(),
          description,
          tags
        });
      }
    }
  }

  return videos;
}

const safeTitle = (title) =>
  title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");

/** Find all MP4 videos across story export folders */
function findAllVideos() {
  if (!fs.existsSync(STORIES_DIR)) return [];
  const videos = [];
  for (const dir of fs.readdirSync(STORIES_DIR)) {
    const storyRoot = path.join(STORIES_DIR, dir);
    if (!fs.statSync(storyRoot).isDirectory() || dir === 'STATUS.md') continue;
    // Look for MP4 in youtube/<SafeTitle>/<SafeTitle>.mp4
    const youtubeDir = path.join(storyRoot, 'youtube');
    if (!fs.existsSync(youtubeDir)) continue;
    for (const sub of fs.readdirSync(youtubeDir)) {
      const mp4 = path.join(youtubeDir, sub, `${sub}.mp4`);
      if (fs.existsSync(mp4)) {
        videos.push({ name: sub, path: mp4 });
      }
    }
  }
  return videos;
}

// Upload Video
async function uploadVideo(auth, videoFile, meta) {
  const youtube = google.youtube({ version: 'v3', auth });

  const fileSize = fs.statSync(videoFile).size;

  console.log(`\nUploading: ${meta.title}...`);
  
  try {
    const res = await youtube.videos.insert({
      part: 'id,snippet,status',
      notifySubscribers: false,
      requestBody: {
        snippet: {
          title: meta.title,
          description: meta.description,
          tags: meta.tags,
          categoryId: '1', // Film & Animation or 27 (Education)
        },
        status: {
          privacyStatus: 'private', // Upload as private initially
          selfDeclaredMadeForKids: true,
        },
      },
      media: {
        body: fs.createReadStream(videoFile),
      },
    }, {
      onUploadProgress: evt => {
        const progress = (evt.bytesRead / fileSize) * 100;
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`Progress: ${Math.round(progress)}%`);
      },
    });
    
    console.log(`\n✅ Upload complete! Video ID: ${res.data.id}`);
    console.log(`🔗 https://www.youtube.com/watch?v=${res.data.id}`);
    return res.data;
  } catch (err) {
    console.error('\n❌ Error uploading video:', err.message);
    return null;
  }
}

async function main() {
  console.log('🤖 Preparing to upload to YouTube...');

  const marketingData = parseMarketingData();
  const videos = findAllVideos();

  // CLI filter: node uploadToYoutube.mjs "Story Title" to upload just one
  const filterArg = process.argv.slice(2).find(a => !a.startsWith('--'));

  console.log(`Found ${videos.length} MP4 files and ${marketingData.length} video metadata entries.`);

  const auth = await getAuthClient();

  for (const video of videos) {
    // Optional filter
    if (filterArg && !video.name.toLowerCase().replace(/_/g, ' ').includes(filterArg.toLowerCase())) continue;

    // Try to match metadata
    const meta = marketingData.find(m => video.name.includes(m.baseName) || m.baseName.includes(video.name));

    if (!meta) {
      console.log(`⚠ SKIP: No metadata found in YOUTUBE_MARKETING.md for ${video.name}`);
      continue;
    }

    const result = await uploadVideo(auth, video.path, meta);
    if (result?.id) {
      // Auto-patch seedBednightStories.mjs with the YouTube video ID
      const storyTitle = video.name.replace(/_/g, ' ');
      try {
        patchYoutubeId(storyTitle, result.id);
      } catch (err) {
        console.log(`  ⚠️  Could not auto-patch seed file: ${err.message}`);
        console.log(`  📋 Manually add to YOUTUBE_IDS: '${storyTitle}': '${result.id}'`);
      }
    }
  }

  console.log('\n🎉 All uploads finished!');
}

main().catch(console.error);