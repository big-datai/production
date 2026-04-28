#!/usr/bin/env node
/**
 * Regenerate story pages for an existing story in podcastStoryConstants.js
 * with proper named dialogue attribution for multi-voice TTS.
 *
 * Usage:
 *   node content/regenerate-story-pages.mjs "The Steadfast Tin Soldier"
 *
 * What it does:
 *   1. Reads the existing story from podcastStoryConstants.js
 *   2. Re-generates 25 pages using Gemini with named attribution requirement
 *   3. Replaces the pages in-place in podcastStoryConstants.js
 *   4. Deletes the PCM cache for that story
 */

import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { pageToText } from './podcast/pageUtils.mjs';

const ROOT = path.resolve(process.cwd());
loadEnv({ path: path.join(ROOT, '.env.local') });
loadEnv({ path: path.join(ROOT, '.env') });

const CONSTANTS_PATH = path.join(ROOT, 'content/podcast/podcastStoryConstants.js');
const CHARACTERS_FILE = path.join(ROOT, 'assets', 'characters', 'recurringCharacters.json');

const targetTitle = process.argv[2];
if (!targetTitle) {
  console.error('Usage: node content/regenerate-story-pages.mjs "Story Title"');
  process.exit(1);
}

// ── API Key rotation ──────────────────────────────────────────────────────────
const API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].map(k => k?.replace(/"/g, '')).filter(Boolean);

if (!API_KEYS.length) { console.error('❌ No GEMINI_API_KEY found in .env.local'); process.exit(1); }
console.log(`🔑 ${API_KEYS.length} API key(s) available`);

let activeKeyIndex = 0;

async function callGemini(prompt, { temperature = 0.9, json = false } = {}) {
  const config = { temperature, maxOutputTokens: 65536 };
  if (json) config.responseMimeType = 'application/json';
  const maxAttempts = API_KEYS.length * 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const apiKey = API_KEYS[activeKeyIndex];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: config }),
      });
      if (!res.ok) {
        const err = await res.text();
        if (res.status === 429 || err.includes('RESOURCE_EXHAUSTED')) {
          activeKeyIndex = (activeKeyIndex + 1) % API_KEYS.length;
          console.log(`  🔄 Key quota hit, rotating to key ${activeKeyIndex + 1}/${API_KEYS.length}`);
          if (activeKeyIndex === 0) { console.log('  ⏳ All keys exhausted, waiting 60s...'); await new Promise(r => setTimeout(r, 60000)); }
          continue;
        }
        throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      activeKeyIndex = (activeKeyIndex + 1) % API_KEYS.length;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ── Find existing story entry ────────────────────────────────────────────────
function findStoryBlock(content, title) {
  // Find the opening of this story's object in the array
  const titleMarker = `title: "${title}"`;
  const idx = content.indexOf(titleMarker);
  if (idx === -1) return null;

  // Walk back to find the opening { for this story object
  let start = content.lastIndexOf('{', idx);

  // Walk forward to find the matching closing }
  let depth = 0;
  let end = start;
  for (let i = start; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }

  return { start, end, block: content.slice(start, end) };
}

// ── Extract existing pages from a story block ────────────────────────────────
function extractPages(block) {
  const pagesMatch = block.match(/pages:\s*\[([\s\S]*?)\]\s*[,}]/);
  if (!pagesMatch) return [];
  // Parse individual page strings (crude but workable)
  const inner = pagesMatch[1];
  const pages = [];
  const pageRe = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = pageRe.exec(inner)) !== null) {
    pages.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
  return pages;
}

// ── Generate fresh story pages with named attribution ──────────────────────
async function generateNewPages(title, existingPages) {
  // Build a synopsis from the existing pages (first + last few)
  const samplePages = [...existingPages.slice(0, 3), ...existingPages.slice(-2)];
  const synopsis = samplePages.join('\n\n').slice(0, 3000);

  // Load characters: recurring + story-specific
  let characterSection = '';
  try {
    const allChars = [];

    // Recurring characters
    const registry = JSON.parse(fs.readFileSync(CHARACTERS_FILE, 'utf8'));
    for (const c of (registry.characters || [])) {
      allChars.push({ name: c.name, desc: c.personality });
    }

    // Story-specific characters from character_desc.json
    const safeTitle = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
    const storiesDir = path.join(ROOT, 'exports', 'stories');
    if (fs.existsSync(storiesDir)) {
      for (const d of fs.readdirSync(storiesDir)) {
        if (d.startsWith(safeTitle)) {
          const descPath = path.join(storiesDir, d, 'youtube', safeTitle, 'character_desc.json');
          if (fs.existsSync(descPath)) {
            const storyChars = JSON.parse(fs.readFileSync(descPath, 'utf8'));
            for (const c of storyChars) {
              if (!allChars.some(a => a.name === c.name)) {
                allChars.push({ name: c.name, desc: `${c.species}, age ${c.age}` });
              }
            }
            break;
          }
        }
      }
    }

    if (allChars.length > 0) {
      characterSection = `\nCHARACTERS (use EXACT names for dialogue attribution):\n${allChars.map(c => `- ${c.name}: ${c.desc}`).join('\n')}\n`;
    }
  } catch {}

  console.log(`\n✍️  Generating new story pages with named dialogue attribution...`);

  const prompt = `You are writing a children's bedtime PODCAST SCRIPT for "GoReadling Bedtime Stories."
This is NOT a storybook — it is a multi-voice AUDIO DRAMA like a cartoon, where characters TALK constantly.

STORY TITLE: "${title}"

STORY SUMMARY (existing version — keep the same plot and characters):
${synopsis}
${characterSection}
CRITICAL CHARACTER NOTES:
- Rosie is a HEN (chicken), NOT a teddy bear. She clucks, fluffs her feathers, etc.
- The Jack-in-the-box character is named "Jack" (NOT "Pip" — Pip is the fox).
- Captain Bramble is the narrator voice — he introduces and wraps up the story.
- Luna, Finn, Rosie, Pip (the fox), and Stella are recurring friends who appear in the story.

STYLE — DIALOGUE-HEAVY PODCAST/CARTOON:
This story will be read aloud by DIFFERENT voice actors for each character.
The audience HEARS different voices, so dialogue is the star — not narration.
Think of it like a Pixar movie or animated TV show: characters TALK to each other constantly.
Narration is the glue between dialogue exchanges, NOT the main content.

REQUIREMENTS:
1. Write EXACTLY 25 pages. Each page is one long paragraph of 200-250 words.
2. Keep the SAME plot, characters, and setting as the existing story.
3. This is an ORIGINAL RETELLING. Do NOT copy text from any published version.
4. DIALOGUE IS KING: Every single page MUST have AT LEAST 3-4 lines of dialogue from different characters. Aim for 40-50% of each page being spoken dialogue. Characters should chat, react, argue, encourage, joke, gasp, and exclaim.
5. Narration (non-dialogue) should be SHORT connective tissue between dialogue — describe actions, sounds, transitions. Keep narration sentences brief.
6. Use rich sensory descriptions in narration: sounds, smells, textures, colors, warmth — but keep them SHORT (1-2 sentences max between dialogue lines).
7. The LAST page MUST end with Captain Bramble saying goodnight.
8. The SECOND-TO-LAST page should begin winding down — quieter, softer dialogue.
9. Use simple vocabulary appropriate for children ages 4-8.
10. CRITICAL — NAMED DIALOGUE ATTRIBUTION: Use single quotes for dialogue. ALWAYS attribute by character NAME — NEVER by pronoun. Use EXACTLY these formats:
    - 'Quote,' said CharacterName.
    - CharacterName said, 'Quote.'
    - 'Quote,' whispered CharacterName.
    - CharacterName exclaimed, 'Quote!'
    NEVER write 'she said', 'he replied', 'they whispered' — always the actual character name.
11. Every page MUST have at least 3 named dialogue attributions from at least 2 different characters.
12. Dialogue must ALWAYS be in first person — characters say 'I love this!' not 'she loves this'. Characters NEVER refer to themselves in third person.
13. Inside dialogue, characters must REFER TO OTHER CHARACTERS BY NAME — never by pronoun. Say 'The Ballerina looks like she is floating!' NOT 'She looks like she is floating!' The listener can only HEAR voices, they cannot see who is being pointed at. Every "he", "she", "they", "it" in dialogue that refers to a character MUST be replaced with the character's name so the audio audience knows who is being discussed.
14. NEVER break the fourth wall except in the final goodnight.
15. CRITICAL — REAL CHARACTER NAMES: EVERY character MUST have a proper name — NEVER use generic titles like "The King", "The Princess", "The Baker", "Old Man", "Innkeeper", "Simpleton", etc. Give them real names: "King Philip", "Princess Clara", "Baker Henrik", "Old Man Tobias", etc. Even minor one-scene characters need a real name.
16. Characters should have distinct speaking styles: Luna is gentle/curious, Finn is excited/adventurous, Rosie clucks and fusses like a mother hen, Pip (fox) is playful/cheeky, Captain Bramble is warm/wise, Stella is dreamy/gentle.

REMEMBER: This is an AUDIO DRAMA, not a book. If a page has no dialogue, it FAILS. Every page MUST have characters talking. NO EXCEPTIONS. Minimum 3 dialogue lines per page using the 'Quote,' said CharacterName format with single quotes.

OUTPUT FORMAT:
Return ONLY a JSON array of exactly 25 strings, one per page. No markdown, no code fences.`;

  const rawText = await callGemini(prompt, { temperature: 0.9 });

  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  let pages;
  try {
    pages = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) pages = JSON.parse(match[0]);
    else throw new Error('Failed to parse story JSON from Gemini response');
  }

  if (!Array.isArray(pages) || pages.length < 20) {
    throw new Error(`Expected 25 pages, got ${Array.isArray(pages) ? pages.length : typeof pages}`);
  }

  const totalWords = pages.reduce((sum, p) => sum + pageToText(p).split(/\s+/).length, 0);
  console.log(`  ✅ ${pages.length} pages, ~${totalWords} words`);

  // Count named attributions
  const namedCount = pages.reduce((sum, p) => {
    return sum + (pageToText(p).match(/(?:said|whispered|shouted|exclaimed|cried|replied|asked|muttered|declared|announced)\s+[A-Z][a-z]+|[A-Z][a-z]+\s+(?:said|whispered|exclaimed|replied|asked),/g) || []).length;
  }, 0);
  console.log(`  🎙️  Named dialogue attributions found: ${namedCount}`);

  return pages;
}

// ── Replace pages in constants file ─────────────────────────────────────────
function replacePages(content, storyBlock, newPages) {
  const escapedPages = newPages.map(p => {
    const escaped = p.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').replace(/\r/g, '');
    return `      "${escaped}"`;
  }).join(',\n');

  // Build new pages section
  const newPagesSection = `pages: [\n${escapedPages}\n    ]`;

  // Replace the pages: [...] section within the story block
  const newBlock = storyBlock.block.replace(/pages:\s*\[[\s\S]*?\](?=\s*[,}])/, newPagesSection);

  return content.slice(0, storyBlock.start) + newBlock + content.slice(storyBlock.end);
}

// ── Delete PCM cache ─────────────────────────────────────────────────────────
function deletePcmCache(title) {
  const safeTitle = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  const cacheDir = path.join(ROOT, 'exports', 'spotify', `_cache_${safeTitle}`);
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true });
    console.log(`  🗑️  Deleted PCM cache: ${cacheDir}`);
  } else {
    // Check in exports/stories/*/spotify/
    const storiesDir = path.join(ROOT, 'exports', 'stories');
    if (fs.existsSync(storiesDir)) {
      for (const d of fs.readdirSync(storiesDir)) {
        if (d.startsWith(safeTitle)) {
          const spotifyDir = path.join(storiesDir, d, 'spotify');
          if (fs.existsSync(spotifyDir)) {
            for (const f of fs.readdirSync(spotifyDir)) {
              if (f.startsWith('_cache_')) {
                const cacheInStories = path.join(spotifyDir, f);
                fs.rmSync(cacheInStories, { recursive: true });
                console.log(`  🗑️  Deleted PCM cache: ${cacheInStories}`);
              }
            }
          }
        }
      }
    }
    console.log(`  ℹ️  No cache directory found at ${cacheDir}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔄 Regenerating story pages for: "${targetTitle}"\n`);

  const content = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  const storyBlock = findStoryBlock(content, targetTitle);

  if (!storyBlock) {
    console.error(`❌ Story "${targetTitle}" not found in podcastStoryConstants.js`);
    process.exit(1);
  }

  console.log(`✅ Found story in constants (chars ${storyBlock.start}-${storyBlock.end})`);

  const existingPages = extractPages(storyBlock.block);
  console.log(`  📄 Existing pages: ${existingPages.length}`);

  // Generate new pages
  const newPages = await generateNewPages(targetTitle, existingPages);

  // Replace in constants file
  console.log(`\n📝 Updating podcastStoryConstants.js...`);
  const newContent = replacePages(content, storyBlock, newPages);
  fs.writeFileSync(CONSTANTS_PATH, newContent, 'utf8');
  console.log(`  ✅ Constants updated`);

  // Delete PCM cache
  console.log(`\n🗑️  Clearing PCM cache...`);
  deletePcmCache(targetTitle);

  console.log(`\n✨ Done! Next step:`);
  console.log(`   node content/podcast/generatePodcast.mjs "Tin"`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
