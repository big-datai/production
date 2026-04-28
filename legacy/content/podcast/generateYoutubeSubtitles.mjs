#!/usr/bin/env node

/**
 * Generate .srt subtitle files for YouTube videos from story text + MP3 audio.
 *
 * Uses the same silence-detection approach as generateYoutubeVideos.mjs to find
 * page boundaries, then splits each page's text into subtitle chunks (~12 words)
 * evenly distributed across the page's time segment.
 *
 * Output:
 *   exports/youtube/<story_name>.srt
 *
 * Usage:
 *   node content/podcast/generateYoutubeSubtitles.mjs              # all stories
 *   node content/podcast/generateYoutubeSubtitles.mjs 1             # story #1 only
 *   node content/podcast/generateYoutubeSubtitles.mjs 1-3           # stories 1–3
 *   node content/podcast/generateYoutubeSubtitles.mjs "Aladdin"     # by title match
 *   node content/podcast/generateYoutubeSubtitles.mjs --force       # overwrite existing
 */

import { execSync } from "child_process";
import fs from "node:fs";
import path from "node:path";
import { PODCAST_STORIES, PODCAST_INTRO, PODCAST_OUTRO } from "./podcastStoryConstants.js";

// ── Config ──
const STORIES_DIR = "exports/stories";
const LEGACY_MP3_DIR = "exports/spotify";
const LEGACY_OUTPUT_DIR = "exports/youtube";
const WORDS_PER_SUBTITLE = 12; // ~12 words per subtitle block — readable for kids

// ── CLI args ──
const args = process.argv.slice(2);
const forceFlag = args.includes("--force");
const selectionArg = args.find((a) => !a.startsWith("--"));

fs.mkdirSync(LEGACY_OUTPUT_DIR, { recursive: true });

// ── Helpers ──
const safeTitle = (title) =>
  title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");

/** Find story-specific export folder: exports/stories/<SafeTitle>_MMDDYYYY/ */
function findStoryDir(title) {
  const safe = safeTitle(title);
  if (!fs.existsSync(STORIES_DIR)) return null;
  const matches = fs.readdirSync(STORIES_DIR)
    .filter(d => d.startsWith(safe + "_"))
    .sort().reverse();
  return matches.length > 0 ? path.join(STORIES_DIR, matches[0]) : null;
}

/** Find MP3 for a story — checks story-specific folder first, then legacy */
function findMp3(title) {
  const safe = safeTitle(title);
  const storyDir = findStoryDir(title);
  if (storyDir) {
    const storyMp3 = path.join(storyDir, "spotify", `${safe}.mp3`);
    if (fs.existsSync(storyMp3)) return storyMp3;
  }
  const legacyMp3 = path.join(LEGACY_MP3_DIR, `${safe}.mp3`);
  if (fs.existsSync(legacyMp3)) return legacyMp3;
  return null;
}

/** Get output SRT path — writes to story-specific folder, also copies to legacy */
function getSrtOutputPath(title) {
  const safe = safeTitle(title);
  const storyDir = findStoryDir(title);
  if (storyDir) {
    const youtubeDir = path.join(storyDir, "youtube", safe);
    fs.mkdirSync(youtubeDir, { recursive: true });
    return path.join(youtubeDir, `${safe}.srt`);
  }
  return path.join(LEGACY_OUTPUT_DIR, `${safe}.srt`);
}

const getAudioDuration = (filePath) =>
  parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim()
  );

/** Format seconds to SRT timestamp: HH:MM:SS,mmm */
function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/** Split text into chunks of ~N words */
function splitIntoChunks(text, wordsPerChunk) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(" "));
  }
  return chunks;
}

// ── Story selection (same logic as generateYoutubeVideos.mjs) ──
function selectStories() {
  if (!selectionArg) return PODCAST_STORIES.map((s, i) => ({ ...s, index: i }));

  const rangeMatch = selectionArg.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const s = Number(rangeMatch[1]);
    const e = Number(rangeMatch[2]);
    return PODCAST_STORIES.slice(s - 1, Math.min(e, PODCAST_STORIES.length)).map(
      (st, i) => ({ ...st, index: s - 1 + i })
    );
  }

  const n = Number(selectionArg);
  if (!Number.isNaN(n) && n >= 1 && n <= PODCAST_STORIES.length) {
    return [{ ...PODCAST_STORIES[n - 1], index: n - 1 }];
  }

  const needle = selectionArg.toLowerCase();
  const idx = PODCAST_STORIES.findIndex((s) => s.title.toLowerCase().includes(needle));
  if (idx >= 0) return [{ ...PODCAST_STORIES[idx], index: idx }];

  console.error(`❌ No story matching "${selectionArg}"`);
  process.exit(1);
}

// ── Silence detection (identical to generateYoutubeVideos.mjs) ──
function detectPageBoundaries(mp3Path) {
  const totalDuration = getAudioDuration(mp3Path);

  const output = execSync(
    `ffmpeg -i "${path.resolve(mp3Path)}" -af silencedetect=noise=-30dB:d=1.5 -f null - 2>&1`,
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120000 }
  );

  const silences = [];
  const lines = output.split("\n");
  let currentStart = null;
  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);
    if (startMatch) currentStart = parseFloat(startMatch[1]);
    if (endMatch && currentStart !== null) {
      silences.push({ start: currentStart, end: parseFloat(endMatch[1]) });
      currentStart = null;
    }
  }

  // Segment boundaries: midpoint of each silence gap
  // Segments: [0..mid1] = intro, [mid1..mid2] = page1, ..., [midN..end] = outro
  const boundaries = [0];
  for (const s of silences) {
    boundaries.push((s.start + s.end) / 2);
  }
  boundaries.push(totalDuration);

  // Return segments as { start, end } pairs
  const segments = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    segments.push({ start: boundaries[i], end: boundaries[i + 1] });
  }

  return { segments, totalDuration };
}

// ── Build SRT content for a story ──
function buildSrt(story, segments) {
  // Text segments: [intro, page1, page2, ..., pageN, outro]
  const textSegments = [PODCAST_INTRO, ...story.pages, PODCAST_OUTRO];

  // If segment count doesn't match text count, distribute proportionally
  const expectedSegments = textSegments.length;
  const actualSegments = segments.length;

  if (actualSegments !== expectedSegments) {
    console.log(
      `   ⚠️ Segment mismatch: ${actualSegments} audio segments vs ${expectedSegments} text segments`
    );
    // If we have fewer audio segments, merge trailing text into last segments
    // If we have more audio segments, ignore trailing ones
  }

  const srtEntries = [];
  let subtitleIndex = 1;

  const segCount = Math.min(actualSegments, expectedSegments);

  for (let i = 0; i < segCount; i++) {
    const text = textSegments[i];
    const seg = segments[i];
    const segDuration = seg.end - seg.start;

    // Split page text into subtitle chunks
    const chunks = splitIntoChunks(text, WORDS_PER_SUBTITLE);
    if (chunks.length === 0) continue;

    // Distribute chunks evenly across the segment duration
    const chunkDuration = segDuration / chunks.length;

    for (let j = 0; j < chunks.length; j++) {
      const chunkStart = seg.start + j * chunkDuration;
      const chunkEnd = Math.min(seg.start + (j + 1) * chunkDuration, seg.end);

      // Split long chunks into 2 lines for readability
      const words = chunks[j].split(" ");
      let line;
      if (words.length > 7) {
        const mid = Math.ceil(words.length / 2);
        line = words.slice(0, mid).join(" ") + "\n" + words.slice(mid).join(" ");
      } else {
        line = chunks[j];
      }

      srtEntries.push(
        `${subtitleIndex}\n${formatSrtTime(chunkStart)} --> ${formatSrtTime(chunkEnd)}\n${line}\n`
      );
      subtitleIndex++;
    }
  }

  return srtEntries.join("\n");
}

// ── Main ──
async function main() {
  const stories = selectStories();
  console.log(`\n🎬 Generating subtitles for ${stories.length} story(ies)\n`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const story of stories) {
    const name = safeTitle(story.title);
    const mp3Path = findMp3(story.title);
    const srtPath = getSrtOutputPath(story.title);
    const legacySrtPath = path.join(LEGACY_OUTPUT_DIR, `${name}.srt`);

    console.log(`📖 ${story.index + 1}. ${story.title}`);

    // Check MP3 exists
    if (!mp3Path) {
      console.log(`   ❌ MP3 not found in story dir or ${LEGACY_MP3_DIR}`);
      failed++;
      continue;
    }

    // Skip if SRT exists and not forcing
    if (fs.existsSync(srtPath) && !forceFlag) {
      console.log(`   💾 SRT exists (use --force to overwrite)`);
      skipped++;
      continue;
    }

    try {
      // Detect page boundaries from audio
      console.log("   🔍 Detecting page boundaries from audio...");
      const { segments, totalDuration } = detectPageBoundaries(mp3Path);
      console.log(
        `   📊 ${segments.length} segments detected, total: ${Math.round(totalDuration)}s`
      );

      // Build SRT
      const srtContent = buildSrt(story, segments);
      fs.writeFileSync(srtPath, srtContent, "utf8");

      // Also write to legacy location for compatibility
      if (srtPath !== legacySrtPath) {
        fs.mkdirSync(path.dirname(legacySrtPath), { recursive: true });
        fs.writeFileSync(legacySrtPath, srtContent, "utf8");
      }

      const lineCount = srtContent.split("\n").filter((l) => l.match(/^\d+$/)).length;
      console.log(`   ✅ ${srtPath} (${lineCount} subtitles)`);
      success++;
    } catch (err) {
      console.error(`   ❌ Failed: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n═══ Summary ═══`);
  console.log(`✅ ${success} generated | 💾 ${skipped} skipped | ❌ ${failed} failed\n`);
}

main();
