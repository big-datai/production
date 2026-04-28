#!/usr/bin/env node
/**
 * Seed "bednight" (long-form podcast) stories into Firestore.
 *
 * For each story in ~/youtube/:
 *   1. Splits the MP3 into per-page audio chunks using SRT timestamps
 *   2. Uploads audio chunks + illustrations to Firebase Storage
 *   3. Creates/updates a Firestore doc with youtubeUrl, spotifyUrl, pages[]
 *
 * Usage:
 *   node content/podcast/seedBednightStories.mjs              # dry run (list matches)
 *   node content/podcast/seedBednightStories.mjs seed         # seed all
 *   node content/podcast/seedBednightStories.mjs seed Cinderella  # seed one story
 *   node content/podcast/seedBednightStories.mjs seed --force # delete & re-seed
 *
 * Prerequisites:
 *   brew install ffmpeg
 *   gcloud auth application-default login
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { config as loadEnv } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { PODCAST_STORIES } from './podcastStoryConstants.js';
import { pageToText } from './pageUtils.mjs';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });
loadEnv({ path: path.resolve(process.cwd(), '.env') });

// ── Config ────────────────────────────────────────────────────────────────────

// Support new folder structure: exports/stories/<SafeTitle>_MMDDYYYY/youtube/
// Falls back to STORY_DIR env var or ~/youtube for legacy compatibility
const STORIES_BASE_DIR = path.resolve(process.cwd(), 'exports', 'stories');
const YOUTUBE_DIR = process.env.STORY_DIR
  ? path.join(process.env.STORY_DIR, 'youtube')
  : fs.existsSync(STORIES_BASE_DIR) ? STORIES_BASE_DIR : path.resolve(process.env.HOME, 'youtube');
const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0430249113';
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'goreading-gemini-object';
const FIRESTORE_DB = process.env.FIRESTORE_DATABASE_ID || 'google-gemini-firestore';

// YouTube video IDs (fetched via yt-dlp from @goreadling channel)
const YOUTUBE_IDS = {
  'Aladdin and the Wonderful Lamp':    'eZCFp0HF3mM',
  'Cinderella':                         'uhKDhGx1fak',
  'Goldilocks and the Three Bears':     'oVd-GkB666E',
  'Hansel and Gretel':                  'sFQb2kQzZvk',
  'Jack and the Beanstalk':             'RLRzAMrb8b4',
  'Jack and the Seven League Boots':    'TPPFUOPkp9I',
  'Little Red Riding Hood':             '7sU6bhrcCOQ',
  'Marina the Little Mermaid':          'b0XJ_vtvUWQ',
  'Pinocchio, the Wooden Boy':          'c0MpyJxO6YM',
  'Pocahontas, Daughter of the River':  'YsKVI8QucXo',
  'Puss in Boots':                      'LNQrNMiFZbI',
  'Rapunzel':                           'aqF9VU4d9Bw',
  'Rumpelstiltskin':                    'y3_abdpdYl4',
  'The Elves and the Shoemaker':        'a3zaSrAxFw8',
  'The Gingerbread Man':                'lA9rM1vh1Xc',
  'The Princess and the Pea':           'H-L4UxrkQJM',
  'The Tale of Peter Rabbit':           'QfYEf22mLAQ',
  'The Three Little Pigs':              'sRPHxISGLtw',
  'The Tortoise and the Hare':          'r9D4m-CAuhY',
  'The Ugly Duckling':                  'c4fJoeGwykU',
  'The Wizard of Oz':                   'h4d9QAv5dnY',
  'Thumbelina':                         '0iA6aggNRrI',
  'The Frog Prince':    'CdC8AJdKfLo',
  'Sleeping Beauty':    'xJrtZKUfEyk',
  'Winnie-the-Pooh and the Honey Tree': 'pDoKGnjlQzI',
  'The Boy Who Cried Wolf':  'drwW4mMMY3k',
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
  'The Jungle Book': 'SvWjy--31oc',
  'The Little Match Girl': 'u17gqPP9HwE',
  'Ali Baba and the Forty Thieves': '9Uc3A8dpAWE',
  'Beauty and the Beast': 'gyK_sExxhKw',
  'The Snow Queen': '1NNj9jO7_ao',
  'The Nutcracker': '3HmeEGaydSY',
};

// Spotify episode IDs (fetched via Spotify API from show 5Xibl3BuCkhfxRJRu5v6ML)
const SPOTIFY_IDS = {
  'Aladdin and the Wonderful Lamp':                      '1A5SovrLl0pTrN71j2Rx5A',
  'Ali Baba and the Forty Thieves':                      '1S2EMxsV2U3oJoZgwwc0AZ',
  'Beauty and the Beast':                                '4RL9LVqbLJtDUZG0aROeRV',
  'Cinderella':                                          '2U7QDEB2Oy8l2VzxtFzqZa',
  'Goldilocks and the Three Bears':                      '4rVhqq2mNt9iD02lzRJgYG',
  'Hansel and Gretel':                                   '112PtgH19wejIqwkBICVEq',
  'Jack and the Beanstalk':                              '6i62kt0lJhUnfd0mbye71x',
  'Jack and the Seven League Boots':                     '0OmRbKP89GY2Hbpgv2TXnr',
  'Little Red Riding Hood':                              '6wleXG9hHTPf4hrFtWnObA',
  'Marina the Little Mermaid':                           '09aNs22bzwXy6I4Kpbawso',
  'Pinocchio, the Wooden Boy':                           '00GCnAqYMPxcmuRyuuuP6p',
  'Pocahontas, Daughter of the River':                   '0jr6SWN6v48N1OsgLIQqbC',
  'Puss in Boots':                                       '69l9WabQfzWGjm2yKdOx5X',
  'Rapunzel':                                            '6xXBdhjABZW5DKUyyOFWUD',
  'Rumpelstiltskin':                                     '5FYn3OPzNDxovL0HiNC0oV',
  's New Clothes':                                       '4np0DZmdR9TO48GKAl0CYm',
  'Sleeping Beauty':                                     '5gg6EwvTpIiBbdTZ5lUgzI',
  'Snow White and the Seven Dwarfs':                     '5nTbRMfzZuRbCKUX4ESSrw',
  'Stone Soup':                                          '6jt4sFhpRaqyuZMcNcwylC',
  'The Boy Who Cried Wolf':                              '4oy9UvECt3a7C7YFwALmHe',
  'The Brave Little Tailor':                             '3aiLE1mRYrswCxlQQFcMsz',
  'The Bremen Town Musicians':                           '3uoYXZZsQRhQ9DFaGe7vE9',
  'The Elves and the Shoemaker':                         '6EjS8iYOQ5ZmuJE3ElO60g',
  "The Emperor's New Clothes":                           '1YNRXBf2Sck3Q8dXj9H9RQ',
  'The Frog Prince':                                     '4Fa7o2ywuvZhpBenVef35a',
  'The Gingerbread Man':                                 '204cHzI0bHeCaONWx7Eb8T',
  'The Golden Goose':                                    '5giHpm4wRGPP0X1aO4SGoj',
  'The Jungle Book':                                     '0QWchTCMb1nQpkhnOfllq4',
  'The Little Match Girl':                               '0d13EPIUpPRS3cQLy2x5eJ',
  'The Little Red Hen':                                  '3IrAqpEnraQ37Yu05FKbiB',
  'The Pied Piper of Hamelin':                           '2nvLtsU9EMxQEiuHBqB9kB',
  'The Princess and the Pea':                            '1WyRRxUtneY3M2AhlRuKSg',
  'The Snow Queen':                                      '53iCRI6RFbdcrdJDsgLUOr',
  'The Steadfast Tin Soldier':                           '6Ts9xBT6kbK01JLqRUJ0HO',
  'The Tale of Peter Rabbit':                            '0tSRt3bG4ThlgxqPOldxza',
  'The Three Little Pigs':                               '2S0JvpI6tb6j3ox2isC14R',
  'The Tortoise and the Hare':                           '6BVPIN5Ri5aHxS0b2AHeVx',
  'The Twelve Dancing Princesses':                       '5WSxC0cgSMa2A49Sq4yw61',
  'The Ugly Duckling':                                   '0ITeXMGewX5rPg7QMmLGhv',
  'The Wizard of Oz':                                    '09dKY6qRoCTP0TsIC0s8iM',
  'Thumbelina':                                          '2s5SkUYHJLwxMzwwhB3vWX',
  'Winnie-the-Pooh and the Honey Tree':                  '6BhRDwwqRdLbhGMwwurndG',
  'The Nutcracker': '3isWm0TXLZDOkqmepCkv6j',
};

// ── Folder → story title mapping ─────────────────────────────────────────────

const LEGACY_SPOTIFY_DIR = path.resolve(process.cwd(), 'exports', 'spotify');

const FOLDER_TO_TITLE = {
  'Aladdin_and_the_Wonderful_Lamp':       'Aladdin and the Wonderful Lamp',
  'Cinderella':                            'Cinderella',
  'Goldilocks_and_the_Three_Bears':        'Goldilocks and the Three Bears',
  'Hansel_and_Gretel':                     'Hansel and Gretel',
  'Jack_and_the_Beanstalk':                'Jack and the Beanstalk',
  'Jack_and_the_Seven_League_Boots':       'Jack and the Seven League Boots',
  'Little_Red_Riding_Hood':               'Little Red Riding Hood',
  'Marina_the_Little_Mermaid':            'Marina the Little Mermaid',
  'Pinocchio_the_Wooden_Boy':             'Pinocchio, the Wooden Boy',
  'PocahontasDaughteroftheRiver_clips':   'Pocahontas, Daughter of the River',
  'Puss_in_Boots':                         'Puss in Boots',
  'Rapunzel':                              'Rapunzel',
  'Rumpelstiltskin':                       'Rumpelstiltskin',
  'The_Elves_and_the_Shoemaker':           'The Elves and the Shoemaker',
  'The_Gingerbread_Man':                   'The Gingerbread Man',
  'The_Princess_and_the_Pea':             'The Princess and the Pea',
  'The_Tale_of_Peter_Rabbit':              'The Tale of Peter Rabbit',
  'The_Three_Little_Pigs':                 'The Three Little Pigs',
  'The_Tortoise_and_the_Hare':             'The Tortoise and the Hare',
  'The_Ugly_Duckling':                     'The Ugly Duckling',
  'The_Wizard_of_Oz':                      'The Wizard of Oz',
  'Thumbelina':                            'Thumbelina',
  'The_Bremen_Town_Musicians':             'The Bremen Town Musicians',
  'The_Emperors_New_Clothes':              "The Emperor's New Clothes",
};

// Stories only in exports/spotify/ (no ~/youtube folder with SRT)
const SPOTIFY_ONLY_TITLES = [
  'Snow White and the Seven Dwarfs',
  'The Boy Who Cried Wolf',
  'The Frog Prince',
  'Winnie-the-Pooh and the Honey Tree',
  'Sleeping Beauty',
];

const TITLE_TO_SPOTIFY_FILE = {
  'Snow White and the Seven Dwarfs':     'Snow_White_and_the_Seven_Dwarfs',
  'The Boy Who Cried Wolf':              'The_Boy_Who_Cried_Wolf',
  'The Frog Prince':                     'The_Frog_Prince',
  'Winnie-the-Pooh and the Honey Tree':  'WinniethePooh_and_the_Honey_Tree',
  'Sleeping Beauty':                     'Sleeping_Beauty',
};

// ── SRT parsing ───────────────────────────────────────────────────────────────

function parseSrt(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const blocks = text.trim().split(/\n\n+/);
  const entries = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    const timeLine = lines.find(l => l.includes('-->'));
    if (!timeLine) continue;
    const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
    const textLines = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim();
    if (!textLines) continue;
    entries.push({
      startMs: srtTimeToMs(startStr),
      endMs: srtTimeToMs(endStr),
      text: textLines,
    });
  }
  return entries;
}

function srtTimeToMs(t) {
  // 00:01:23,456 or 00:01:23.456
  const [hms, ms] = t.replace(',', '.').split('.');
  const [h, m, s] = hms.split(':').map(Number);
  return ((h * 3600 + m * 60 + s) * 1000) + (parseInt(ms || '0'));
}

// ── Group SRT entries into pages matching podcastStoryConstants pages ─────────

function groupSrtIntoPages(srtEntries, storyPages) {
  // Each page in podcastStoryConstants has a known word count.
  // Walk through SRT entries and assign them to pages by cumulative word count.
  const totalWords = srtEntries.reduce((sum, e) => sum + e.text.split(/\s+/).length, 0);

  const pageBoundaries = [];
  let cumulative = 0;
  const pageWordCounts = storyPages.map(p => pageToText(p).split(/\s+/).length);
  const totalPageWords = pageWordCounts.reduce((a, b) => a + b, 0);

  // Scale page word counts to total SRT word count
  let srtIndex = 0;
  const groups = [];

  for (let pi = 0; pi < storyPages.length; pi++) {
    const targetWords = pageWordCounts[pi];
    const group = { entries: [], pageIndex: pi };
    let wordsSoFar = 0;
    const isLast = pi === storyPages.length - 1;

    while (srtIndex < srtEntries.length) {
      const entry = srtEntries[srtIndex];
      const entryWords = entry.text.split(/\s+/).length;
      group.entries.push(entry);
      wordsSoFar += entryWords;
      srtIndex++;
      // Stop when we've covered roughly this page's worth, unless last page
      if (!isLast && wordsSoFar >= targetWords * 0.85) break;
    }
    groups.push(group);
  }

  // Any remaining entries go into last page
  while (srtIndex < srtEntries.length) {
    groups[groups.length - 1].entries.push(srtEntries[srtIndex++]);
  }

  return groups.map(g => ({
    startMs: g.entries[0]?.startMs ?? 0,
    endMs: g.entries[g.entries.length - 1]?.endMs ?? 0,
    text: storyPages[g.pageIndex],
  }));
}

// ── FFmpeg: split MP3 into chunks ─────────────────────────────────────────────

function splitMp3(inputPath, startMs, endMs, outputPath) {
  const start = startMs / 1000;
  const duration = (endMs - startMs) / 1000;
  const result = spawnSync('ffmpeg', [
    '-y', '-i', inputPath,
    '-ss', String(start),
    '-t', String(duration),
    '-acodec', 'libmp3lame', '-q:a', '4',
    outputPath
  ], { stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr?.toString()}`);
  }
}

// ── Firebase upload helpers ───────────────────────────────────────────────────

async function uploadFile(bucket, remotePath, localPath, contentType) {
  const buf = fs.readFileSync(localPath);
  const file = bucket.file(remotePath);
  await file.save(buf, { contentType, metadata: { cacheControl: 'public, max-age=31536000' } });
  const encodedPath = remotePath.split('/').map(encodeURIComponent).join('/');
  return `https://storage.googleapis.com/${bucket.name}/${encodedPath}`;
}

// ── Main seeding function ─────────────────────────────────────────────────────

async function seedStory(folder, db, bucket, force = false, resolvedPath = null) {
  const title = FOLDER_TO_TITLE[folder];
  if (!title) {
    console.log(`⚠️  No title mapping for folder: ${folder}`);
    return;
  }

  const storyData = PODCAST_STORIES.find(s => s.title === title);
  if (!storyData) {
    console.log(`⚠️  No story data in podcastStoryConstants for: ${title}`);
    return;
  }

  const storyDir = resolvedPath || path.join(YOUTUBE_DIR, folder);
  const mp3Files = fs.readdirSync(storyDir).filter(f => f.endsWith('.mp3'));
  const srtFiles = fs.readdirSync(storyDir).filter(f => f.endsWith('.srt'));

  if (!mp3Files.length || !srtFiles.length) {
    console.log(`⚠️  Missing MP3 or SRT in ${folder}`);
    return;
  }

  const mp3Path = path.join(storyDir, mp3Files[0]);
  const srtPath = path.join(storyDir, srtFiles[0]);
  const illustrationsDir = path.join(storyDir, 'illustrations');
  // Cover image fallback chain: cover.png → illustrations/intro.png → illustrations/page_001.png
  let coverPath = path.join(storyDir, 'cover.png');
  if (!fs.existsSync(coverPath)) coverPath = path.join(illustrationsDir, 'intro.png');
  if (!fs.existsSync(coverPath)) coverPath = path.join(illustrationsDir, 'page_001.png');

  console.log(`\n📖 Seeding: ${title}`);

  // Check if already exists
  const storiesRef = db.collection('stories');
  const existing = await storiesRef.where('title', '==', title).where('storyKind', '==', 'night').get();

  let storyId;
  if (!existing.empty && !force) {
    const existingId = existing.docs[0].id;
    console.log(`  ✅ Already exists (${existingId}) — running tests...`);
    runTests(existingId, title);
    return;
  } else if (!existing.empty && force) {
    storyId = existing.docs[0].id;
    console.log(`  🔄 Force re-seeding ${storyId}`);
    await existing.docs[0].ref.delete();
  } else {
    storyId = storiesRef.doc().id;
    console.log(`  🆕 New doc: ${storyId}`);
  }

  // Parse SRT and group into pages
  console.log(`  📄 Parsing SRT (${srtFiles[0]})...`);
  const srtEntries = parseSrt(srtPath);
  const pages = groupSrtIntoPages(srtEntries, storyData.pages);
  console.log(`  📄 ${pages.length} pages from ${srtEntries.length} SRT blocks`);

  // Upload cover image
  let coverUrl = null;
  if (fs.existsSync(coverPath)) {
    console.log(`  🖼  Uploading cover...`);
    coverUrl = await uploadFile(bucket, `illustrations/${storyId}.jpg`, coverPath, 'image/png');
  }

  // Process each page
  const tmpDir = fs.mkdtempSync('/tmp/bednight-');
  const pageData = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNum = String(i + 1).padStart(3, '0');
    console.log(`  📄 Page ${pageNum}/${pages.length} [${(page.startMs/1000).toFixed(1)}s → ${(page.endMs/1000).toFixed(1)}s]`);

    // Split audio chunk
    const tmpMp3 = path.join(tmpDir, `page_${pageNum}.mp3`);
    splitMp3(mp3Path, page.startMs, page.endMs, tmpMp3);

    // Upload audio
    const audioRemote = `audio/${storyId}/page_${i}.mp3`;
    const audioUrl = await uploadFile(bucket, audioRemote, tmpMp3, 'audio/mpeg');

    // Upload illustration
    let illustrationUrl = coverUrl;
    const illusPath = path.join(illustrationsDir, `page_${pageNum}.png`);
    if (fs.existsSync(illusPath)) {
      const illusRemote = `illustrations/${storyId}/page_${i}.jpg`;
      illustrationUrl = await uploadFile(bucket, illusRemote, illusPath, 'image/png');
    }

    const durationMs = page.endMs - page.startMs;

    pageData.push({
      text: page.text,
      audioUrl,
      illustrationUrl,
      durationMs,
      timings: [],    // No word-level timings for podcast stories (pre-recorded audio)
      subtitles: '',
    });

    // Clean up tmp file
    fs.unlinkSync(tmpMp3);
  }

  fs.rmdirSync(tmpDir);

  // YouTube and Spotify URLs
  const youtubeId = YOUTUBE_IDS[title];
  const youtubeUrl = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null;
  const spotifyId = SPOTIFY_IDS[title];
  const spotifyUrl = spotifyId ? `https://open.spotify.com/episode/${spotifyId}` : null;

  // Write Firestore doc
  const doc = {
    title,
    storyKind: 'night',
    isPrebuilt: true,
    narrationMode: 'precomputed',
    supportsHighlighting: false,
    illustrationUrl: coverUrl,
    youtubeUrl: youtubeUrl || null,
    spotifyUrl: spotifyUrl || null,
    pages: pageData,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await storiesRef.doc(storyId).set(doc);
  console.log(`  ✅ Saved ${storyId} — ${pageData.length} pages, YouTube: ${youtubeUrl ?? 'none'}, Spotify: ${spotifyUrl ?? 'pending'}`);
  runTests(storyId, title);
}

function runTests(storyId, title) {
  console.log(`  🧪 Running tests for "${title}" (${storyId})...`);
  const hasYoutube = !!YOUTUBE_IDS[title];
  const testResult = spawnSync('npx', [
    'playwright', 'test', 'test/e2e/bednight-stories.spec.ts',
    '--project=chromium', '--reporter=list', '--workers=1'
  ], {
    env: { ...process.env, STORY_ID: storyId, STORY_TITLE: title, APP_URL: 'http://localhost:5173', HAS_YOUTUBE: hasYoutube ? 'true' : 'false' },
    stdio: 'inherit',
  });

  if (testResult.status !== 0) {
    console.error(`\n❌ Tests FAILED for "${title}" (${storyId}). Stopping seed job.`);
    process.exit(1);
  }
  console.log(`  ✅ Tests passed for "${title}"`);
}

// ── Seed story from exports/spotify/ (no SRT — split audio equally per page) ──

function getMp3DurationMs(mp3Path) {
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', mp3Path
  ], { stdio: 'pipe' });
  return Math.round(parseFloat(result.stdout.toString().trim()) * 1000);
}

async function seedSpotifyOnlyStory(title, db, bucket, force = false) {
  const storyData = PODCAST_STORIES.find(s => s.title === title);
  if (!storyData) {
    console.log(`⚠️  No story data in podcastStoryConstants for: ${title}`);
    return;
  }

  const fileStem = TITLE_TO_SPOTIFY_FILE[title];
  // Try story-specific folder first, then legacy
  const safeN = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  let mp3Path = path.join(LEGACY_SPOTIFY_DIR, `${fileStem}.mp3`);
  // Search both exports/stories/ and exports/stories/_published/
  for (const searchDir of [STORIES_BASE_DIR, path.join(STORIES_BASE_DIR, '_published')]) {
    if (!fs.existsSync(searchDir)) continue;
    const storyMatch = fs.readdirSync(searchDir).find(d => d.startsWith(safeN + '_'));
    if (storyMatch) {
      const storyMp3 = path.join(searchDir, storyMatch, 'spotify', `${safeN}.mp3`);
      if (fs.existsSync(storyMp3)) { mp3Path = storyMp3; break; }
    }
  }
  if (!fs.existsSync(mp3Path)) {
    console.log(`⚠️  Missing MP3: ${mp3Path}`);
    return;
  }

  console.log(`\n📖 Seeding (spotify-only): ${title}`);

  const storiesRef = db.collection('stories');
  const existing = await storiesRef.where('title', '==', title).where('storyKind', '==', 'night').get();

  let storyId;
  if (!existing.empty && !force) {
    const existingId = existing.docs[0].id;
    console.log(`  ✅ Already exists (${existingId}) — running tests...`);
    runTests(existingId, title);
    return;
  } else if (!existing.empty && force) {
    storyId = existing.docs[0].id;
    console.log(`  🔄 Force re-seeding ${storyId}`);
    await existing.docs[0].ref.delete();
  } else {
    storyId = storiesRef.doc().id;
    console.log(`  🆕 New doc: ${storyId}`);
  }

  const totalMs = getMp3DurationMs(mp3Path);
  const pageCount = storyData.pages.length;
  const chunkMs = Math.floor(totalMs / pageCount);
  console.log(`  🎵 ${(totalMs/1000/60).toFixed(1)} min audio → ${pageCount} pages (~${(chunkMs/1000).toFixed(0)}s each)`);

  const tmpDir = fs.mkdtempSync('/tmp/bednight-');
  const pageData = [];

  for (let i = 0; i < pageCount; i++) {
    const pageNum = String(i + 1).padStart(3, '0');
    const startMs = i * chunkMs;
    const endMs = i === pageCount - 1 ? totalMs : (i + 1) * chunkMs;
    console.log(`  📄 Page ${pageNum}/${pageCount} [${(startMs/1000).toFixed(1)}s → ${(endMs/1000).toFixed(1)}s]`);

    const tmpMp3 = path.join(tmpDir, `page_${pageNum}.mp3`);
    splitMp3(mp3Path, startMs, endMs, tmpMp3);

    const audioRemote = `audio/${storyId}/page_${i}.mp3`;
    const audioUrl = await uploadFile(bucket, audioRemote, tmpMp3, 'audio/mpeg');
    fs.unlinkSync(tmpMp3);

    pageData.push({
      text: storyData.pages[i],
      audioUrl,
      illustrationUrl: null,
      durationMs: endMs - startMs,
      timings: [],
      subtitles: '',
    });
  }
  fs.rmdirSync(tmpDir);

  const youtubeId = YOUTUBE_IDS[title];
  const youtubeUrl = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null;
  const spotifyId = SPOTIFY_IDS[title];
  const spotifyUrl = spotifyId ? `https://open.spotify.com/episode/${spotifyId}` : null;

  await storiesRef.doc(storyId).set({
    title,
    storyKind: 'night',
    isPrebuilt: true,
    narrationMode: 'precomputed',
    supportsHighlighting: false,
    illustrationUrl: null,
    youtubeUrl: youtubeUrl || null,
    spotifyUrl: spotifyUrl || null,
    pages: pageData,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`  ✅ Saved ${storyId} — ${pageData.length} pages, YouTube: ${youtubeUrl ?? 'none'}, Spotify: ${spotifyUrl ?? 'pending'}`);
  runTests(storyId, title);
}

// ── Init Firebase ─────────────────────────────────────────────────────────────

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const credential = fs.existsSync(serviceAccountPath)
  ? admin.credential.cert(serviceAccountPath)
  : admin.credential.applicationDefault();

if (!admin.apps.length) {
  admin.initializeApp({ credential, storageBucket: STORAGE_BUCKET, projectId: FIREBASE_PROJECT });
}
const db = getFirestore(admin.app(), FIRESTORE_DB);
const bucket = admin.storage().bucket(STORAGE_BUCKET);

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cmd = args[0] || 'list';
const force = args.includes('--force');
const filterTitle = args.find(a => !a.startsWith('--') && a !== 'seed' && a !== 'list');

// Build folder list — scan both new story structure and legacy ~/youtube
const folders = [];
const folderToPath = {}; // folder name → full youtube path

// New structure: exports/stories/<SafeTitle>_MMDDYYYY/youtube/<SafeTitle>/
// Also scan exports/stories/_published/ for completed stories
const storySearchDirs = [STORIES_BASE_DIR];
const publishedDir = path.join(STORIES_BASE_DIR, '_published');
if (fs.existsSync(publishedDir)) storySearchDirs.push(publishedDir);

for (const searchDir of storySearchDirs) {
  if (!fs.existsSync(searchDir)) continue;
  for (const dir of fs.readdirSync(searchDir)) {
    if (dir.startsWith('_') || dir.startsWith('.')) continue;
    const storyRoot = path.join(searchDir, dir);
    if (!fs.statSync(storyRoot).isDirectory()) continue;
    const ytDir = path.join(storyRoot, 'youtube');
    if (!fs.existsSync(ytDir)) continue;
    for (const sub of fs.readdirSync(ytDir)) {
      if (fs.statSync(path.join(ytDir, sub)).isDirectory()) {
        if (!FOLDER_TO_TITLE[sub]) {
          FOLDER_TO_TITLE[sub] = sub.replace(/_/g, ' ');
        }
        if (FOLDER_TO_TITLE[sub]) {
          folders.push(sub);
          folderToPath[sub] = path.join(ytDir, sub);
        }
      }
    }
  }
}

// Legacy: ~/youtube/<folder>/
if (YOUTUBE_DIR !== STORIES_BASE_DIR && fs.existsSync(YOUTUBE_DIR)) {
  for (const f of fs.readdirSync(YOUTUBE_DIR)) {
    if (fs.statSync(path.join(YOUTUBE_DIR, f)).isDirectory() && FOLDER_TO_TITLE[f] && !folders.includes(f)) {
      folders.push(f);
      folderToPath[f] = path.join(YOUTUBE_DIR, f);
    }
  }
}

if (cmd === 'list' || cmd !== 'seed') {
  console.log('\n📚 Bednight stories available to seed:\n');
  for (const folder of folders) {
    const title = FOLDER_TO_TITLE[folder];
    const ytId = YOUTUBE_IDS[title];
    const spId = SPOTIFY_IDS[title];
    console.log(`  ${folder}`);
    console.log(`    Title:   ${title}`);
    console.log(`    YouTube: ${ytId ? `https://youtu.be/${ytId}` : '❌ missing'}`);
    console.log(`    Spotify: ${spId ? `https://open.spotify.com/episode/${spId}` : '⏳ pending'}`);
    const podcastMatch = PODCAST_STORIES.find(s => s.title === title);
    console.log(`    Pages:   ${podcastMatch ? podcastMatch.pages.length : '❌ not in podcastStoryConstants'}`);
    console.log('');
  }
  console.log(`Run: node content/podcast/seedBednightStories.mjs seed`);
  process.exit(0);
}

// Seed
const toSeed = filterTitle
  ? folders.filter(f => FOLDER_TO_TITLE[f]?.toLowerCase().includes(filterTitle.toLowerCase()))
  : folders;

if (!toSeed.length) {
  console.error(`No matching stories found for: ${filterTitle}`);
  process.exit(1);
}

// Spotify-only stories
const spotifyOnlyToSeed = filterTitle
  ? SPOTIFY_ONLY_TITLES.filter(t => t.toLowerCase().includes(filterTitle.toLowerCase()))
  : SPOTIFY_ONLY_TITLES;

console.log(`\n🌙 Seeding ${toSeed.length} youtube stories + ${spotifyOnlyToSeed.length} spotify-only stories...`);
for (const folder of toSeed) {
  await seedStory(folder, db, bucket, force, folderToPath[folder]);
}
for (const title of spotifyOnlyToSeed) {
  await seedSpotifyOnlyStory(title, db, bucket, force);
}
console.log('\n✅ Done!');
