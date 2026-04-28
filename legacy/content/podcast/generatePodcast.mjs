#!/usr/bin/env node
/**
 * Generate Spotify-ready podcast MP3s for GoReadling Bedtime Stories.
 *
 * Pipeline: Story text → page-by-page TTS → concatenate PCM → WAV → ffmpeg mix + convert → MP3
 *
 * Usage:
 *   node scripts/generateSpotifyPodcast.mjs              # generate all episodes
 *   node scripts/generateSpotifyPodcast.mjs list          # list all stories
 *   node scripts/generateSpotifyPodcast.mjs 1             # generate story #1 only
 *   node scripts/generateSpotifyPodcast.mjs 1-3           # generate stories #1 through #3
 *   node scripts/generateSpotifyPodcast.mjs "Aladdin"     # generate by title match (partial)
 *
 * Prerequisites:
 *   - ffmpeg installed:  brew install ffmpeg
 *   - GEMINI_API_KEY in .env.local (or GEMINI_API_KEY_2, _3, _4 for rotation)
 *
 * Output:
 *   exports/spotify/{title}.mp3 — Spotify-ready MP3 (192 kbps, 44.1 kHz stereo)
 *   exports/spotify/{title}.wav — intermediate narration WAV (auto-cleaned unless --keep-wav)
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { execSync, execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { PODCAST_STORIES, PODCAST_INTRO, PODCAST_OUTRO } from "./podcastStoryConstants.js";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

// ── Config ──
const SAMPLE_RATE = 24000;       // Gemini TTS output: 24 kHz mono 16-bit PCM
const DELAY_BETWEEN_PAGES_MS = 3000;
const PAUSE_SECONDS = 2;         // silence between pages
const MUSIC_VOLUME = 0.04;       // background music level (very quiet)
const OUTPUT_BITRATE = "192k";
const OUTPUT_SAMPLE_RATE = 44100;
const EXPORTS_DIR = process.env.STORY_SPOTIFY_DIR || path.resolve(process.cwd(), "exports", "spotify");
const CHARACTERS_FILE = path.resolve(process.cwd(), 'assets', 'characters', 'recurringCharacters.json');

// ── Multi-voice: load voice assignments for a story ──
function loadVoiceAssignments(storyTitle) {
  const voiceMap = new Map(); // characterName -> voiceName
  try {
    if (!fs.existsSync(CHARACTERS_FILE)) return voiceMap;
    const registry = JSON.parse(fs.readFileSync(CHARACTERS_FILE, 'utf8'));

    // Add recurring character voices
    for (const rc of (registry.characters || [])) {
      voiceMap.set(rc.name.toLowerCase(), rc.voice || 'Zephyr');
    }

    // Load story's character_desc.json for non-recurring character fallback voices
    const safeTitle = storyTitle.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
    const searchDirs = [
      path.resolve(process.cwd(), 'exports', 'youtube', safeTitle),
    ];
    // Also check exports/stories/*/youtube/*
    const storiesDir = path.resolve(process.cwd(), 'exports', 'stories');
    if (fs.existsSync(storiesDir)) {
      for (const d of fs.readdirSync(storiesDir)) {
        if (d.startsWith(safeTitle)) {
          const ytDir = path.join(storiesDir, d, 'youtube', safeTitle);
          searchDirs.push(ytDir);
        }
      }
    }

    for (const dir of searchDirs) {
      const descPath = path.join(dir, 'character_desc.json');
      if (fs.existsSync(descPath)) {
        const charDesc = JSON.parse(fs.readFileSync(descPath, 'utf8'));
        if (Array.isArray(charDesc)) {
          const fallbacks = registry.voiceAssignments || {};
          for (const c of charDesc) {
            if (voiceMap.has(c.name.toLowerCase())) continue; // recurring already set
            const species = (c.species || '').toLowerCase();
            const age = (c.age || '').toLowerCase();
            // Categorize character by species/age/gender
            const isElder = /\belderly\b|\baged\b|\bancient\b|\bgrandfather\b|\bgrandmother\b|(?<!year-)\bold\s+(man|woman|lady|gentleman|toad|mole|mouse)\b|\b(60|70|80|90|100|centur)/i.test(age)
              || /\belderly\b|\bancient\b/i.test(species);
            const isAnimal = /bear|wolf|fox|dog|cat|hen|duck|pig|rabbit|mouse|frog|horse|donkey|bird|owl|crow|toad|mole|swallow|beetle|hare|tortoise|lion|monkey|bee|rooster|squirrel|gopher|kangaroo|goose/i.test(species);
            const isFemale = /\bgirl\b|\bwoman\b|\bqueen\b|\bprincess\b|\bmother\b|\bsister\b|\bdaughter\b|\bfairy\b|\bwitch\b|\blady\b|\bdame\b/i.test(age + ' ' + species);

            // Pick voice pool and rotate (least-used voice in the pool)
            let pool;
            if (isElder) pool = ['Charon', 'Puck'];
            else if (isAnimal) pool = ['Fenrir', 'Puck'];
            else if (isFemale) pool = ['Kore', 'Aoede'];
            else pool = ['Puck', 'Charon', 'Fenrir'];

            // Count current usage of each voice in pool
            const usedVoices = [...voiceMap.values()];
            let bestVoice = pool[0];
            let bestCount = Infinity;
            for (const v of pool) {
              const count = usedVoices.filter(u => u === v).length;
              if (count < bestCount) { bestCount = count; bestVoice = v; }
            }
            voiceMap.set(c.name.toLowerCase(), bestVoice);
          }
        }
        break;
      }
    }
  } catch (e) {
    console.log(`   ⚠️ Voice assignment loading failed (non-fatal): ${e.message}`);
  }
  return voiceMap;
}

// Voice pools by character traits (from character_desc.json fields)
const VOICE_POOLS = {
  female: ['Kore', 'Aoede'],
  male: ['Puck', 'Fenrir', 'Charon'],
  elder: ['Charon'],
  child: ['Puck', 'Fenrir'],
  animal: ['Fenrir'],
};

/**
 * Pre-scan all pages and verify every speaker has a voice assigned.
 * Voices come from: recurring characters + character_desc.json (species/age/gender).
 * If a speaker has NO voice after loadVoiceAssignments(), it means character_desc.json
 * is missing or incomplete — WARN loudly so the user knows to run --chars-only first.
 */
async function assignAllVoicesAsync(pages, voiceMap) {
  const { pageToSegments } = await import('./pageUtils.mjs');

  // 1. Collect all unique speakers from story pages
  const speakers = new Set();
  for (const page of pages) {
    for (const seg of pageToSegments(page)) {
      if (seg.speaker.toLowerCase() !== 'narrator') {
        speakers.add(seg.speaker);
      }
    }
  }

  // 2. Check for unassigned speakers
  const unassigned = [];
  for (const name of speakers) {
    if (!voiceMap.has(name.toLowerCase())) {
      unassigned.push(name);
    }
  }

  if (unassigned.length > 0) {
    console.log(`   ⚠️  ${unassigned.length} character(s) have NO voice assignment:`);
    for (const name of unassigned) {
      console.log(`      ❌ ${name} → fallback "Zephyr" (all will sound the same!)`);
      voiceMap.set(name.toLowerCase(), 'Zephyr');
    }
    console.log(`   ⚠️  Run generateYoutubeVideos.mjs --chars-only FIRST to create character_desc.json`);
    console.log(`   ⚠️  character_desc.json provides species/age/gender for proper voice assignment`);
  }

  // 3. Log the full voice map
  console.log(`   🎭 Voice assignments (${voiceMap.size} characters):`);
  const byVoice = {};
  for (const [char, voice] of voiceMap) {
    if (!byVoice[voice]) byVoice[voice] = [];
    byVoice[voice].push(char);
  }
  for (const [voice, chars] of Object.entries(byVoice).sort()) {
    console.log(`      ${voice}: ${chars.join(', ')}`);
  }
}

/** Get voice for a character (must call assignAllVoicesAsync first) */
function getVoice(name, voiceMap) {
  return voiceMap.get(name.toLowerCase()) || 'Zephyr';
}

// ── Split page text into narrator + dialogue segments ──
function splitPageIntoSegments(pageText, voiceMap, narratorVoice = 'Zephyr') {
  try {
    if (!voiceMap || voiceMap.size === 0) return [{ text: pageText, voice: narratorVoice, character: 'narrator' }];

    const segments = [];
    let remaining = pageText;
    const speechVerbs = 'said|whispered|shouted|exclaimed|cried|called|asked|replied|answered|muttered|murmured|declared|announced|begged|pleaded|sighed|laughed|giggled|chuckled|grumbled|growled|roared|squeaked|chirped|clucked|barked|squealed|sang|yelled|screamed|breathed|added|continued|began|spoke|gasped';

    // Opening quote: must be preceded by space/punctuation (not a letter — avoids "Finn's" false positive)
    // Closing quote after content: for straight ', must NOT be followed by a lowercase letter (avoids "isn't" false positive)
    // Use curly quotes preferably; for straight ' use lookahead/lookbehind
    const QO = `(?<![a-zA-Z])[\\u2018\\u201C"']`; // opening quote (not after letter)
    const QC = `[\\u2019\\u201D"]|'(?![a-z])`;     // closing quote (curly, or straight not before lowercase)
    const INNER = `[^\\u2018\\u2019\\u201C\\u201D"]{2,300}?`; // no nested quotes, 2-300 chars, lazy

    // Pattern A: 'dialogue' verb CharName  →  'Hello!' said Luna
    const patternA = new RegExp(`(${QO})(${INNER})(${QC})\\s*,?\\s*(?:${speechVerbs})\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})`, 'g');
    // Pattern B: CharName verb, 'dialogue'  →  Luna said, 'Hello!'
    const patternB = new RegExp(`([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})\\s+(?:${speechVerbs})\\s*,?\\s*(${QO})(${INNER})(${QC})`, 'g');
    // Pattern C: 'dialogue' CharName verb  →  'Hello!' Tommy exclaimed
    const patternC = new RegExp(`(${QO})(${INNER})(${QC})\\s*,?\\s*([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})\\s+(?:${speechVerbs})`, 'g');

    // Collect all dialogue matches with positions
    const matches = [];
    let m;

    const addMatch = (m, charIdx, dialogueIdx) => {
      const charName = m[charIdx];
      if (voiceMap.has(charName.toLowerCase())) {
        const overlaps = matches.some(prev => m.index < prev.end && m.index + m[0].length > prev.start);
        if (!overlaps) {
          matches.push({ start: m.index, end: m.index + m[0].length, dialogue: m[dialogueIdx], character: charName });
        }
      }
    };

    // Group indices:
    // patternA: (QO)(INNER)(QC) verb (Name) → charIdx=4, dialogueIdx=2
    // patternB: (Name) verb (QO)(INNER)(QC) → charIdx=1, dialogueIdx=3
    // patternC: (QO)(INNER)(QC) (Name) verb → charIdx=4, dialogueIdx=2
    while ((m = patternA.exec(pageText)) !== null) addMatch(m, 4, 2);
    while ((m = patternB.exec(pageText)) !== null) addMatch(m, 1, 3);
    while ((m = patternC.exec(pageText)) !== null) addMatch(m, 4, 2);

    if (matches.length === 0) return [{ text: pageText, voice: narratorVoice, character: 'narrator' }];

    // Sort by position
    matches.sort((a, b) => a.start - b.start);

    // Build segments: narration between dialogues, dialogue with character voice
    let pos = 0;
    for (const match of matches) {
      // Narration before this dialogue
      if (match.start > pos) {
        const narration = pageText.slice(pos, match.start).trim();
        if (narration) segments.push({ text: narration, voice: narratorVoice, character: 'narrator' });
      }
      // The full dialogue segment (including "said X") read by the character voice
      const voice = getVoice(match.character, voiceMap);
      segments.push({ text: match.dialogue, voice, character: match.character });
      pos = match.end;
    }
    // Remaining narration
    if (pos < pageText.length) {
      const tail = pageText.slice(pos).trim();
      if (tail) segments.push({ text: tail, voice: narratorVoice, character: 'narrator' });
    }

    return segments.length > 0 ? segments : [{ text: pageText, voice: narratorVoice, character: 'narrator' }];
  } catch {
    return [{ text: pageText, voice: narratorVoice, character: 'narrator' }];
  }
}

const args = process.argv.slice(2);
const keepWav = args.includes("--keep-wav");
const keyArgIdx = args.indexOf("--key");
const forcedKeyIndex = keyArgIdx !== -1 ? Number(args[keyArgIdx + 1]) - 1 : -1; // 0-based
const langArgIdx = args.indexOf("--lang");
const langCode = langArgIdx !== -1 ? args[langArgIdx + 1] : "en";
const selectionArg = args.find((a) => !a.startsWith("--") && (keyArgIdx === -1 || a !== args[keyArgIdx + 1]) && (langArgIdx === -1 || a !== args[langArgIdx + 1]));

// ── Preflight checks ──
const checkFfmpeg = () => {
  try {
    execSync("/usr/local/bin/ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    try {
      execSync("ffmpeg -version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
};

// ── API Key rotation ──
const getEnvValue = (...keys) => keys.map((k) => process.env[k]).find(Boolean);

const API_KEYS = [
  process.env.GEMINI_API_KEY_5,
  getEnvValue("GEMINI_API_KEY", "API_KEY", "VITE_GEMINI_API_KEY"),
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_6,
].filter(Boolean);

if (!API_KEYS.length) {
  console.error("❌ No Gemini API key found. Set GEMINI_API_KEY in .env.local");
  process.exit(1);
}
console.log(`🔑 ${API_KEYS.length} API key(s) available`);

// If --key N is passed, use ONLY that key (no rotation)
let activeKeyIndex = forcedKeyIndex >= 0 ? forcedKeyIndex : 0;
if (forcedKeyIndex >= 0) {
  console.log(`🔒 Using dedicated key ${forcedKeyIndex + 1}/${API_KEYS.length} (no rotation)`);
}
let geminiClient;
const ai = () => {
  if (!geminiClient) geminiClient = new GoogleGenAI({ apiKey: API_KEYS[activeKeyIndex] });
  return geminiClient;
};

const rotateApiKey = () => {
  if (forcedKeyIndex >= 0) return false; // dedicated key mode — no rotation
  if (activeKeyIndex + 1 < API_KEYS.length) {
    activeKeyIndex++;
    geminiClient = new GoogleGenAI({ apiKey: API_KEYS[activeKeyIndex] });
    console.log(`    🔄 Rotated to API key ${activeKeyIndex + 1}/${API_KEYS.length}`);
    return true;
  }
  return false;
};

// ── TTS ──
// --pro flag uses Pro TTS model (separate RPM quota from Flash)
// This allows running Flash + Pro in parallel for 2x throughput
const usePro = args.includes("--pro");
const TTS_MODEL = usePro ? "gemini-2.5-pro-preview-tts" : "gemini-2.5-flash-preview-tts";
const MAX_RETRIES = 3;     // fail fast — segments are cached, just rerun the script
const BACKOFF_MS = 60000;  // 60s wait on quota hit before retrying

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const generateSpeech = async (text, voiceName = "Zephyr") => {
  // Prefix with "Read aloud:" to prevent TTS model from interpreting text as instructions
  const ttsText = langCode !== "en" ? `Read aloud the following text naturally:\n${text}` : text;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: ttsText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });
      const inline = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!inline?.inlineData?.data) throw new Error("No audio data from Gemini TTS");
      return Buffer.from(inline.inlineData.data, "base64");
    } catch (e) {
      const is429 =
        e.message?.includes("429") ||
        e.message?.includes("RESOURCE_EXHAUSTED") ||
        e.status === 429;
      const is500 =
        e.message?.includes("500") ||
        e.message?.includes("INTERNAL") ||
        e.status === 500;
      if (is429 || is500) {
        if (rotateApiKey()) {
          console.log(`    ⚠️ ${is429 ? 'Quota hit' : 'Server error'}, rotated to next key (attempt ${attempt + 1}/${MAX_RETRIES})`);
          continue;
        }
        // Dedicated key or all keys exhausted — wait and retry
        const waitMs = is500 ? 10000 : BACKOFF_MS; // 10s for 500, 60s for 429
        console.log(`    ⏳ ${is429 ? 'Quota-limited' : 'Server error'}, waiting ${waitMs/1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        if (forcedKeyIndex < 0) {
          activeKeyIndex = 0;
          geminiClient = new GoogleGenAI({ apiKey: API_KEYS[activeKeyIndex] });
        }
        await sleep(waitMs);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`TTS failed after ${MAX_RETRIES} attempts`);
};

// ── WAV helpers ──
const createWavHeader = (dataLength) => {
  const header = Buffer.alloc(44);
  const byteRate = SAMPLE_RATE * 1 * 2; // mono, 16-bit
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);        // PCM chunk size
  header.writeUInt16LE(1, 20);         // PCM format
  header.writeUInt16LE(1, 22);         // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);         // block align
  header.writeUInt16LE(16, 34);        // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
};

const createSilence = (seconds) => {
  const numSamples = Math.round(SAMPLE_RATE * seconds);
  return Buffer.alloc(numSamples * 2); // 16-bit = 2 bytes per sample, all zeros = silence
};

const pcmDurationSec = (buf) => buf.byteLength / 2 / SAMPLE_RATE;

// ── Story selection ──
const listStories = () => {
  console.log(`\n🎙️  Available podcast stories (${PODCAST_STORIES.length} total):\n`);
  PODCAST_STORIES.forEach((s, i) => {
    const wordCount = s.pages.reduce((sum, p) => {
      if (Array.isArray(p)) return sum + p.reduce((s2, seg) => s2 + (Object.values(seg)[0] || '').split(/\s+/).length, 0);
      return sum + p.split(/\s+/).length;
    }, 0);
    const estMin = Math.round(wordCount / 130); // calm TTS ~130 wpm
    console.log(`  ${String(i + 1).padStart(2)}. ${s.title} (${s.pages.length} pages, ~${wordCount} words, ~${estMin} min)`);
  });
  console.log(`\nUsage: node scripts/generateSpotifyPodcast.mjs [1-3 | "title" | all]\n`);
  process.exit(0);
};

const selectStories = () => {
  if (!selectionArg) return [...PODCAST_STORIES];
  if (selectionArg === "list") listStories();
  if (selectionArg === "all") return [...PODCAST_STORIES];

  // Range: "2-4"
  const rangeMatch = selectionArg.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const s = Number(rangeMatch[1]);
    const e = Number(rangeMatch[2]);
    if (s < 1 || e < s) throw new Error(`Invalid range "${selectionArg}"`);
    return PODCAST_STORIES.slice(s - 1, Math.min(e, PODCAST_STORIES.length));
  }

  // Single number
  const n = Number(selectionArg);
  if (!Number.isNaN(n) && n >= 1 && n <= PODCAST_STORIES.length) {
    return [PODCAST_STORIES[n - 1]];
  }

  // Title search (partial, case-insensitive)
  const needle = selectionArg.toLowerCase();
  const match = PODCAST_STORIES.find((s) => s.title.toLowerCase().includes(needle));
  if (match) return [match];

  throw new Error(`No story matching "${selectionArg}". Use "list" to see all.`);
};

// ── ffmpeg commands ──
const generateAmbientMusic = (durationSec, outputPath) => {
  // Generate soft ambient lullaby using sine waves at calming frequencies
  // 174 Hz (low hum), 261 Hz (middle C), 396 Hz (gentle tone)
  const args = [
    "-y",
    "-f", "lavfi", "-i", `sine=frequency=174:sample_rate=${OUTPUT_SAMPLE_RATE}:duration=${Math.ceil(durationSec)}`,
    "-f", "lavfi", "-i", `sine=frequency=261:sample_rate=${OUTPUT_SAMPLE_RATE}:duration=${Math.ceil(durationSec)}`,
    "-f", "lavfi", "-i", `sine=frequency=396:sample_rate=${OUTPUT_SAMPLE_RATE}:duration=${Math.ceil(durationSec)}`,
    "-filter_complex",
    `[0]volume=0.012[s1];[1]volume=0.008[s2];[2]volume=0.005[s3];` +
    `[s1][s2][s3]amix=inputs=3:normalize=0[mixed];` +
    `[mixed]lowpass=f=400,afade=t=in:d=5,afade=t=out:st=${Math.max(0, durationSec - 8)}:d=8[out]`,
    "-map", "[out]",
    "-ar", String(OUTPUT_SAMPLE_RATE),
    "-ac", "1",
    outputPath,
  ];
  execFileSync("/usr/local/bin/ffmpeg", args, { stdio: "pipe" });
};

const mixAndConvertToMp3 = (narrationWav, ambientWav, outputMp3, metadata) => {
  const { title, artist, album, year } = metadata;
  const args = [
    "-y",
    "-i", narrationWav,
    "-i", ambientWav,
    "-filter_complex",
    `[0]aresample=${OUTPUT_SAMPLE_RATE}[voice];` +
    `[1]volume=${MUSIC_VOLUME}[bg];` +
    `[voice][bg]amix=inputs=2:duration=first:weights=1 0.3[out]`,
    "-map", "[out]",
    "-ar", String(OUTPUT_SAMPLE_RATE),
    "-ac", "2",   // stereo for Spotify
    "-b:a", OUTPUT_BITRATE,
    "-id3v2_version", "3",
    "-metadata", `title=${title}`,
    "-metadata", `artist=${artist}`,
    "-metadata", `album=${album}`,
    "-metadata", `date=${year}`,
    "-metadata", `genre=Kids & Family`,
    "-metadata", `comment=Presented by GoReadling.com - Personalized education and reading skills for kids`,
    outputMp3,
  ];
  execFileSync("/usr/local/bin/ffmpeg", args, { stdio: "pipe" });
};

// ── Main pipeline ──
const generateEpisode = async (story, index, total) => {
  let { title, pages, narratorVoice } = story;
  const narVoice = narratorVoice || 'Zephyr';
  const safeTitle = title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");

  // Multilingual: load translated text and adjust output paths
  let outputDir = EXPORTS_DIR;
  if (langCode !== "en") {
    // Find the story's _published dir and load translated text
    const pubDir = path.resolve("exports/stories/_published");
    const storyMatch = fs.existsSync(pubDir) && fs.readdirSync(pubDir).find(d => d.startsWith(safeTitle + "_"));
    if (storyMatch) {
      const langDir = path.join(pubDir, storyMatch, langCode);
      const transFile = path.join(langDir, "text", `story_${langCode}.json`);
      if (fs.existsSync(transFile)) {
        const trans = JSON.parse(fs.readFileSync(transFile, "utf8"));
        pages = trans.pages;
        // Store translated intro/outro for use in TTS (instead of English PODCAST_INTRO/OUTRO)
        story._translatedIntro = trans.intro;
        story._translatedOutro = trans.outro;
        story._translatedTitle = trans.titleTranslated;
        console.log(`   🌍 Using ${langCode} translation (${pages.length} pages)`);
      } else {
        console.log(`   ❌ No ${langCode} translation found: ${transFile}`);
        console.log(`   💡 Run: node content/podcast/translateStory.mjs "${title}" --lang ${langCode}`);
        return null;
      }
      // Output to language subdir
      outputDir = path.join(langDir, "spotify");
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  const mp3Path = path.join(outputDir, `${safeTitle}${langCode !== "en" ? "_" + langCode : ""}.mp3`);
  const wavPath = path.join(outputDir, `${safeTitle}_narration.wav`);
  const ambientPath = path.join(outputDir, `${safeTitle}_ambient.wav`);

  console.log(`\n🎙️  [${index}/${total}] Generating: ${title}`);
  console.log(`   📝 ${pages.length} pages`);

  // Page-level cache dir for resume support (saves TTS quota)
  const cacheSuffix = langCode !== "en" ? `_${langCode}` : "";
  const cacheDir = path.join(outputDir, `_cache_${safeTitle}${cacheSuffix}`);

  // Check if narration WAV already exists (fully done)
  let totalDurationSec;
  if (fs.existsSync(wavPath)) {
    const wavStats = fs.statSync(wavPath);
    const pcmBytes = wavStats.size - 44;
    totalDurationSec = pcmBytes / (SAMPLE_RATE * 2);
    console.log(`   ⏩ Narration WAV exists: ${(totalDurationSec / 60).toFixed(1)} min (${(wavStats.size / 1024 / 1024).toFixed(1)} MB) — skipping TTS`);
  } else {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const allPcmBuffers = [];
    const silenceBetweenPages = createSilence(PAUSE_SECONDS);

    // Helper: generate or load cached PCM for a segment
    const getSegmentPcm = async (segmentName, text, voiceName = "Zephyr") => {
      const cachePath = path.join(cacheDir, `${segmentName}.pcm`);
      if (fs.existsSync(cachePath)) {
        const cached = fs.readFileSync(cachePath);
        console.log(`      💾 Cached ${segmentName}: ${pcmDurationSec(cached).toFixed(1)}s`);
        return cached;
      }
      const pcm = await generateSpeech(text, voiceName);
      fs.writeFileSync(cachePath, pcm);
      return pcm;
    };

    // Load multi-voice assignments from recurring characters + character_desc.json
    const voiceMap = loadVoiceAssignments(title);
    // Pre-scan ALL pages and assign voices to every speaker upfront
    await assignAllVoicesAsync(pages, voiceMap);

    // 1. Generate intro audio (inserted at MID-POINT, not beginning — kids need action immediately)
    console.log("   🎤 Generating intro (will insert at mid-story)...");
    const introText = story._translatedIntro
      ? story._translatedIntro
      : `${PODCAST_INTRO} Tonight's story is called: ${title}.`;
    const introPcm = await getSegmentPcm("intro", introText, narVoice);
    const midPoint = Math.floor(pages.length / 2); // Insert after page 12-13 (half way)
    console.log(`   ✅ Intro: ${pcmDurationSec(introPcm).toFixed(1)}s (after page ${midPoint})`);

    // 2. Generate audio for each page (with multi-voice dialogue)
    for (let i = 0; i < pages.length; i++) {
      const rawPage = pages[i];
      const segName = `page_${String(i).padStart(3, "0")}`;

      // Handle all formats via pageUtils
      const { pageToText, pageToSegments } = await import('./pageUtils.mjs');
      const pageText = pageToText(rawPage);
      const rawSegments = pageToSegments(rawPage);
      const isSegmented = rawSegments.length > 1 || (rawSegments.length === 1 && rawSegments[0].speaker.toLowerCase() !== 'narrator');
      const wordCount = pageText.split(/\s+/).length;
      console.log(`   📄 Page ${i + 1}/${pages.length} (${wordCount} words)${isSegmented ? ' [segmented]' : ''}...`);

      // Check for existing single-voice cache (backward compatible)
      const singleCachePath = path.join(cacheDir, `${segName}.pcm`);
      if (fs.existsSync(singleCachePath)) {
        const cached = fs.readFileSync(singleCachePath);
        console.log(`      💾 Cached ${segName}: ${pcmDurationSec(cached).toFixed(1)}s`);
        allPcmBuffers.push(cached);
      } else {
        // Build segments — either from pre-structured data or regex parsing
        let segments;
        if (isSegmented) {
          // Structured format: use pageToSegments (handles all segment formats)
          segments = rawSegments.map(seg => {
            const isNarrator = seg.speaker.toLowerCase() === 'narrator';
            const voice = isNarrator ? narVoice : getVoice(seg.speaker, voiceMap);
            return { text: seg.text, voice, character: isNarrator ? 'narrator' : seg.speaker };
          });
        } else {
          // Legacy flat string: use regex to split into segments
          segments = splitPageIntoSegments(pageText, voiceMap, narVoice);
        }

        if (segments.length === 1) {
          // Single segment (no dialogue detected) — standard path
          const pagePcm = await getSegmentPcm(segName, pageText, segments[0].voice);
          allPcmBuffers.push(pagePcm);
          console.log(`      🔊 ${pcmDurationSec(pagePcm).toFixed(1)}s`);
        } else {
          // Multi-voice: generate each segment separately
          const pagePcmParts = [];
          for (let s = 0; s < segments.length; s++) {
            const seg = segments[s];
            const segCacheName = `${segName}_seg_${String(s).padStart(3, "0")}`;
            const voiceLabel = seg.character === 'narrator' ? '' : ` [${seg.character}:${seg.voice}]`;
            const segPcm = await getSegmentPcm(segCacheName, seg.text, seg.voice);
            pagePcmParts.push(segPcm);
            if (voiceLabel) console.log(`      🎭 ${seg.character} (${seg.voice}): ${pcmDurationSec(segPcm).toFixed(1)}s`);
          }
          const combinedPagePcm = Buffer.concat(pagePcmParts);
          // Also save combined as page cache for future runs
          fs.writeFileSync(singleCachePath, combinedPagePcm);
          allPcmBuffers.push(combinedPagePcm);
          console.log(`      🔊 ${pcmDurationSec(combinedPagePcm).toFixed(1)}s (${segments.length} segments, ${segments.filter(s => s.character !== 'narrator').length} voiced)`);
        }
      }

      if (i < pages.length - 1) {
        allPcmBuffers.push(silenceBetweenPages);
      }

      // Insert GoReadling intro at the mid-point of the story (not at the beginning)
      // Kids need action immediately — 29s of intro before the story = they leave
      if (i === midPoint) {
        allPcmBuffers.push(createSilence(1));
        allPcmBuffers.push(introPcm);
        allPcmBuffers.push(createSilence(1));
      }

      if (i < pages.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_PAGES_MS));
      }
    }

    // 3. Generate outro audio (use translated outro for non-English)
    console.log("   🎤 Generating outro...");
    allPcmBuffers.push(createSilence(3));
    const outroText = story._translatedOutro || PODCAST_OUTRO;
    const outroPcm = await getSegmentPcm("outro", outroText, narVoice);
    allPcmBuffers.push(outroPcm);
    console.log(`   ✅ Outro: ${pcmDurationSec(outroPcm).toFixed(1)}s`);

    // 4. Concatenate all PCM → WAV
    const combinedPcm = Buffer.concat(allPcmBuffers);
    totalDurationSec = pcmDurationSec(combinedPcm);
    const wavHeader = createWavHeader(combinedPcm.byteLength);
    const wavBuffer = Buffer.concat([wavHeader, combinedPcm]);
    fs.writeFileSync(wavPath, wavBuffer);
    console.log(`   📦 Narration WAV: ${(totalDurationSec / 60).toFixed(1)} min (${(wavBuffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);

    // Keep page cache for potential per-page audio extraction later
    console.log(`   💾 Page cache kept: ${cacheDir}`);
  }

  // 5. Generate ambient background music
  console.log("   🎵 Generating ambient background music...");
  generateAmbientMusic(totalDurationSec, ambientPath);

  // 6. Mix narration + ambient → MP3
  console.log("   🎛️  Mixing and converting to MP3...");
  mixAndConvertToMp3(wavPath, ambientPath, mp3Path, {
    title: `Bedtime Story: ${title}`,
    artist: "GoReadling.com",
    album: "GoReadling Bedtime Stories",
    year: new Date().getFullYear().toString(),
  });

  const mp3Stats = fs.statSync(mp3Path);
  console.log(`   🎧 MP3 ready: ${mp3Path} (${(mp3Stats.size / 1024 / 1024).toFixed(1)} MB)`);

  // 7. Cleanup temp files
  if (!keepWav) {
    fs.unlinkSync(wavPath);
    fs.unlinkSync(ambientPath);
  }

  return { title, mp3Path, durationMin: (totalDurationSec / 60).toFixed(1), sizeMb: (mp3Stats.size / 1024 / 1024).toFixed(1) };
};

// ── Entry point ──
const main = async () => {
  // Preflight
  if (!checkFfmpeg()) {
    console.error("❌ ffmpeg not found. Install it with: brew install ffmpeg");
    process.exit(1);
  }

  fs.mkdirSync(EXPORTS_DIR, { recursive: true });

  const stories = selectStories();
  console.log(`\n🚀 Generating ${stories.length} podcast episode${stories.length === 1 ? "" : "s"}...`);
  console.log(`📂 Output: ${EXPORTS_DIR}\n`);

  const results = [];

  for (let i = 0; i < stories.length; i++) {
    try {
      const result = await generateEpisode(stories[i], i + 1, stories.length);
      results.push(result);
    } catch (error) {
      console.error(`\n💥 Failed "${stories[i].title}": ${error.message}`);
      console.log("   Continuing with next story...\n");
    }
  }

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("🎙️  PODCAST GENERATION COMPLETE");
  console.log("═".repeat(60));
  if (results.length) {
    console.log(`\n✅ ${results.length} episode${results.length === 1 ? "" : "s"} generated:\n`);
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title} — ${r.durationMin} min, ${r.sizeMb} MB`);
    });
    console.log(`\n📂 Files: ${EXPORTS_DIR}/`);
    console.log("\n📋 Next steps for Spotify for Podcasters:");
    console.log("  1. Go to https://podcasters.spotify.com");
    console.log("  2. Create a new podcast: 'GoReadling Bedtime Stories'");
    console.log("  3. Upload each MP3 as a new episode");
    console.log("  4. Add episode descriptions and cover art");
    console.log("  5. Publish! 🎉\n");
  } else {
    console.log("\n⚠️  No episodes were generated successfully.\n");
  }
};

main().catch((e) => {
  console.error("💥 Fatal:", e.message);
  process.exit(1);
});
