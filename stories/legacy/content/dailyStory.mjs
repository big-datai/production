#!/usr/bin/env node
/**
 * Daily Story Pipeline — GoReadling
 *
 * Generates 1 new bedtime story per day, end-to-end:
 *   1. Generate story idea (title + synopsis) using Gemini
 *   2. Generate full 25-page story text (structured multi-voice segments)
 *   3. Append to podcastStoryConstants.js
 *   4. Generate character descriptions (character_desc.json — needed for voice assignment)
 *   5. Generate Spotify podcast MP3 (multi-voice TTS + ambient music)
 *   6. Generate illustrations + Kling clips.json (for Kling AI animation)
 *   7. Seed to Firestore as a "night" story
 *   8. Submit to Google Indexing API
 *
 * After step 6, Kling clips must be submitted and rendered separately:
 *   - node content/kling-batch-generate.mjs <kling_clips.json> --load-storage /tmp/kling-storage.json
 *   - Wait for clips to render on kling.ai (3-10 min each)
 *   - node content/kling-build-story.mjs "<Story Title>"
 *
 * Usage:
 *   node content/dailyStory.mjs                    # generate 1 new story
 *   node content/dailyStory.mjs --dry-run           # show what would be generated
 *   node content/dailyStory.mjs --skip-video        # skip YouTube video (MP3 only)
 *   node content/dailyStory.mjs --skip-seed         # skip Firestore seeding
 *   node content/dailyStory.mjs --skip-index        # skip Google Indexing
 *   node content/dailyStory.mjs --title "Ali Baba"  # force a specific title
 *   node content/dailyStory.mjs --title "Ali Baba" --from-step 4  # resume from step 4 (existing story)
 *
 * Prerequisites:
 *   brew install ffmpeg
 *   GEMINI_API_KEY (+ _2 through _5) in .env.local
 *   gcloud auth application-default login
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync, spawnSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

loadEnv({ path: path.join(ROOT, '.env.local') });
loadEnv({ path: path.join(ROOT, '.env') });

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipVideo = args.includes('--skip-video');
const skipSeed = args.includes('--skip-seed');
const skipIndex = args.includes('--skip-index');
const forceRegenerate = args.includes('--force');
const titleArgIdx = args.indexOf('--title');
const forcedTitle = titleArgIdx >= 0 ? args[titleArgIdx + 1] : null;
const fromStepIdx = args.indexOf('--from-step');
const fromStep = fromStepIdx >= 0 ? parseInt(args[fromStepIdx + 1], 10) : 1;

// ── API Key rotation (all 5 keys) ────────────────────────────────────────────
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

const CONSTANTS_PATH = path.join(ROOT, 'content/podcast/podcastStoryConstants.js');
const CHARACTERS_FILE = path.join(ROOT, 'assets', 'characters', 'recurringCharacters.json');
const NODE = '/usr/local/bin/node';
const ENV_PATH = `PATH=/usr/local/share/google-cloud-sdk/bin:/usr/local/bin:/opt/homebrew/bin:${process.env.PATH}`;

// ── Story output folder: exports/stories/<Name>_MMDDYYYY/{spotify,youtube,text} ──
function findStoryDirs(title) {
  const safe = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  const storiesRoot = path.join(ROOT, 'exports', 'stories');
  if (!fs.existsSync(storiesRoot)) return null;
  const match = fs.readdirSync(storiesRoot).find(d => d.startsWith(safe + '_'));
  if (!match) return null;
  const storyRoot = path.join(storiesRoot, match);
  return {
    root: storyRoot,
    spotify: path.join(storyRoot, 'spotify'),
    youtube: path.join(storyRoot, 'youtube'),
    text: path.join(storyRoot, 'text'),
    folderName: match,
  };
}

function createStoryDirs(title) {
  const safe = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  const d = new Date();
  const dateStamp = String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') + d.getFullYear();
  const folderName = `${safe}_${dateStamp}`;
  const storyRoot = path.join(ROOT, 'exports', 'stories', folderName);
  const dirs = {
    root: storyRoot,
    spotify: path.join(storyRoot, 'spotify'),
    youtube: path.join(storyRoot, 'youtube'),
    text: path.join(storyRoot, 'text'),
    folderName,
  };
  for (const d of [dirs.spotify, dirs.youtube, dirs.text]) {
    fs.mkdirSync(d, { recursive: true });
  }
  return dirs;
}

// ── Gemini call with key rotation ────────────────────────────────────────────
async function callGemini(prompt, { model = 'gemini-2.5-flash', temperature = 0.9, json = false, responseSchema = null } = {}) {
  const config = { temperature, maxOutputTokens: 65536 };
  if (json) config.responseMimeType = 'application/json';
  if (responseSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = responseSchema;
  }
  const maxAttempts = API_KEYS.length * 2; // try each key twice

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const apiKey = API_KEYS[activeKeyIndex];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: config }),
      });
      if (!res.ok) {
        const err = await res.text();
        const is429 = res.status === 429 || err.includes('RESOURCE_EXHAUSTED');
        if (is429) {
          // Rotate to next key
          const prevIdx = activeKeyIndex;
          activeKeyIndex = (activeKeyIndex + 1) % API_KEYS.length;
          console.log(`  🔄 Key ${prevIdx + 1} quota hit, rotating to key ${activeKeyIndex + 1}/${API_KEYS.length}`);
          if (activeKeyIndex === 0) {
            // All keys exhausted — wait before cycling again
            console.log(`  ⏳ All keys exhausted, waiting 60s...`);
            await new Promise(r => setTimeout(r, 60000));
          }
          continue;
        }
        throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      console.log(`  ⚠️ Attempt ${attempt}/${maxAttempts} failed (key ${activeKeyIndex + 1}): ${e.message}`);
      activeKeyIndex = (activeKeyIndex + 1) % API_KEYS.length;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ── Character casting: select recurring characters for a story ───────────────
async function selectRecurringCharacters(title, synopsis) {
  try {
    const registry = JSON.parse(fs.readFileSync(CHARACTERS_FILE, 'utf8'));
    const characters = registry.characters;

    const prompt = `You are casting characters for a children's bedtime story.

STORY: "${title}"
SYNOPSIS: ${synopsis}

AVAILABLE RECURRING CHARACTERS (use these if they naturally fit a role in this story):
${characters.map(c => `- ${c.id}: ${c.name} (${c.role}): ${c.personality} | Fits roles: ${c.storyRoles.join(', ')}`).join('\n')}

For this story, select which recurring characters fit naturally. Don't force characters that don't belong.
Also suggest any NEW characters needed that aren't in the pool (e.g., specific villains, animals, or side characters unique to this story).

Return JSON:
{
  "recurring": [{"id": "character_id", "storyRole": "what role they play in this story"}],
  "newCharacters": [{"name": "Name", "role": "Their role", "personality": "Brief personality"}]
}`;

    const raw = await callGemini(prompt, { temperature: 0.7, json: true });
    const casting = JSON.parse(raw);

    // Enrich recurring selections with full character data
    const enriched = (casting.recurring || []).map(r => {
      const charData = characters.find(c => c.id === r.id);
      if (!charData) return null;
      return { character: charData, role: r.storyRole };
    }).filter(Boolean);

    console.log(`  🎭 Recurring characters: ${enriched.length > 0 ? enriched.map(r => `${r.character.name} (${r.role})`).join(', ') : 'none'}`);
    if (casting.newCharacters?.length) {
      console.log(`  🆕 New characters: ${casting.newCharacters.map(c => `${c.name} (${c.role})`).join(', ')}`);
    }

    return { recurring: enriched, newCharacters: casting.newCharacters || [] };
  } catch (e) {
    console.log(`  ⚠️ Character casting failed (non-fatal): ${e.message}`);
    return { recurring: [], newCharacters: [] };
  }
}

// ── Step 1: Generate a new story idea ────────────────────────────────────────
async function generateStoryIdea(existingTitles) {
  if (forcedTitle) {
    console.log(`\n📖 Using forced title: "${forcedTitle}"`);
    const synopsisPrompt = `Write a detailed synopsis (200-300 words) for a children's bedtime story called "${forcedTitle}".
If this is based on a public domain fairy tale, follow the original story closely.
If it's an original title, create a warm, engaging plot suitable for ages 3-8.
Include character names, key plot points, and a happy/peaceful ending.
Return ONLY the synopsis text, no JSON, no markdown.`;
    const synopsis = await callGemini(synopsisPrompt, { temperature: 0.7 });
    const idea = { title: forcedTitle, source: 'Original / public domain', synopsis: synopsis.trim() };
    console.log('\n🎭 Casting recurring characters...');
    idea.recurringCharacters = await selectRecurringCharacters(idea.title, idea.synopsis);
    return idea;
  }

  console.log('\n🎲 Generating a new story idea...');
  const existingList = existingTitles.map(t => `  - ${t}`).join('\n');

  const prompt = `You are a children's story curator for a bedtime story podcast. Generate ONE new story idea.

EXISTING STORIES (do NOT repeat any of these):
${existingList}

Choose from one of these categories:
1. A PUBLIC DOMAIN fairy tale, folk tale, or classic children's story NOT in the list above
   (e.g., Grimm, Andersen, Aesop, Perrault, Arabian Nights, African/Asian/South American folk tales)
2. An ORIGINAL heartwarming bedtime story with a clear moral lesson

For public domain stories, provide the original author/source and a detailed synopsis following the original plot.
For original stories, create a warm, engaging plot suitable for ages 3-8.

CRITICAL — REAL NAMES: Every character in the synopsis MUST have a proper name — NEVER use generic titles like "The King", "The Princess", "The Baker", "Old Man", "Innkeeper", "Parson", etc. Give them real names: "King Philip", "Princess Clara", "Baker Henrik", "Old Man Tobias", etc. This is a multi-voice audio drama — listeners need to distinguish characters by name.

Return ONLY a JSON object:
{
  "title": "Story Title",
  "source": "Author, Source (year) or 'Original story'",
  "synopsis": "Detailed synopsis (200-300 words) with character names (all REAL proper names), key plot points, and ending"
}`;

  const raw = await callGemini(prompt, { temperature: 1.0, json: true });
  const idea = JSON.parse(raw);
  console.log(`  📖 "${idea.title}" — ${idea.source}`);
  console.log('\n🎭 Casting recurring characters...');
  idea.recurringCharacters = await selectRecurringCharacters(idea.title, idea.synopsis);
  return idea;
}

// ── Step 2: Generate full story text ─────────────────────────────────────────
async function generateStoryText(idea) {
  console.log('\n✍️ Generating full story text...');

  // Build character section for the prompt
  let characterSection = '';
  const rc = idea.recurringCharacters || { recurring: [], newCharacters: [] };
  if (rc.recurring.length > 0 || rc.newCharacters.length > 0) {
    const parts = ['CHARACTERS:'];
    if (rc.recurring.length > 0) {
      parts.push('Recurring characters to include (use these EXACT names and stay true to their personalities):');
      for (const r of rc.recurring) {
        parts.push(`- ${r.character.name}: ${r.character.personality} — Role in this story: ${r.role}`);
      }
    }
    if (rc.newCharacters.length > 0) {
      parts.push('\nNew story-specific characters:');
      for (const c of rc.newCharacters) {
        parts.push(`- ${c.name} (${c.role}): ${c.personality}`);
      }
    }
    parts.push('\nUse these EXACT names for the recurring characters. You may add additional unique characters as needed for the story.');
    characterSection = '\n' + parts.join('\n') + '\n';
  }

  const prompt = `You are writing a bedtime PODCAST SCRIPT for "GoReadling Bedtime Stories."
This is NOT a storybook — it is a multi-voice AUDIO DRAMA like a cartoon, where characters TALK constantly.
Each character is voiced by a different voice actor, so dialogue is the star of the show.

STORY TO WRITE: "${idea.title}"
ORIGINAL SOURCE: ${idea.source}

PLOT SYNOPSIS (follow this closely):
${idea.synopsis}
${characterSection}
REQUIREMENTS:
1. Write EXACTLY 25 pages. Each page is one long paragraph of 200-250 words.
2. Total word count: MINIMUM 5000 words, aim for 5000-5500 words.
3. This is an ORIGINAL RETELLING. Do NOT copy text from any published version.
4. Do NOT use any Disney-owned names, characters, songs, plot elements, or visual descriptions.
5. DIALOGUE IS KING: Every single page MUST have AT LEAST 3-4 lines of dialogue from different characters. Aim for 40-50% of each page being spoken dialogue. Characters should chat, react, argue, encourage, joke, gasp, and exclaim constantly — like a Pixar movie or animated TV show.
6. Narration (non-dialogue) should be SHORT connective tissue between dialogue — describe actions, sounds, transitions. Keep narration sentences brief (1-2 sentences max between dialogue lines).
7. Use rich but brief sensory descriptions: sounds, smells, textures, colors, warmth.
8. The LAST page MUST end with a gentle "goodnight" message.
9. The SECOND-TO-LAST page should begin winding down — quieter, softer dialogue.
10. Use simple vocabulary appropriate for children ages 4-8.
11. CRITICAL — NAMED DIALOGUE ATTRIBUTION: Use single quotes for dialogue. ALWAYS attribute by character NAME — NEVER by pronoun. Use EXACTLY these formats:
    - 'Quote,' said CharacterName.
    - CharacterName said, 'Quote.'
    - 'Quote,' whispered CharacterName.
    - CharacterName exclaimed, 'Quote!'
    NEVER write 'she said', 'he replied' — always the actual character name.
12. Every page MUST have at least 3 named dialogue attributions from at least 2 different characters.
13. Dialogue must ALWAYS be in first person — characters say 'I love this!' not 'she loves this'. Characters NEVER refer to themselves in third person.
14. Inside dialogue, characters must REFER TO OTHER CHARACTERS BY NAME — never by pronoun. Say 'The Ballerina looks like she is floating!' NOT 'She looks like she is floating!' The listener can only HEAR voices, they cannot see who is being pointed at. Every "he", "she", "they", "it" in dialogue that refers to a character MUST be replaced with the character's name so the audio audience knows who is being discussed.
15. NEVER break the fourth wall except in the final goodnight.
16. CRITICAL — REAL CHARACTER NAMES: EVERY character MUST have a proper name — NEVER use generic titles like "The King", "The Princess", "The Baker", "Old Man", "Innkeeper", "Parson", "Simpleton", etc. Give them real names: "King Philip", "Princess Clara", "Baker Henrik", "Old Man Tobias", etc. Even minor one-scene characters need a real name. This is a multi-voice audio drama where each character gets a unique voice — generic titles make characters indistinguishable. If the source material uses a generic title, INVENT a proper name for them.

OUTPUT FORMAT:
Return a JSON array of exactly 25 pages. Each page is an ARRAY OF SEGMENTS — each segment is an object with a single key (the speaker name) and a string value (what they say/narrate).

Example page:
[
  {"Narrator": "The forest was quiet as morning light filtered through the leaves."},
  {"Luna": "Luna thinks this is the most beautiful sunrise Luna has ever seen!"},
  {"Captain Bramble": "Aye, the old captain agrees. Captain Bramble remembers mornings like this from long ago."},
  {"Narrator": "A gentle breeze rustled the branches above them."}
]

Rules for segments:
- Use "Narrator" for all non-dialogue narration (descriptions, transitions, scene-setting).
- Use the character's EXACT name for their dialogue (no "he said" attribution — just the spoken words).
- Keep narration segments SHORT (1-2 sentences). Dialogue is the star.
- Each page should have 6-12 segments alternating between Narrator and character dialogue.
- Characters in dialogue MUST speak in first person and refer to others by name (never pronouns).

Return a structured JSON object with title, narratorVoice, and pages array.`;

  // Gemini structured JSON mode with schema — guarantees valid JSON, no parsing needed
  const storySchema = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING', description: 'The story title' },
      narratorVoice: { type: 'STRING', description: 'Default narrator voice name (e.g. "Charon")' },
      pages: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            page: { type: 'INTEGER', description: 'Page number (1-25)' },
            segments: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  speaker: { type: 'STRING', description: 'Character name or "Narrator"' },
                  text: { type: 'STRING', description: 'What the character says or narrates' },
                },
                required: ['speaker', 'text'],
              },
            },
          },
          required: ['page', 'segments'],
        },
      },
    },
    required: ['title', 'pages'],
  };

  const rawText = await callGemini(prompt, { temperature: 0.9, responseSchema: storySchema });
  const storyData = JSON.parse(rawText);

  // Extract pages — already validated by schema
  const pages = storyData.pages;
  if (!pages || pages.length < 15) {
    throw new Error(`Expected 25 pages, got ${pages?.length || 0}`);
  }

  // Sort by page number in case Gemini returns them out of order
  pages.sort((a, b) => a.page - b.page);

  const totalWords = pages.reduce((sum, p) =>
    sum + p.segments.reduce((s, seg) => s + seg.text.split(/\s+/).length, 0), 0);
  const totalSegments = pages.reduce((sum, p) => sum + p.segments.length, 0);
  const voicedSegments = pages.reduce((sum, p) =>
    sum + p.segments.filter(s => s.speaker.toLowerCase() !== 'narrator').length, 0);
  console.log(`  ✅ ${pages.length} pages, ~${totalWords} words, ${totalSegments} segments (${voicedSegments} voiced)`);

  return { title: idea.title, narratorVoice: storyData.narratorVoice || 'Charon', pages };
}

// ── Step 3: Append to podcastStoryConstants.js ───────────────────────────────
function appendToConstants(story) {
  let content = fs.readFileSync(CONSTANTS_PATH, 'utf8');

  // Check if already exists
  if (content.includes(`"${story.title}"`) && !forceRegenerate) {
    console.log(`  ⏩ "${story.title}" already in podcastStoryConstants.js`);
    return getStoryIndex(story.title);
  }
  if (content.includes(`"${story.title}"`) && forceRegenerate) {
    // Remove old entry and re-append with new text
    console.log(`  🔄 Replacing "${story.title}" in podcastStoryConstants.js`);
    const escapedTitle = story.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entryRegex = new RegExp(`,?\\s*\\{\\s*title: "${escapedTitle}",[\\s\\S]*?\\n  \\}`, 'g');
    content = content.replace(entryRegex, '');
    fs.writeFileSync(CONSTANTS_PATH, content);
    content = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  }

  // Update header comment with new story number
  const titles = content.match(/title: "/g);
  const nextNum = (titles?.length || 0) + 1;

  const closingIndex = content.lastIndexOf('];');
  if (closingIndex === -1) throw new Error('Could not find closing ]; in constants file');

  // Write structured page format: {page: N, segments: [{speaker, text}]}
  const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const pagesJs = story.pages
    .map(page => {
      if (page.segments) {
        // New structured format: {page, segments: [{speaker, text}]}
        const segs = page.segments.map(seg =>
          `{"speaker": "${esc(seg.speaker || 'Narrator')}", "text": "${esc(seg.text || '')}"}`
        ).join(',\n            ');
        return `      {\n        "page": ${page.page},\n        "segments": [\n            ${segs}\n        ]\n      }`;
      } else if (Array.isArray(page)) {
        // Flat segment array fallback: [{speaker, text}]
        const segs = page.map(seg =>
          `{"speaker": "${esc(seg.speaker || 'Narrator')}", "text": "${esc(seg.text || '')}"}`
        ).join(', ');
        return `      [${segs}]`;
      } else {
        // Legacy flat string
        return `      "${esc(page)}"`;
      }
    })
    .join(',\n\n');

  const entry = `,\n\n  {\n    title: "${story.title}",\n    pages: [\n${pagesJs}\n    ]\n  }`;
  content = content.slice(0, closingIndex) + entry + '\n' + content.slice(closingIndex);
  fs.writeFileSync(CONSTANTS_PATH, content);
  console.log(`  💾 Appended as story #${nextNum}`);

  return nextNum;
}

function getStoryIndex(title) {
  const content = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  const matches = [...content.matchAll(/title: "([^"]+)"/g)];
  const idx = matches.findIndex(m => m[1] === title);
  return idx >= 0 ? idx + 1 : -1;
}

// ── Step 5: Generate podcast MP3 ─────────────────────────────────────────────
function generatePodcast(storyTitle, storyDirs) {
  console.log(`\n🎙️ Generating podcast MP3 for "${storyTitle}"...`);
  const result = spawnSync(NODE, ['content/podcast/generatePodcast.mjs', storyTitle], {
    cwd: ROOT,
    env: {
      ...process.env,
      PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH}`,
      STORY_SPOTIFY_DIR: storyDirs.spotify,
    },
    stdio: 'inherit',
    timeout: 30 * 60 * 1000, // 30 min timeout
  });
  if (result.status !== 0) throw new Error(`Podcast generation failed (exit ${result.status})`);
}

// ── Step 4b: Generate character descriptions (needed before podcast) ────────
function generateCharacterDescriptions(storyTitle, storyDirs) {
  console.log(`\n👤 Generating character descriptions for "${storyTitle}"...`);
  const result = spawnSync(NODE, ['content/podcast/generateYoutubeVideos.mjs', storyTitle, '--chars-only'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH}`,
      STORY_SPOTIFY_DIR: storyDirs.spotify,
      STORY_YOUTUBE_DIR: storyDirs.youtube,
    },
    stdio: 'inherit',
    timeout: 10 * 60 * 1000, // 10 min timeout
  });
  if (result.status !== 0) throw new Error(`Character description generation failed (exit ${result.status})`);
}

// ── Step 6: Generate illustrations + Kling clips.json ───────────────────────
function generateIllustrationsAndKlingClips(storyTitle, storyDirs) {
  console.log(`\n🎬 Generating illustrations + Kling clips for "${storyTitle}"...`);
  const result = spawnSync(NODE, ['content/podcast/generateYoutubeVideos.mjs', storyTitle], {
    cwd: ROOT,
    env: {
      ...process.env,
      PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH}`,
      STORY_SPOTIFY_DIR: storyDirs.spotify,
      STORY_YOUTUBE_DIR: storyDirs.youtube,
    },
    stdio: 'inherit',
    timeout: 60 * 60 * 1000, // 60 min timeout
  });
  if (result.status !== 0) throw new Error(`Illustration + Kling clips generation failed (exit ${result.status})`);
}

// ── Step 7: Seed to Firestore ────────────────────────────────────────────────
function seedToFirestore(title, storyDirs) {
  console.log(`\n📦 Seeding "${title}" to Firestore...`);

  const safeTitle = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  const mp3Path = path.join(storyDirs.spotify, `${safeTitle}.mp3`);

  if (!fs.existsSync(mp3Path)) {
    console.log(`  ⚠️ MP3 not found at ${mp3Path} — skipping seed`);
    return;
  }

  const result = spawnSync(NODE, ['content/podcast/seedBednightStories.mjs', 'seed', title], {
    cwd: ROOT,
    env: {
      ...process.env,
      PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH}`,
      STORY_DIR: storyDirs.root,
    },
    stdio: 'inherit',
    timeout: 10 * 60 * 1000,
  });
  if (result.status !== 0) {
    console.log(`  ⚠️ Seeding returned non-zero exit (${result.status}) — may need manual review`);
  }
}

// ── Step 7: Submit to Google Indexing ─────────────────────────────────────────
function submitToIndexing(title) {
  console.log('\n🔍 Submitting to Google Indexing API...');
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const storyUrl = `https://goreadling.com/stories/${slug}`;

  try {
    const accessToken = execSync(
      'gcloud auth application-default print-access-token',
      { encoding: 'utf8', env: { ...process.env, PATH: `/usr/local/share/google-cloud-sdk/bin:/usr/local/bin:${process.env.PATH}` } }
    ).trim();

    const res = spawnSync('curl', [
      '-s', '-X', 'POST',
      'https://indexing.googleapis.com/v3/urlNotifications:publish',
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${accessToken}`,
      '-H', 'x-goog-user-project: gen-lang-client-0430249113',
      '-d', JSON.stringify({ url: storyUrl, type: 'URL_UPDATED' }),
    ], { encoding: 'utf8', stdio: 'pipe' });

    const body = JSON.parse(res.stdout || '{}');
    if (body.urlNotificationMetadata) {
      console.log(`  ✅ Indexed: ${storyUrl}`);
    } else {
      console.log(`  ⚠️ Indexing response: ${res.stdout?.slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`  ⚠️ Indexing failed: ${e.message}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  console.log('═'.repeat(60));
  console.log('🌙 GoReadling Daily Story Pipeline');
  console.log(`📅 ${new Date().toISOString().slice(0, 10)}`);
  console.log('═'.repeat(60));

  // Get existing story titles
  const existing = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  const existingTitles = [...existing.matchAll(/"?title"?: "([^"]+)"/g)].map(m => m[1]);
  console.log(`📚 ${existingTitles.length} existing stories in podcastStoryConstants.js`);

  if (fromStep > 1) {
    // ── Resume mode: skip to a specific step for an existing story ──
    if (!forcedTitle) { console.error('❌ --from-step requires --title'); process.exit(1); }
    const storyTitle = forcedTitle;
    const storyDirs = findStoryDirs(storyTitle);
    if (!storyDirs) { console.error(`❌ No story folder found for "${storyTitle}"`); process.exit(1); }
    console.log(`\n⏩ Resuming "${storyTitle}" from step ${fromStep}`);
    console.log(`📁 Story folder: ${storyDirs.root}`);

    if (fromStep <= 4) generateCharacterDescriptions(storyTitle, storyDirs);
    if (fromStep <= 5) generatePodcast(storyTitle, storyDirs);
    if (fromStep <= 6 && !skipVideo) generateIllustrationsAndKlingClips(storyTitle, storyDirs);
    if (fromStep <= 7 && !skipSeed) seedToFirestore(storyTitle, storyDirs);
    if (fromStep <= 8 && !skipIndex) submitToIndexing(storyTitle);

    console.log('\n' + '═'.repeat(60));
    console.log(`🎉 RESUMED PIPELINE COMPLETE (from step ${fromStep})`);
    console.log('═'.repeat(60));
    return;
  }

  // ── Full pipeline: start from step 1 ──

  // Step 1: Generate story idea
  const idea = await generateStoryIdea(existingTitles);

  if (existingTitles.includes(idea.title) && !forceRegenerate) {
    console.log(`\n⏩ "${idea.title}" already exists — skipping generation (use --force to override)`);
    return;
  }
  if (existingTitles.includes(idea.title) && forceRegenerate) {
    console.log(`\n🔄 "${idea.title}" exists but --force specified — regenerating story text`);
  }

  if (dryRun) {
    console.log('\n🏁 DRY RUN — would generate:');
    console.log(`  Title: ${idea.title}`);
    console.log(`  Source: ${idea.source}`);
    console.log(`  Synopsis: ${idea.synopsis.slice(0, 200)}...`);
    return;
  }

  // Step 2: Generate story text
  const story = await generateStoryText(idea);

  // Step 3: Append to constants
  const storyNum = appendToConstants(story);
  if (storyNum < 0) throw new Error('Failed to determine story number');

  // Create story output directories: exports/stories/<Name>_MMDDYYYY/{spotify,youtube,text}
  const storyDirs = createStoryDirs(story.title);
  console.log(`\n📁 Story folder: ${storyDirs.root}`);

  // Save story text
  fs.writeFileSync(path.join(storyDirs.text, 'story.json'), JSON.stringify({
    title: story.title, source: idea.source, synopsis: idea.synopsis,
    pages: story.pages, generatedAt: new Date().toISOString(), storyNumber: storyNum,
  }, null, 2));
  console.log(`  📝 Story text saved to ${storyDirs.text}/story.json`);

  // Step 4: Generate character descriptions (must come before podcast for voice assignment)
  generateCharacterDescriptions(story.title, storyDirs);

  // Step 5: Generate podcast MP3 (uses character_desc.json for voice assignment)
  generatePodcast(story.title, storyDirs);

  // Step 6: Generate illustrations + Kling clips.json
  if (!skipVideo) {
    generateIllustrationsAndKlingClips(story.title, storyDirs);
  } else {
    console.log('\n⏩ Skipping video generation (--skip-video)');
  }

  // Step 7: Seed to Firestore
  if (!skipSeed) {
    seedToFirestore(story.title, storyDirs);
  } else {
    console.log('\n⏩ Skipping Firestore seed (--skip-seed)');
  }

  // Step 8: Submit to Google Indexing
  if (!skipIndex) {
    submitToIndexing(story.title);
  }

  // Summary + daily report
  const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
  const safeTitle = story.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  const mp3Path = path.join(storyDirs.spotify, `${safeTitle}.mp3`);
  const videoDir = path.join(storyDirs.youtube, safeTitle);

  console.log('\n' + '═'.repeat(60));
  console.log('🎉 DAILY STORY PIPELINE COMPLETE');
  console.log('═'.repeat(60));
  console.log(`  📖 Title: ${story.title}`);
  console.log(`  📝 Pages: ${story.pages.length}`);
  console.log(`  ⏱️  Elapsed: ${elapsed} min`);
  console.log(`  📁 Story: ${storyDirs.root}`);
  console.log(`  🎙️  Podcast: ${mp3Path}`);
  if (!skipVideo) console.log(`  🎬 Video: ${videoDir}/`);
  console.log('═'.repeat(60));

  // Write daily report JSON
  const reportsDir = path.join(ROOT, 'exports', 'daily-reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    date: dateStr,
    timestamp: new Date().toISOString(),
    title: story.title,
    source: idea.source,
    synopsis: idea.synopsis,
    pages: story.pages.length,
    totalWords: story.pages.reduce((sum, p) => {
      const segs = p.segments || (Array.isArray(p) ? p : null);
      if (segs) return sum + segs.reduce((s, seg) => s + (seg.text || '').split(/\s+/).length, 0);
      return sum + (typeof p === 'string' ? p.split(/\s+/).length : 0);
    }, 0),
    elapsedMinutes: parseFloat(elapsed),
    storyNumber: storyNum,
    storyDir: storyDirs.root,
    files: {
      mp3: fs.existsSync(mp3Path) ? mp3Path : null,
      mp4: !skipVideo && fs.existsSync(path.join(videoDir, `${safeTitle}.mp4`)) ? path.join(videoDir, `${safeTitle}.mp4`) : null,
      videoDir: !skipVideo && fs.existsSync(videoDir) ? videoDir : null,
      srt: !skipVideo ? path.join(videoDir, `${safeTitle}.srt`) : null,
    },
    status: 'ready_for_review',
    uploaded: { spotify: false, youtube: false, firestore: !skipSeed },
  };

  const reportPath = path.join(reportsDir, `${dateStr}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📋 Daily report: ${reportPath}`);
  console.log('👀 Review the story, then give permission to upload to Spotify/YouTube.');
}

main().catch(e => {
  console.error(`\n💥 Pipeline failed: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
