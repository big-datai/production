#!/usr/bin/env node
/**
 * Generate 150-word summaries + TTS audio for all stories.
 * Output: exports/shorts/summaries.json with { title, summary, audioPath }
 *
 * Usage:
 *   node scripts/generate-story-summaries.mjs          # all stories
 *   node scripts/generate-story-summaries.mjs --force   # regenerate existing
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { PODCAST_STORIES } from '../content/podcast/podcastStoryConstants.js';
import { pageToText } from '../content/podcast/pageUtils.mjs';

dotenv.config();
dotenv.config({ path: '.env.local' });

const SHORTS_DIR = 'exports/shorts';
const SUMMARIES_FILE = path.join(SHORTS_DIR, 'summaries.json');
const force = process.argv.includes('--force');

const API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean);

let keyIndex = 0;
function getKey() {
  const key = API_KEYS[keyIndex % API_KEYS.length];
  keyIndex++;
  return key;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function summarize(title, fullText) {
  const key = getKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

  const prompt = `Task: Rewrite this children's bedtime story as a 150-word narration script.

Story: "${title}"

Here is the full story text:
---
${fullText.slice(0, 4000)}
---

Now rewrite the ENTIRE story above as a TWO-PART SHORT NARRATION. Each part will be a separate 60-second YouTube Short video.

Return a JSON object with exactly this format:
{"part1": "...", "part2": "..."}

Rules for EACH part:
1. Each part MUST be exactly 120-130 words (will be read aloud in ~50 seconds)
2. Part 1: covers the SETUP and CONFLICT — ends on a cliffhanger with "To be continued..."
3. Part 2: covers the RESOLUTION and MORAL — starts with "And now, the rest of the story..." and ends with the lesson
4. Simple warm language for kids ages 3-7
5. Part 1 starts with "Once upon a time..."
6. Narration only — NO dialogue, NO character quotes
7. Present tense
8. Every sentence advances the plot

Return ONLY the JSON object with part1 and part2 strings:`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty response');

  // Parse JSON response with part1 and part2
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.part1 && parsed.part2) {
        // Add call to action at end of each part
        parsed.part1 = parsed.part1.replace(/\s*To be continued\.?\.?\.?\s*$/, '').trim() +
          ' To be continued... Follow for Part 2!';
        parsed.part2 = parsed.part2.trim() +
          ' Download GoReadling for more free bedtime stories!';
        return parsed;
      }
    }
  } catch (e) {}

  // Fallback: split text in half if not JSON
  const words = text.split(/\s+/);
  const mid = Math.floor(words.length / 2);
  return {
    part1: words.slice(0, mid).join(' ') + ' To be continued... Follow for Part 2!',
    part2: words.slice(mid).join(' ') + ' Download GoReadling for more free bedtime stories!',
  };
}

async function generateTTS(text, outputPath) {
  const key = getKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${key}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
        }
      },
    }),
  });

  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
  const data = await res.json();
  const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioData) throw new Error('No audio data');

  // Decode base64 PCM and convert to MP3
  const pcmBuffer = Buffer.from(audioData, 'base64');
  const pcmPath = outputPath.replace('.mp3', '.pcm');
  fs.writeFileSync(pcmPath, pcmBuffer);

  const { execSync } = await import('child_process');
  execSync(
    `/usr/local/bin/ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" -c:a libmp3lame -b:a 192k "${outputPath}"`,
    { stdio: 'pipe', timeout: 30000 }
  );
  fs.unlinkSync(pcmPath);

  // Get duration
  const dur = parseFloat(
    execSync(`/usr/local/bin/ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${outputPath}"`, { encoding: 'utf8' }).trim()
  );
  return dur;
}

async function main() {
  console.log(`🎬 Generating story summaries + TTS for YouTube Shorts\n`);
  console.log(`🔑 ${API_KEYS.length} API keys available\n`);

  fs.mkdirSync(SHORTS_DIR, { recursive: true });

  // Load existing summaries
  let summaries = {};
  if (fs.existsSync(SUMMARIES_FILE) && !force) {
    summaries = JSON.parse(fs.readFileSync(SUMMARIES_FILE, 'utf8'));
    console.log(`📄 Loaded ${Object.keys(summaries).length} existing summaries\n`);
  }

  let generated = 0, skipped = 0, failed = 0;

  for (const story of PODCAST_STORIES) {
    const title = story.title;

    // Skip if already done (check both parts)
    if (summaries[title]?.part1?.audioPath && summaries[title]?.part2?.audioPath && !force) {
      if (fs.existsSync(summaries[title].part1.audioPath) && fs.existsSync(summaries[title].part2.audioPath)) {
        skipped++;
        continue;
      }
    }

    console.log(`📖 ${title}`);

    // Get full story text
    const fullText = story.pages.map(p => pageToText(p)).filter(Boolean).join(' ');
    if (!fullText) {
      console.log(`  ⚠️ No story text — skipping`);
      failed++;
      continue;
    }

    try {
      // Generate two-part summary
      const parts = await summarize(title, fullText);
      const safe = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');

      const entry = { part1: {}, part2: {} };

      for (const [partKey, partText] of [['part1', parts.part1], ['part2', parts.part2]]) {
        const wordCount = partText.split(/\s+/).length;
        const audioPath = path.join(SHORTS_DIR, `${safe}_${partKey}_narration.mp3`);

        console.log(`  📝 ${partKey}: ${wordCount} words`);

        const duration = await generateTTS(partText, audioPath);
        console.log(`  🔊 ${partKey}: ${duration.toFixed(1)}s audio`);

        entry[partKey] = { summary: partText, audioPath, wordCount, duration };
        await sleep(500);
      }

      summaries[title] = entry;
      generated++;

      // Save after each story
      fs.writeFileSync(SUMMARIES_FILE, JSON.stringify(summaries, null, 2));

      await sleep(1000); // rate limit
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
      failed++;
    }
  }

  // Final save
  fs.writeFileSync(SUMMARIES_FILE, JSON.stringify(summaries, null, 2));

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Done! ${generated} generated, ${skipped} skipped, ${failed} failed`);
  console.log(`📄 Summaries: ${SUMMARIES_FILE}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
