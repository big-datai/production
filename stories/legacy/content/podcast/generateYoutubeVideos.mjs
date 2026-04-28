#!/usr/bin/env node

/**
 * Generate YouTube MP4 videos with per-page illustrations from Spotify MP3s.
 *
 * For each story:
 *   1. Generate a unique illustration per page using Gemini image generation
 *   2. Estimate page timing from word count ratios
 *   3. Build MP4 video that shows each page's illustration while audio plays
 *   4. Quality check: verify MP4 duration matches MP3 duration
 *
 * Output:
 *   exports/youtube/<story_name>/
 *     ├── <story_name>.mp4         (video)
 *     ├── <story_name>.mp3         (audio copy)
 *     ├── <story_name>.srt         (subtitles)
 *     ├── cover.png                (cover art)
 *     ├── character_desc.json      (character sheets as JSON array)
 *     ├── illustrations/           (per-page PNGs)
 *     └── clips/                   (Ken Burns video clips)
 *
 * Usage:
 *   node content/podcast/generateYoutubeVideos.mjs              # all stories
 *   node content/podcast/generateYoutubeVideos.mjs 1             # story #1 only
 *   node content/podcast/generateYoutubeVideos.mjs 1-3           # stories 1 through 3
 *   node content/podcast/generateYoutubeVideos.mjs "Aladdin"     # by title match
 *   node content/podcast/generateYoutubeVideos.mjs --images-only # generate images only (no video)
 *   node content/podcast/generateYoutubeVideos.mjs --force       # overwrite existing MP4s
 *   node content/podcast/generateYoutubeVideos.mjs --ken-burns    # legacy: use static zoom/pan instead of Kling (default is Kling)
 */

import { execSync } from "child_process";
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { PODCAST_STORIES } from "./podcastStoryConstants.js";
import { ANATOMY_RULES } from "./validateCharacterImages.mjs";
import { pageToText, pageToSegments, pagesToFullText } from './pageUtils.mjs';

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

// ── Config ──
const MP3_DIR = process.env.STORY_SPOTIFY_DIR || "exports/spotify";
const COVERS_DIR = process.env.STORY_SPOTIFY_DIR ? path.join(process.env.STORY_SPOTIFY_DIR, "covers") : "exports/spotify/covers";
const OUTPUT_DIR = process.env.STORY_YOUTUBE_DIR || "exports/youtube";
const VIDEO_SIZE = 1280; // square 1280x1280

const API_KEY = process.env.GEMINI_API_KEY?.replace(/"/g, "");
if (!API_KEY) {
  console.error("❌ No GEMINI_API_KEY found in .env.local");
  process.exit(1);
}

const IMAGE_MODEL = "gemini-2.5-flash-image";
const CHARACTERS_FILE = path.resolve(process.cwd(), 'assets', 'characters', 'recurringCharacters.json');
const DURATION_TOLERANCE = 2; // seconds — allowed diff for quality check

// ── Load recurring character registry ──
function loadRecurringCharacters() {
  try {
    if (!fs.existsSync(CHARACTERS_FILE)) return null;
    const registry = JSON.parse(fs.readFileSync(CHARACTERS_FILE, 'utf8'));
    return registry.characters || null;
  } catch { return null; }
}

// ── CLI args ──
const args = process.argv.slice(2);
const forceFlag = args.includes("--force");
const imagesOnly = args.includes("--images-only");
const charsOnly = args.includes("--chars-only");
const klingMode = !args.includes("--ken-burns"); // Kling is default, use --ken-burns for legacy static zoom/pan
const selectionArg = args.find((a) => !a.startsWith("--"));

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Helpers ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getAudioDuration = (filePath) => {
  return parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim()
  );
};

const safeTitle = (title) =>
  title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");

// ── Story selection ──
function selectStories() {
  if (!selectionArg) return PODCAST_STORIES.map((s, i) => ({ ...s, index: i }));

  // Range: "2-4"
  const rangeMatch = selectionArg.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const s = Number(rangeMatch[1]);
    const e = Number(rangeMatch[2]);
    return PODCAST_STORIES.slice(s - 1, Math.min(e, PODCAST_STORIES.length)).map((st, i) => ({ ...st, index: s - 1 + i }));
  }

  // Single number
  const n = Number(selectionArg);
  if (!Number.isNaN(n) && n >= 1 && n <= PODCAST_STORIES.length) {
    return [{ ...PODCAST_STORIES[n - 1], index: n - 1 }];
  }

  // Title search
  const needle = selectionArg.toLowerCase();
  const idx = PODCAST_STORIES.findIndex((s) => s.title.toLowerCase().includes(needle));
  if (idx >= 0) return [{ ...PODCAST_STORIES[idx], index: idx }];

  console.error(`❌ No story matching "${selectionArg}"`);
  process.exit(1);
}

// ── Image generation ──
// referenceImagePaths: optional path(s) to character reference images for visual consistency
// Can be a single string or an array of paths (max 3 for gemini-2.5-flash-image)
async function generateImage(prompt, outputPath, label, referenceImagePaths) {
  if (fs.existsSync(outputPath)) {
    console.log(`      💾 Cached: ${label}`);
    return outputPath;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${API_KEY}`;

  // Normalize to array
  const refPaths = !referenceImagePaths ? [] :
    Array.isArray(referenceImagePaths) ? referenceImagePaths : [referenceImagePaths];
  const validRefs = refPaths.filter(p => p && fs.existsSync(p)).slice(0, 3); // max 3 input images

  // Build parts: reference images + text prompt
  const parts = [];
  if (validRefs.length > 0) {
    for (const refPath of validRefs) {
      const imgBytes = fs.readFileSync(refPath);
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: imgBytes.toString("base64"),
        },
      });
    }
    const refLabel = validRefs.length === 1
      ? "Above is the CHARACTER REFERENCE IMAGE"
      : `Above are ${validRefs.length} CHARACTER REFERENCE IMAGES`;
    parts.push({ text: `${refLabel} showing exactly how each character must look. Match their appearance (face, fur/hair, clothing, colors) precisely in the new illustration.\n\n${prompt}` });
  } else {
    parts.push({ text: prompt });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 429) {
          console.log(`      ⏳ Rate limited, waiting 60s (attempt ${attempt + 1}/5)...`);
          await sleep(60000);
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
      }

      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));

      if (!imagePart) {
        const textPart = parts.find(p => p.text);
        const finishReason = data.candidates?.[0]?.finishReason;
        console.log(`      ⚠️ No image in response for ${label}, retrying... (reason: ${finishReason || 'unknown'}${textPart ? ', text: ' + textPart.text.slice(0, 100) : ''})`);
        await sleep(5000);
        continue;
      }

      const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
      fs.writeFileSync(outputPath, imageBuffer);
      console.log(`      🎨 Generated: ${label}`);
      return outputPath;
    } catch (err) {
      console.error(`      ❌ Attempt ${attempt + 1}/5 failed: ${err.message}`);
      if (attempt < 4) await sleep(10000);
    }
  }

  console.error(`      ❌ FAILED to generate: ${label}`);
  return null;
}

// ── Consistent illustration style ──
// All stories share the same art direction so the channel looks cohesive.
const ART_STYLE = [
  "Style: Hand-painted watercolor children's book illustration.",
  "Warm golden lighting with soft shadows. Dreamy, magical atmosphere.",
  "Color palette: Rich but gentle — soft blues, warm golds, muted greens, rosy pinks.",
  "Character style: Round, expressive faces with big eyes, soft features, slightly stylized proportions.",
  "Background: Detailed but not cluttered, with soft bokeh or watercolor wash edges.",
  "Mood: Cozy, enchanting, perfect for bedtime. Safe and inviting for ages 3-8.",
  "CHILD-SAFE REQUIREMENT: Every character MUST be fully and modestly clothed at all times — shirts, dresses, tunics, cloaks, etc. No bare chests, no exposed torsos, no nudity of any kind. Mermaids wear seashell tops or flowing blouses. Animals that are characters (bears, wolves, foxes) must look like ANIMALS, not humans — four legs, fur, snouts, animal proportions. Do NOT draw animals as humans in costumes.",
  "Square format (1:1 aspect ratio). Absolutely NO text, letters, words, or writing anywhere in the image.",
].join(" ");

// ── Character description extraction (JSON structured output) ──
// Returns parsed array: [{name, species, age, body, face, hair, skin, outfit, features}, ...]
async function getCharacterDescription(story) {
  const name = safeTitle(story.title);
  const storyDir = path.join(OUTPUT_DIR, name);
  const jsonPath = path.join(storyDir, "character_desc.json");
  const oldTxtPath = path.join(storyDir, "character_desc.txt");

  // Use cached JSON if valid
  if (fs.existsSync(jsonPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      if (Array.isArray(cached) && cached.length > 0 && cached[0].name) {
        console.log(`   👤 Cached character descriptions (${cached.length} characters: ${cached.map(c => c.name).join(", ")})`);
        return cached;
      }
    } catch { /* corrupted cache, regenerate */ }
    fs.unlinkSync(jsonPath);
  }

  // Delete old .txt so we regenerate as JSON
  if (fs.existsSync(oldTxtPath)) {
    console.log(`   ⚠️ Found old character_desc.txt — regenerating as JSON...`);
    fs.unlinkSync(oldTxtPath);
  }

  const fullText = pagesToFullText(story.pages).slice(0, 6000);
  // Extract all unique speaker names from story segments (these are the EXACT names to use)
  const speakers = new Set();
  for (const page of story.pages) {
    for (const seg of pageToSegments(page)) {
      if (seg.speaker && seg.speaker !== 'Narrator') speakers.add(seg.speaker);
    }
  }
  const speakerList = [...speakers];
  const speakerBlock = speakerList.length > 0
    ? `\nIMPORTANT: The story uses these EXACT character names (use these names, NOT generic titles):\n${speakerList.map(s => `- ${s}`).join('\n')}\n`
    : '';

  const MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"];
  const MAX_DESC_ATTEMPTS = 4; // 1-2: flash+story, 3: flash title-only, 4: pro title-only
  let useStoryText = true; // flip to false after PROHIBITED_CONTENT

  for (let attempt = 1; attempt <= MAX_DESC_ATTEMPTS; attempt++) {
    const model = (attempt <= 2 || attempt === 3) ? MODELS[0] : MODELS[1];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    const storyBlock = useStoryText
      ? `\nStory: "${story.title}"\n"${fullText}"\n`
      : `\nStory title: "${story.title}"\n${speakerBlock}(Create character sheets for ALL characters listed above.)\n`;

    const body = {
      contents: [{
        parts: [{
          text: `You are a character design lead for a children's picture book (ages 3-8). From this COMPLETE story, create DETAILED CHARACTER SHEETS for EVERY character who appears — heroes, villains, sidekicks, animals, parents, magical creatures, EVERYONE.

IMPORTANT RULES FOR ANIMAL CHARACTERS: If the character is an ANIMAL (bear, wolf, fox, duck, hen, etc.), they MUST be drawn as a REAL ANIMAL with animal body, fur/feathers, snout/beak, four legs or wings. NOT as a human in a costume.

IMPORTANT: EVERY character MUST be fully and modestly dressed — no bare chests, no exposed skin. Mermaids wear seashell tops or flowing blouses.

Return ONLY a JSON array. No markdown, no explanation, ONLY the JSON array:
[
  {
    "name": "Character name exactly as used in the story",
    "species": "Human / Mallard Duck / Gray Wolf / etc.",
    "age": "8-year-old girl / elderly wolf / young adult man",
    "body": "Small and slender with...",
    "face": "Eye color, eye shape, nose, mouth, expression details",
    "hair": "Exact color, length, style, texture of hair or fur",
    "skin": "Exact skin tone or fur color, be very specific",
    "outfit": "Exact clothing with colors and details",
    "features": "Distinctive features: curly tail, round glasses, etc."
  }
]

Be EXTREMELY specific — an illustrator must draw the EXACT SAME character identically in every scene. If two characters are similar, describe what makes each VISUALLY DISTINCT.
${speakerBlock}${storyBlock}
CRITICAL: The "name" field MUST match the EXACT character names listed above. Do NOT use generic titles like "The King" if the story uses "King Philip".

JSON array:`
        }]
      }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    };

    try {
      console.log(`   👤 Generating character descriptions (attempt ${attempt}/${MAX_DESC_ATTEMPTS}, model: ${model})...`);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // Debug: log raw response on failure
      if (!text) {
        const finishReason = data.candidates?.[0]?.finishReason;
        const blockReason = data.promptFeedback?.blockReason;
        console.log(`   🔍 Empty response — finishReason: ${finishReason}, blockReason: ${blockReason}`);
        // PROHIBITED_CONTENT = hard policy block on story text → switch to title-only
        if (blockReason === "PROHIBITED_CONTENT" && useStoryText) {
          console.log(`   🔄 Story text blocked by content filter — switching to title-only mode...`);
          useStoryText = false;
          continue; // don't count as a wasted attempt
        }
      }

      let characters;
      try {
        characters = JSON.parse(text);
      } catch (parseErr) {
        const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) {
          characters = JSON.parse(jsonMatch[0]);
        } else {
          console.log(`   🔍 Parse failed: ${parseErr.message}. First 300 chars: ${text.slice(0, 300)}`);
        }
      }

      if (Array.isArray(characters) && characters.length > 0 && characters[0].name) {
        // Merge with recurring characters: detect recurring names in the story
        const recurringPool = loadRecurringCharacters();
        if (recurringPool) {
          const storyText = pagesToFullText(story.pages).toLowerCase();
          const detectedRecurring = [];
          for (const rc of recurringPool) {
            if (storyText.includes(rc.name.toLowerCase())) {
              // Check if Gemini already generated a matching entry
              const alreadyGenerated = characters.some(c => c.name.toLowerCase() === rc.name.toLowerCase());
              if (!alreadyGenerated) {
                detectedRecurring.push({
                  name: rc.name, species: rc.species, age: rc.age, body: rc.body,
                  face: rc.face, hair: rc.hair, skin: rc.skin, outfit: rc.outfit,
                  features: rc.features, recurring: true,
                });
              } else {
                // Replace Gemini's version with canonical recurring version
                const idx = characters.findIndex(c => c.name.toLowerCase() === rc.name.toLowerCase());
                if (idx >= 0) {
                  characters[idx] = {
                    name: rc.name, species: rc.species, age: rc.age, body: rc.body,
                    face: rc.face, hair: rc.hair, skin: rc.skin, outfit: rc.outfit,
                    features: rc.features, recurring: true,
                  };
                }
              }
            }
          }
          if (detectedRecurring.length > 0) {
            characters = [...detectedRecurring, ...characters];
            console.log(`   🔄 Merged ${detectedRecurring.length} recurring character(s): ${detectedRecurring.map(c => c.name).join(", ")}`);
          }
        }

        // Post-process: rename generic titles to proper names for content filter safety
        const genericNameMap = {
          'The Beast': 'Barnaby', 'The Witch': 'Griselda', 'The Monster': 'Grendel',
          'The Giant': 'Thaddeus', 'The Dragon': 'Ember', 'The Wolf': 'Wolfgang',
          'The Ogre': 'Brutus', 'The Troll': 'Grumbold', 'The Goblin': 'Snick',
          'The Sorcerer': 'Malachar', 'The Enchantress': 'Morgana',
          'The Evil Queen': 'Queen Ravenna', 'The Wicked Stepmother': 'Stepmother Helena',
          'The Merchant': 'Papa Maurice', 'The Prince': 'Prince Alistair',
          'The King': 'King Edmund', 'The Queen': 'Queen Elara',
          'The Fairy Godmother': 'Fairy Godmother Iris',
        };
        for (const c of characters) {
          if (genericNameMap[c.name]) {
            const oldName = c.name;
            c.name = genericNameMap[c.name];
            if (c.species?.toLowerCase().includes('beast') || c.species?.toLowerCase().includes('monster')) {
              c.species = 'friendly fantasy creature';
            }
            if (c.features) c.features += ' Children\'s storybook illustration style.';
            else c.features = 'Children\'s storybook illustration style.';
            console.log(`   🏷️  Renamed "${oldName}" → "${c.name}" (content filter safety)`);
          }
        }

        fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
        fs.writeFileSync(jsonPath, JSON.stringify(characters, null, 2));
        console.log(`   👤 Character descriptions (${characters.length} characters: ${characters.map(c => c.name).join(", ")})`);
        return characters;
      }

      console.log(`   ⚠️ Attempt ${attempt}/${MAX_DESC_ATTEMPTS}: Response not valid JSON array — ${attempt < MAX_DESC_ATTEMPTS ? "retrying..." : "FAILED"}`);
      await sleep(2000);
    } catch (err) {
      console.log(`   ⚠️ Attempt ${attempt}/${MAX_DESC_ATTEMPTS}: ${err.message}`);
      if (attempt === MAX_DESC_ATTEMPTS) {
        throw new Error(`Failed to generate character descriptions after ${MAX_DESC_ATTEMPTS} attempts for "${story.title}"`);
      }
      await sleep(2000);
    }
  }

  throw new Error(`Character description generation failed for "${story.title}"`);
}

// ── Parse character names from structured JSON data ──
function parseCharacterNames(charDesc) {
  if (!charDesc) return [];
  // New JSON format: charDesc is an array of character objects
  if (Array.isArray(charDesc)) return charDesc.map(c => c.name).filter(Boolean);
  return [];
}

// ── Anatomy rule lookup — maps species text to canonical key ──
function resolveAnatomyKey(speciesText) {
  const s = speciesText.toLowerCase();
  if (/mermaid|merman/i.test(s)) return "mermaid";
  if (/puppet|wooden/i.test(s)) return "puppet";
  if (/enchant|witch|sorcer/i.test(s)) return "enchantress";
  if (/wolf/i.test(s)) return "wolf";
  if (/bear/i.test(s)) return "bear";
  if (/cat/i.test(s)) return "cat";
  if (/dog|sheepdog/i.test(s)) return "dog";
  if (/fox/i.test(s)) return "fox";
  if (/rabbit|bunny|hare\b/i.test(s)) return "rabbit";
  if (/mouse|field\s*mouse/i.test(s)) return "mouse";
  if (/frog|toad/i.test(s)) return "frog";
  if (/pig|boar/i.test(s)) return "pig";
  if (/horse/i.test(s)) return "horse";
  if (/donkey/i.test(s)) return "donkey";
  if (/cow/i.test(s)) return "cow";
  if (/duck|duckling/i.test(s)) return "duck";
  if (/swan/i.test(s)) return "swan";
  if (/hen|chicken|rooster|cockerel/i.test(s)) return "hen";
  if (/cricket|insect/i.test(s)) return "cricket";
  if (/tortoise|turtle/i.test(s)) return "tortoise";
  if (/squirrel/i.test(s)) return "squirrel";
  if (/bird|bluebird|robin|parrot|sparrow|crow|raven|owl|eagle|hawk/i.test(s)) return "bird";
  if (/human/i.test(s)) return "human";
  return "human";
}

// ── Build anatomy enforcement string for image generation prompt ──
function getAnatomyPromptRules(species, charName) {
  const key = resolveAnatomyKey(species);
  const rules = ANATOMY_RULES[key];
  if (!rules) return "";
  const lines = [`STRICT ANATOMY for ${charName} (${rules.species}):`];
  if (rules.arms !== undefined) lines.push(`  - Exactly ${rules.arms} arms`);
  if (rules.hands !== undefined) lines.push(`  - Exactly ${rules.hands} hands, each with ${rules.fingers_per_hand || 5} fingers`);
  if (rules.legs !== undefined) lines.push(`  - Exactly ${rules.legs} legs`);
  if (rules.paws !== undefined) lines.push(`  - Exactly ${rules.paws} paws`);
  if (rules.hooves !== undefined) lines.push(`  - Exactly ${rules.hooves} hooves`);
  if (rules.feet !== undefined) lines.push(`  - Exactly ${rules.feet} feet`);
  if (rules.eyes !== undefined) lines.push(`  - Exactly ${rules.eyes} eyes`);
  if (rules.ears !== undefined) lines.push(`  - Exactly ${rules.ears} ears`);
  if (rules.tail !== undefined) lines.push(`  - Tail: ${rules.tail === false ? "NONE" : rules.tail}`);
  if (rules.wings !== undefined) lines.push(`  - Wings: ${rules.wings === false ? "NONE" : rules.wings}`);
  if (rules.antennae) lines.push(`  - Antennae: ${rules.antennae}`);
  lines.push(`  - ${rules.notes}`);
  return lines.join("\n");
}

// ── Quick anatomy validation using Gemini Vision (text model = cheap) ──
async function quickValidateCharImage(imagePath, charName, species) {
  const key = resolveAnatomyKey(species);
  const rules = ANATOMY_RULES[key];
  if (!rules) return { pass: true };

  const imgBytes = fs.readFileSync(imagePath);
  const base64 = imgBytes.toString("base64");

  const checkItems = [];
  if (rules.arms !== undefined) checkItems.push(`arms: expected ${rules.arms}`);
  if (rules.hands !== undefined) checkItems.push(`hands: expected ${rules.hands}`);
  if (rules.legs !== undefined) checkItems.push(`legs: expected ${rules.legs}`);
  if (rules.paws !== undefined) checkItems.push(`paws: expected ${rules.paws}`);
  if (rules.hooves !== undefined) checkItems.push(`hooves: expected ${rules.hooves}`);
  if (rules.feet !== undefined) checkItems.push(`feet: expected ${rules.feet}`);
  if (rules.eyes !== undefined) checkItems.push(`eyes: expected ${rules.eyes}`);
  if (rules.tail !== undefined) checkItems.push(`tail: ${rules.tail === false ? "none" : rules.tail}`);
  if (rules.wings !== undefined) checkItems.push(`wings: ${rules.wings === false ? "none" : rules.wings}`);

  const prompt = `Count the body parts of the character in this image. This is "${charName}" (${species}).

Expected: ${checkItems.join(", ")}

Count CAREFULLY. Respond ONLY with JSON:
{"pass": true/false, "counted": {"arms": N, "hands": N, "legs": N, "paws": N, "eyes": N, "tail": N}, "issues": ["list of problems or empty"]}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: "image/png", data: base64 } },
          { text: prompt },
        ]}],
        generationConfig: { temperature: 0.1 },
      }),
    });
    if (!res.ok) return { pass: true }; // don't block on API errors
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { pass: true };
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { pass: true }; // fail-open: don't block generation on validation errors
  }
}

// ── Quick page illustration validation using Gemini Vision ──
// Checks: no text/letters in image, characters have correct anatomy, scene matches direction.
async function quickValidatePageImage(imagePath, pageNum, sceneCharNames, charDesc) {
  const imgBytes = fs.readFileSync(imagePath);
  const base64 = imgBytes.toString("base64");

  // Build character anatomy expectations
  const charChecks = sceneCharNames.map(cn => {
    const charObj = Array.isArray(charDesc) ? charDesc.find(c => c.name.toLowerCase().includes(cn.toLowerCase()) || cn.toLowerCase().includes(c.name.toLowerCase())) : null;
    const sp = charObj?.species || "Human";
    const key = resolveAnatomyKey(sp);
    const rules = ANATOMY_RULES[key];
    if (!rules) return `${cn}: human, 2 arms, 2 legs, 2 hands`;
    const parts = [];
    if (rules.arms !== undefined) parts.push(`${rules.arms} arms`);
    if (rules.legs !== undefined) parts.push(`${rules.legs} legs`);
    if (rules.hands !== undefined) parts.push(`${rules.hands} hands`);
    if (rules.paws !== undefined) parts.push(`${rules.paws} paws`);
    if (rules.wings !== undefined) parts.push(`wings: ${rules.wings === false ? "none" : rules.wings}`);
    return `${cn} (${sp}): ${parts.join(", ")}`;
  }).join("\n");

  const prompt = `Evaluate this children's book illustration (page ${pageNum}). Check for CRITICAL ISSUES ONLY:

1. TEXT/WRITING: Are there any letters, words, or text visible in the image? (should be NONE)
2. ANATOMY: Do characters have the correct number of limbs?
${charChecks ? "Expected:\n" + charChecks + "\n" : ""}
3. GROTESQUE: Is anything scary, disturbing, or inappropriate for ages 3-8?
4. EXTRA LIMBS: Does ANY character have extra fingers (>5 per hand), extra arms (>2 for humans), or extra legs?

Respond ONLY with JSON:
{"pass": true/false, "issues": ["list of critical problems or empty"]}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: "image/png", data: base64 } },
          { text: prompt },
        ]}],
        generationConfig: { temperature: 0.1 },
      }),
    });
    if (!res.ok) return { pass: true };
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { pass: true };
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { pass: true }; // fail-open
  }
}

// ── Individual character reference images ──
// Generates ONE ISOLATED IMAGE per character, stored in illustrations/characters/.
// After generation, validates anatomy with cheap Vision model. Retries up to 2x on failure.
// Characters are the FOUNDATION — if a character fails, the entire job fails.
// Returns a Map<characterName, imagePath> for per-scene injection.
async function generateIndividualCharacterImages(story, charDesc) {
  const name = safeTitle(story.title);
  const charsDir = path.join(OUTPUT_DIR, name, "illustrations", "characters");
  fs.mkdirSync(charsDir, { recursive: true });

  if (!charDesc) throw new Error(`No character description for "${story.title}" — cannot generate character images`);

  const characterNames = parseCharacterNames(charDesc);
  if (characterNames.length === 0) {
    throw new Error(`Parsed 0 characters from character_desc.json for "${story.title}" — regenerate with --force.`);
  }
  const charImages = new Map();

  console.log(`   🎨 Generating ${characterNames.length} individual character images...`);

  // Build a map of recurring character avatar paths for reuse
  const recurringAvatarMap = new Map();
  const recurringPool = loadRecurringCharacters();
  if (recurringPool) {
    for (const rc of recurringPool) {
      const avatarPath = path.resolve(process.cwd(), rc.avatarPath);
      if (fs.existsSync(avatarPath)) {
        recurringAvatarMap.set(rc.name.toLowerCase(), avatarPath);
      }
    }
  }

  for (const charName of characterNames) {
    const safeName = charName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const imgPath = path.join(charsDir, `${safeName}.png`);

    // Check if this is a recurring character with a canonical avatar
    const charObj0 = Array.isArray(charDesc) ? charDesc.find(c => c.name.toLowerCase() === charName.toLowerCase()) : null;
    if (charObj0?.recurring && recurringAvatarMap.has(charName.toLowerCase())) {
      const canonicalAvatar = recurringAvatarMap.get(charName.toLowerCase());
      if (!fs.existsSync(imgPath)) {
        fs.copyFileSync(canonicalAvatar, imgPath);
        console.log(`      🔄 Reused recurring avatar for ${charName}`);
      } else {
        console.log(`      💾 Cached recurring avatar for ${charName}`);
      }
      charImages.set(charName, imgPath);
      continue;
    }

    // Get this character's description block
    const charBlock = getRelevantCharDesc(charDesc, [charName]);
    if (!charBlock) {
      console.log(`      ⚠️ No char block found for "${charName}", skipping`);
      continue;
    }

    // Extract species from JSON data
    const charObj = Array.isArray(charDesc) ? charDesc.find(c => c.name.toLowerCase().includes(charName.toLowerCase()) || charName.toLowerCase().includes(c.name.toLowerCase())) : null;
    const species = charObj?.species || "";
    const isAnimal = /bear|wolf|fox|duck|hen|rooster|cockerel|pig|cat|dog|rabbit|hare|mouse|frog|horse|cow|duckling|swan|tortoise|turtle|squirrel|bird|parrot|crow|raven|owl|donkey/i.test(species);

    const animalRule = isAnimal
      ? `CRITICAL: ${charName} is a ${species}. Draw as a REAL ANIMAL with animal body, fur/feathers, snout/beak, paws/hooves, animal proportions. NOT a human in a costume. NOT a humanoid. A real ${species}.`
      : "";

    // Get specific anatomy rules for this species
    const anatomyRules = getAnatomyPromptRules(species, charName);

    // Two prompt variants: attempt 1 = standard, attempt 2 = reworded with emphasis on anatomy
    const prompts = [
      `Create a SINGLE CHARACTER PORTRAIT of "${charName}" for a children's picture book.

Draw ONLY this ONE character, standing alone against a plain light cream background. Show the FULL BODY from head to toe/paws, facing slightly to the side (3/4 view) so both face and body are clearly visible.

${animalRule}

${anatomyRules}

Character details:
${charBlock}

IMPORTANT:
- This is a reference image — show the character clearly so illustrators can match them exactly in every scene.
- ONLY this character in the image. No other characters, no background scenery.
- Fully and modestly clothed. No bare skin.
- Plain cream/white background.
- COUNT LIMBS CAREFULLY: the anatomy rules above are STRICT. Do not add or remove any body parts.

${ART_STYLE}`,
      // Reworded attempt 2: simpler, stronger anatomy focus
      `Children's picture book character sheet for "${charName}".

Draw this character ALONE on a plain white background. Full body visible, 3/4 angle.

${animalRule}

ANATOMY IS CRITICAL — the previous attempt had wrong body parts. Pay EXTRA attention:
${anatomyRules}

Visual description:
${charBlock}

Rules:
- ONE character only, no scenery, no other characters
- Fully clothed, modest, child-safe
- CAREFULLY count every limb before finalizing
- White/cream background

${ART_STYLE}`,
    ];

    // Generate + validate loop (max 2 attempts — characters are foundation, must be right)
    const MAX_ATTEMPTS = 2;
    let validated = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const prompt = prompts[attempt - 1];
      // Delete cached image on retry
      if (attempt > 1 && fs.existsSync(imgPath)) {
        fs.unlinkSync(imgPath);
        console.log(`      🔄 Retry ${attempt}/${MAX_ATTEMPTS} for ${charName}...`);
      }

      const result = await generateImage(prompt, imgPath, `${story.title} — character: ${charName}`);
      if (!result) {
        throw new Error(`Failed to generate character image for "${charName}" in "${story.title}" — image generation returned null. Characters are the foundation, cannot continue.`);
      }

      // Validate with cheap vision model
      const validation = await quickValidateCharImage(imgPath, charName, species);
      if (validation.pass) {
        console.log(`      ✅ Anatomy check passed for ${charName}`);
        charImages.set(charName, result);
        validated = true;
        break;
      } else {
        const issues = validation.issues?.join(", ") || "unknown";
        console.log(`      ❌ Anatomy check FAILED (attempt ${attempt}/${MAX_ATTEMPTS}): ${issues}`);
      }
      await sleep(2000);
    }

    if (!validated) {
      throw new Error(`Character "${charName}" failed anatomy validation after ${MAX_ATTEMPTS} attempts for "${story.title}". Characters are the foundation — cannot build story with bad character images.`);
    }

    // Small delay between character generations
    if (characterNames.indexOf(charName) < characterNames.length - 1) await sleep(2000);
  }

  if (charImages.size === 0) {
    throw new Error(`0 character images created for "${story.title}" — all ${characterNames.length} characters were skipped or failed. Characters are the foundation, cannot continue.`);
  }

  console.log(`   ✅ ${charImages.size}/${characterNames.length} character images created`);
  return charImages;
}

// ── Get reference image paths for characters in a scene ──
function getCharImagePaths(charImages, characterNames) {
  if (!charImages || !characterNames?.length) return [];
  const paths = [];
  for (const cn of characterNames) {
    // Find the matching character image (fuzzy match like getRelevantCharDesc)
    for (const [name, imgPath] of charImages) {
      if (name.toLowerCase().includes(cn.toLowerCase()) || cn.toLowerCase().includes(name.toLowerCase())) {
        paths.push(imgPath);
        break;
      }
    }
  }
  return paths;
}

// ── Scene directions ──
// Single API call to generate a visual "camera direction" for every page.
// Returns an array of { direction, characters } per page.
async function generateSceneDirections(story) {
  const name = safeTitle(story.title);
  const storyDir = path.join(OUTPUT_DIR, name);
  const directionsPath = path.join(storyDir, "scene_directions.json");

  // Cache
  if (fs.existsSync(directionsPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(directionsPath, "utf8"));
      if (cached.length === story.pages.length) {
        console.log(`   💾 Scene directions cached (${cached.length} pages)`);
        return cached;
      }
    } catch { /* regenerate */ }
  }

  const pagesBlock = story.pages.map((p, i) =>
    `PAGE ${i + 1}: ${pageToText(p).slice(0, 400)}`
  ).join("\n\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{
      parts: [{
        text: `You are a storyboard director for a children's picture book (ages 3-8). For each page of this story, write a SINGLE visual direction that an illustrator will follow.

RULES:
- Each direction must describe ONE specific MOMENT OF ACTION — a character DOING something (swimming, reaching, gasping, hiding, running, hugging, climbing, crying, singing, etc.)
- Describe the CAMERA ANGLE and COMPOSITION (close-up of face, wide shot of landscape, over-the-shoulder view, bird's-eye view, etc.) — VARY these across pages for visual interest.
- Name ONLY the 1-2 characters visible in this specific scene. Do NOT include characters who aren't in this passage.
- Describe the SETTING/ENVIRONMENT briefly (underwater cave, moonlit beach, stormy sea, cozy library).
- Keep each direction to 1-2 sentences MAX. Be specific and visual.
- NEVER describe characters "posing", "standing together", or "facing the viewer". Every image must show STORY ACTION.
- Make each page visually DIFFERENT from the others — vary angles, distances, lighting, and number of characters.

Return ONLY a JSON array with exactly ${story.pages.length} objects, one per page:
[{"direction": "Wide shot: Marina bursts through the ocean surface for the first time, arms outstretched, water droplets flying, sunset sky filling the background.", "characters": ["Marina"]}, ...]

Story: "${story.title}"

${pagesBlock}

Return the JSON array:`
      }]
    }],
    generationConfig: { temperature: 0.7 },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    // Extract JSON from response (may be wrapped in ```json blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in response");
    const directions = JSON.parse(jsonMatch[0]);
    if (directions.length !== story.pages.length) {
      console.log(`   ⚠️ Got ${directions.length} directions for ${story.pages.length} pages — using what we have`);
    }
    fs.mkdirSync(path.dirname(directionsPath), { recursive: true });
    fs.writeFileSync(directionsPath, JSON.stringify(directions, null, 2));
    console.log(`   🎬 Scene directions generated (${directions.length} pages)`);
    return directions;
  } catch (err) {
    console.log(`   ⚠️ Could not generate scene directions: ${err.message}`);
    return null;
  }
}

// ── Format character descriptions for image prompts ──
function getRelevantCharDesc(charDesc, characterNames) {
  if (!charDesc || !characterNames?.length) return "";
  if (!Array.isArray(charDesc)) return "";

  const relevant = charDesc.filter(c => {
    const cn = c.name.toLowerCase();
    return characterNames.some(n => cn.includes(n.toLowerCase()) || n.toLowerCase().includes(cn));
  });

  return relevant.map(c =>
    `${c.name} (${c.species}):\n` +
    `  Age: ${c.age}\n` +
    `  Body: ${c.body}\n` +
    `  Face: ${c.face}\n` +
    `  Hair/Fur: ${c.hair}\n` +
    `  Skin/Color: ${c.skin}\n` +
    `  Outfit: ${c.outfit}\n` +
    `  Distinctive: ${c.features}`
  ).join("\n\n");
}

// ── Generate per-page illustrations for a story ──
async function generateStoryIllustrations(story) {
  const name = safeTitle(story.title);
  const storyDir = path.join(OUTPUT_DIR, name, "illustrations");
  fs.mkdirSync(storyDir, { recursive: true });

  // Step 1: Get text character descriptions
  const charDesc = await getCharacterDescription(story);

  // Step 2: Generate INDIVIDUAL character reference images (one per character)
  const charImages = await generateIndividualCharacterImages(story, charDesc);

  // --chars-only: stop after generating character images
  if (charsOnly) {
    console.log(`   ⏩ --chars-only: stopping after character images`);
    return [];
  }

  // Step 3: Generate scene directions for all pages (1 API call)
  const sceneDirections = await generateSceneDirections(story);

  const imagePaths = [];

  // Cover image for intro (use existing Spotify cover)
  const coverPath = path.join(COVERS_DIR, `${name}.png`);
  if (fs.existsSync(coverPath)) {
    imagePaths.push(coverPath);
  } else {
    // Generate an intro image using main character ref
    const introPath = path.join(storyDir, "intro.png");
    const mainCharName = parseCharacterNames(charDesc)[0];
    const introRefs = mainCharName ? getCharImagePaths(charImages, [mainCharName]) : [];
    const introCharBlock = charDesc ? `\nCharacter appearance (use for visual reference ONLY):\n${getRelevantCharDesc(charDesc, [mainCharName || story.title.split(" ")[0]])}\n` : "";
    const result = await generateImage(
      `Create an opening illustration for the children's bedtime story "${story.title}". ` +
      `Show the main character in their world — an establishing scene with action or atmosphere (exploring, arriving, dreaming). ` +
      `NOT a posed portrait. Match the character's appearance from the reference image precisely. ${introCharBlock}${ART_STYLE}`,
      introPath,
      `${story.title} — intro`,
      introRefs
    );
    imagePaths.push(result || coverPath);
  }

  // Per-page illustrations — each one receives ONLY the character images for that scene
  for (let i = 0; i < story.pages.length; i++) {
    const pageText = pageToText(story.pages[i]);
    const pagePath = path.join(storyDir, `page_${String(i + 1).padStart(3, "0")}.png`);

    // Get scene direction (or fall back to sanitized text)
    const direction = sceneDirections?.[i];
    const sceneCharNames = direction?.characters || [];

    // Get ONLY the character descriptions relevant to this scene
    const relevantCharDesc = getRelevantCharDesc(charDesc, sceneCharNames);
    const charBlock = relevantCharDesc
      ? `\nCharacter appearance (match the reference images — same face, fur/hair, clothing, colors):\n${relevantCharDesc}\n`
      : "";

    // Get the individual character reference images for THIS scene only (max 3)
    const sceneRefPaths = getCharImagePaths(charImages, sceneCharNames);

    // Sanitize scene text: soften words that trigger safety filters
    let sanitized = pageText
      .split(/[.!?]+/).slice(0, 4).join(". ").slice(0, 400)
      .replace(/\b(wicked|evil|cruel|poison|kill|death|die|dead|hunt|huntsman|slay|slaughter|blood|sword|knife|dagger|attack|destroy|stab|choke|curse|frightened|terrified|distress|imprisoned|locked away)\b/gi,
        (m) => ({ wicked: "jealous", evil: "villainous", cruel: "unkind", poison: "enchanted", kill: "defeat",
          death: "ending", die: "fall asleep", dead: "asleep", hunt: "search", huntsman: "woodsman",
          slay: "stop", slaughter: "stop", blood: "magic", sword: "wand", knife: "tool",
          dagger: "wand", attack: "confront", destroy: "undo", stab: "touch", choke: "hold",
          curse: "spell", frightened: "worried", terrified: "surprised", distress: "concern",
          imprisoned: "alone in a room", 'locked away': "waiting" }[m.toLowerCase()] || m));

    // Replace generic character names with proper names from character_desc.json
    // This avoids content filter triggers like "The Beast gave a flower"
    const charNameMap = {};
    if (Array.isArray(charDesc)) {
      // Build map from story speaker names to character_desc names
      const storyCharNames = new Set();
      if (story.pages[i]?.segments) story.pages[i].segments.forEach(s => storyCharNames.add(s.speaker));
      // Check if any charDesc name differs from the story speaker name (was renamed)
      for (const c of charDesc) {
        // Try to find the original generic name this was renamed from
        for (const [generic, proper] of Object.entries({
          'The Beast': 'Barnaby', 'The Witch': 'Griselda', 'The Monster': 'Grendel',
          'The Giant': 'Thaddeus', 'The Dragon': 'Ember', 'The Wolf': 'Wolfgang',
          'The Ogre': 'Brutus', 'The Troll': 'Grumbold', 'The Goblin': 'Snick',
          'The Sorcerer': 'Malachar', 'The Enchantress': 'Morgana',
          'The Merchant': 'Papa Maurice', 'The Prince': 'Prince Alistair',
          'The King': 'King Edmund', 'The Queen': 'Queen Elara',
          'The Fairy Godmother': 'Fairy Godmother Iris',
        })) {
          if (c.name === proper) charNameMap[generic] = proper;
        }
      }
    }
    for (const [generic, proper] of Object.entries(charNameMap)) {
      sanitized = sanitized.replace(new RegExp(generic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), proper);
    }

    // Use scene direction if available, otherwise fall back to sanitized text
    const visualDirection = direction?.direction || sanitized;

    // Build species reminders + anatomy rules for characters in this scene
    const speciesReminders = sceneCharNames.map(cn => {
      const charObj = Array.isArray(charDesc) ? charDesc.find(c => c.name.toLowerCase().includes(cn.toLowerCase()) || cn.toLowerCase().includes(c.name.toLowerCase())) : null;
      if (!charObj?.species) return null;
      const sp = charObj.species;
      const anatomyPrompt = getAnatomyPromptRules(sp, cn);
      if (/bear|wolf|fox|duck|hen|rooster|cockerel|pig|duckling|swan|bird|donkey|cat|dog|rabbit|hare|mouse|frog|horse|cow|tortoise|turtle|squirrel|crow|raven|owl/i.test(sp)) {
        return `${cn} is a ${sp} — draw as a REAL ANIMAL with animal body.\n${anatomyPrompt}`;
      }
      return anatomyPrompt || null;
    }).filter(Boolean).join("\n");

    const prompt = `Illustrate this SPECIFIC MOMENT for a children's picture book ("${story.title}", page ${i + 1}/${story.pages.length}):

SCENE DIRECTION: ${visualDirection}

Story context: ${sanitized}

RULES:
- Draw EXACTLY what the scene direction describes — the action, camera angle, and specific characters.
- Show ${sceneCharNames.length > 0 ? sceneCharNames.join(" and ") : "only the characters mentioned"} — NO other characters.
- Characters must be IN ACTION, not posing. This is a moment frozen in time, not a portrait.
- Match each character's appearance PRECISELY from their reference image (face, fur/hair, clothing, colors) but use the POSE and COMPOSITION from the scene direction.
- Goldie/Goldilocks is a HUMAN GIRL — no animal ears, no fur, no snout. Normal human face and hair.
${speciesReminders ? speciesReminders + "\n" : ""}${charBlock}
${ART_STYLE}`;

    // Generate + validate page (max 2 attempts, fallback to previous page)
    const PAGE_MAX_ATTEMPTS = 2;
    let pageAccepted = false;
    for (let attempt = 1; attempt <= PAGE_MAX_ATTEMPTS; attempt++) {
      if (attempt > 1 && fs.existsSync(pagePath)) {
        fs.unlinkSync(pagePath);
        console.log(`      🔄 Page ${i + 1} retry ${attempt}/${PAGE_MAX_ATTEMPTS}...`);
      }

      const result = await generateImage(prompt, pagePath, `${story.title} — page ${i + 1}/${story.pages.length}`, sceneRefPaths);
      if (!result) break;

      // Validate page with vision model
      const validation = await quickValidatePageImage(pagePath, i + 1, sceneCharNames, charDesc);
      if (validation.pass) {
        imagePaths.push(result);
        pageAccepted = true;
        break;
      } else {
        const issues = validation.issues?.join(", ") || "unknown";
        console.log(`      ❌ Page ${i + 1} QA FAILED (attempt ${attempt}/${PAGE_MAX_ATTEMPTS}): ${issues}`);
      }
      await sleep(2000);
    }

    if (!pageAccepted) {
      // Use previous page as fallback (or cover if first page)
      const fallback = imagePaths.length > 0 ? imagePaths[imagePaths.length - 1] : coverPath;
      if (fs.existsSync(pagePath)) fs.unlinkSync(pagePath);
      fs.copyFileSync(fallback, pagePath);
      console.log(`      📋 Page ${i + 1} failed QA — using previous page as fallback`);
      imagePaths.push(pagePath);
    }

    // Small delay between API calls
    if (i < story.pages.length - 1) await sleep(2000);
  }

  // Outro — reuse cover
  imagePaths.push(imagePaths[0]);

  return imagePaths;
}

// ── Detect page boundaries via silence detection ──
function detectPageBoundaries(mp3Path, totalDurationSec) {
  // The podcast has silence gaps: ~3s after intro, ~2s between pages, ~3s before outro
  // Use ffmpeg silencedetect to find exact boundaries
  const output = execSync(
    `ffmpeg -i "${path.resolve(mp3Path)}" -af silencedetect=noise=-30dB:d=1.5 -f null - 2>&1`,
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120000 }
  );

  // Parse silence_start and silence_end from stderr
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
  boundaries.push(totalDurationSec);

  // Convert boundaries to durations per segment
  const durations = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    durations.push(boundaries[i + 1] - boundaries[i]);
  }

  return durations;
}

// ── Ken Burns zoom/pan effects ──
// Alternates between zoom-in, zoom-out, pan, and diagonal effects for a movie-like feel.
// Images are rendered at 2x resolution internally then output at VIDEO_SIZE.
const KB_FPS = 30; // frame rate for smooth zoom
const KB_ZOOM = 0.35; // 35% zoom range — clearly visible movement

function getKenBurnsFilter(segmentIndex, durationSec) {
  const totalFrames = Math.ceil(durationSec * KB_FPS);
  const effect = segmentIndex % 5; // cycle through 5 effects for variety

  // zoompan: z = zoom level, x/y = pan position within zoomed frame
  switch (effect) {
    case 0: // Slow zoom IN to center
      return `zoompan=z='min(1+${KB_ZOOM}*on/${totalFrames},${1 + KB_ZOOM})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${VIDEO_SIZE}x${VIDEO_SIZE}:fps=${KB_FPS}`;
    case 1: // Slow zoom OUT from center
      return `zoompan=z='if(eq(on,1),${1 + KB_ZOOM},max(1,zoom-${KB_ZOOM}/${totalFrames}))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${VIDEO_SIZE}x${VIDEO_SIZE}:fps=${KB_FPS}`;
    case 2: // Pan left-to-right with zoom
      return `zoompan=z='1.15':x='(iw/zoom-ow)*on/${totalFrames}':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${VIDEO_SIZE}x${VIDEO_SIZE}:fps=${KB_FPS}`;
    case 3: // Pan right-to-left with zoom
      return `zoompan=z='1.15':x='(iw/zoom-ow)*(1-on/${totalFrames})':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${VIDEO_SIZE}x${VIDEO_SIZE}:fps=${KB_FPS}`;
    case 4: // Zoom in toward bottom-right (diagonal drift)
      return `zoompan=z='min(1+${KB_ZOOM}*on/${totalFrames},${1 + KB_ZOOM})':x='(iw-iw/zoom)*on/${totalFrames}':y='(ih-ih/zoom)*on/${totalFrames}':d=${totalFrames}:s=${VIDEO_SIZE}x${VIDEO_SIZE}:fps=${KB_FPS}`;
    default:
      return `zoompan=z='1':x='0':y='0':d=${totalFrames}:s=${VIDEO_SIZE}x${VIDEO_SIZE}:fps=${KB_FPS}`;
  }
}

// ── Build video with Ken Burns page clips ──
function buildVideoWithPages(imagePaths, durations, mp3Path, outputPath, totalDuration) {
  const clipDir = path.resolve(path.dirname(outputPath), "clips");
  fs.mkdirSync(clipDir, { recursive: true });

  const clipPaths = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i];
    if (!imgPath || !fs.existsSync(imgPath)) {
      console.log(`   ⚠️ Missing image for segment ${i}, skipping`);
      continue;
    }
    const dur = durations[i];
    const clipPath = path.join(clipDir, `clip_${String(i).padStart(3, "0")}.mp4`);

    // Skip if clip already exists and is recent (for resumability)
    if (fs.existsSync(clipPath)) {
      clipPaths.push(path.resolve(clipPath));
      continue;
    }

    // Scale source image to 2x VIDEO_SIZE for zoompan headroom, then apply Ken Burns
    const kbFilter = getKenBurnsFilter(i, dur);
    const scaleAndZoom = `scale=${VIDEO_SIZE * 2}:${VIDEO_SIZE * 2}:force_original_aspect_ratio=decrease,pad=${VIDEO_SIZE * 2}:${VIDEO_SIZE * 2}:(ow-iw)/2:(oh-ih)/2:black,${kbFilter}`;

    execSync(
      `ffmpeg -y -loop 1 -i "${path.resolve(imgPath)}" ` +
      `-vf "${scaleAndZoom}" ` +
      `-t ${dur.toFixed(3)} ` +
      `-c:v libx264 -preset fast -pix_fmt yuv420p ` +
      `-an "${path.resolve(clipPath)}"`,
      { stdio: "pipe", timeout: 600000 }
    );

    clipPaths.push(path.resolve(clipPath));
    process.stdout.write(`      🎞️ Clip ${i + 1}/${imagePaths.length}\r`);
  }
  console.log(`      🎞️ ${clipPaths.length} Ken Burns clips ready`);

  // Create concat file for all clips
  const concatFile = path.resolve(outputPath.replace(".mp4", "_concat.txt"));
  const concatLines = clipPaths.map((p) => `file '${p}'`);
  fs.writeFileSync(concatFile, concatLines.join("\n"));

  // Concatenate clips + add audio
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -i "${path.resolve(mp3Path)}" ` +
    `-map 0:v -map 1:a ` +
    `-c:v copy -c:a aac -b:a 192k ` +
    `-t ${totalDuration.toFixed(3)} ` +
    `"${path.resolve(outputPath)}"`,
    { stdio: "pipe", timeout: 1800000 }
  );
}

// ── Kling clips.json generation ──
// Instead of Ken Burns, output a clips.json for kling-batch-generate.mjs
// Each page illustration becomes a clip with an animation prompt derived from the page text.
function generateKlingClips(story, imagePaths, storyOutputDir) {
  const clipsPath = path.join(storyOutputDir, "kling_clips.json");
  const clips = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i];
    if (!imgPath || !fs.existsSync(imgPath)) continue;

    // Use sequential images: startFrame = current page, endFrame = next page
    // This makes Kling animate transitions between pages, creating a flowing video
    const nextImgPath = (i + 1 < imagePaths.length && fs.existsSync(imagePaths[i + 1]))
      ? imagePaths[i + 1]
      : imgPath; // last clip uses same image for start and end

    // Derive animation prompt from page text
    let prompt;
    if (i === 0) {
      // Intro — cover/title card
      prompt = `Gentle camera zoom into a storybook cover illustration, warm inviting glow, soft particle effects, magical atmosphere`;
    } else if (i === imagePaths.length - 1) {
      // Outro — closing
      prompt = `Gentle camera zoom out from illustration, warm golden light fading softly, peaceful ending, storybook closing`;
    } else {
      // Story page — summarize action for animation
      const pageIdx = i - 1; // offset for intro
      const pageText = pageToText(story.pages[pageIdx]) || "";
      prompt = summarizePageForAnimation(pageText);
    }

    clips.push({
      startFrame: path.resolve(imgPath),
      endFrame: path.resolve(nextImgPath),
      prompt,
    });
  }

  fs.writeFileSync(clipsPath, JSON.stringify(clips, null, 2));
  console.log(`   📋 Generated ${clips.length} Kling clips → ${clipsPath}`);
  return clipsPath;
}

// Summarize a page of story text into a short Kling animation prompt (max ~100 chars)
function summarizePageForAnimation(pageText) {
  // Extract the key action/emotion from the page
  const text = pageText.replace(/["'"]/g, "").replace(/\n/g, " ").trim();
  // Take the first sentence as the core action
  const firstSentence = text.split(/[.!?]/)[0]?.trim() || text.slice(0, 80);
  // Keep it short and animation-focused
  const shortened = firstSentence.length > 80 ? firstSentence.slice(0, 77) + "..." : firstSentence;
  return `${shortened}, subtle character movement, gentle breathing, warm storybook illustration style, soft lighting`;
}

// ── SRT subtitle generation ──
// Creates an .srt file with sentence-level subtitles timed to page boundaries.
function generateSRT(story, durations, outputPath) {
  const srtPath = outputPath.replace(".mp4", ".srt");
  const lines = [];
  let subtitleIndex = 1;

  // Calculate cumulative start times from durations
  const startTimes = [0];
  for (let i = 0; i < durations.length - 1; i++) {
    startTimes.push(startTimes[i] + durations[i]);
  }

  // For each page segment (skip intro at index 0, skip outro at last index)
  for (let seg = 1; seg < durations.length - 1; seg++) {
    const pageIndex = seg - 1;
    if (pageIndex >= story.pages.length) break;

    const pageText = pageToText(story.pages[pageIndex]);
    const segStart = startTimes[seg];
    const segDuration = durations[seg];

    // Split page into sentences
    const sentences = pageText.match(/[^.!?]+[.!?]+/g) || [pageText];
    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);

    let offset = 0;
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      // Proportional timing based on character count
      const ratio = sentence.length / totalChars;
      const sentDuration = segDuration * ratio;
      const sentStart = segStart + offset;
      const sentEnd = sentStart + sentDuration;

      lines.push(`${subtitleIndex}`);
      lines.push(`${formatSrtTime(sentStart)} --> ${formatSrtTime(sentEnd)}`);
      lines.push(trimmed);
      lines.push("");

      subtitleIndex++;
      offset += sentDuration;
    }
  }

  fs.writeFileSync(srtPath, lines.join("\n"));
  console.log(`   📝 Subtitles: ${srtPath} (${subtitleIndex - 1} cues)`);
  return srtPath;
}

function formatSrtTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

// ── Quality check ──
function qualityCheck(mp3Path, mp4Path, storyTitle) {
  const mp3Dur = getAudioDuration(mp3Path);
  const mp4Dur = getAudioDuration(mp4Path);
  const diff = Math.abs(mp3Dur - mp4Dur);

  if (diff > DURATION_TOLERANCE) {
    console.error(`   ❌ QUALITY FAIL: ${storyTitle}`);
    console.error(`      MP3: ${mp3Dur.toFixed(1)}s | MP4: ${mp4Dur.toFixed(1)}s | Diff: ${diff.toFixed(1)}s`);
    return false;
  }

  console.log(`   ✅ Quality OK: MP3 ${mp3Dur.toFixed(1)}s ≈ MP4 ${mp4Dur.toFixed(1)}s (diff ${diff.toFixed(1)}s)`);
  return true;
}

// ── Main ──
async function main() {
  const stories = selectStories();
  console.log(`\n🎬 Processing ${stories.length} story videos...\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;
  const qualityResults = [];

  for (const story of stories) {
    const name = safeTitle(story.title);
    const mp3Path = path.join(MP3_DIR, `${name}.mp3`);
    const storyOutputDir = path.join(OUTPUT_DIR, name);
    fs.mkdirSync(storyOutputDir, { recursive: true });
    const outputPath = path.join(storyOutputDir, `${name}.mp4`);

    if (!fs.existsSync(mp3Path) && !charsOnly) {
      console.log(`⚠ SKIP: No MP3 found for ${story.title}`);
      skipped++;
      continue;
    }

    if (fs.existsSync(outputPath) && !forceFlag && !imagesOnly) {
      console.log(`⏭ EXISTS: ${name}.mp4 (use --force to overwrite)`);
      skipped++;
      continue;
    }

    console.log(`\n🎬 [${story.index + 1}/${PODCAST_STORIES.length}] ${story.title}`);

    try {
      // For --chars-only, skip audio and illustrations — just generate character_desc.json
      if (charsOnly) {
        console.log(`   🎨 Generating character descriptions only...`);
        await generateStoryIllustrations(story);
        console.log(`   ⏩ --chars-only: stopping after character descriptions`);
        success++;
        continue;
      }

      // 1. Get audio duration
      const totalDuration = getAudioDuration(mp3Path);
      console.log(`   🔊 Audio: ${(totalDuration / 60).toFixed(1)} min (${totalDuration.toFixed(1)}s)`);

      // 2. Generate per-page illustrations
      console.log(`   🎨 Generating ${story.pages.length} page illustrations...`);
      const imagePaths = await generateStoryIllustrations(story);

      if (imagesOnly) {
        console.log(`   ⏩ --images-only: skipping video creation`);
        success++;
        continue;
      }

      // 3. Detect page boundaries from silence gaps in audio
      console.log(`   🔍 Detecting page boundaries from audio silence gaps...`);
      const durations = detectPageBoundaries(mp3Path, totalDuration);
      const expectedSegments = story.pages.length + 2; // intro + pages + outro
      console.log(`   ⏱️  Found ${durations.length} segments (expected ${expectedSegments}): intro(${durations[0].toFixed(0)}s) + ${durations.length - 2} pages + outro(${durations[durations.length - 1].toFixed(0)}s)`);

      // 4. Build video — reconcile segment count with image count
      if (durations.length < imagePaths.length) {
        // More images than audio segments: distribute remaining time evenly among missing slots
        const deficit = imagePaths.length - durations.length;
        const lastDur = durations.pop(); // take outro duration aside
        const avgPageDur = durations.slice(1).reduce((a, b) => a + b, 0) / durations.slice(1).length;
        for (let d = 0; d < deficit; d++) durations.push(avgPageDur);
        durations.push(lastDur); // put outro back
        console.log(`   ⚠️ Padded ${deficit} missing segment(s) with avg page duration (${avgPageDur.toFixed(1)}s)`);
      } else if (durations.length > imagePaths.length) {
        // More segments than images: merge extra segments into the last page
        while (durations.length > imagePaths.length) {
          const extra = durations.splice(durations.length - 2, 1)[0];
          durations[durations.length - 2] += extra;
        }
        console.log(`   ⚠️ Merged ${durations.length} extra segment(s) into last page`);
      }
      if (klingMode) {
        // Kling mode: generate clips.json instead of Ken Burns video
        console.log(`   🎬 Generating Kling clips.json...`);
        const clipsPath = generateKlingClips(story, imagePaths, storyOutputDir);
        console.log(`   📝 Generating subtitles...`);
        generateSRT(story, durations, outputPath);
        console.log(`\n   ✅ Ready for Kling. Next steps:`);
        console.log(`      1. Start Chrome with --remote-debugging-port=9222, sign into kling.ai`);
        console.log(`      2. node content/kling-batch-generate.mjs "${clipsPath}"`);
        console.log(`      3. Wait for clips to render on kling.ai`);
        console.log(`      4. node content/kling-build-story.mjs "${story.title}"`);
        success++;
        continue;
      }

      console.log(`   🎬 Building video (Ken Burns)...`);
      buildVideoWithPages(imagePaths, durations, mp3Path, outputPath, totalDuration);

      // 5. Generate subtitles
      console.log(`   📝 Generating subtitles...`);
      generateSRT(story, durations, outputPath);

      // 6. Quality check
      const passed = qualityCheck(mp3Path, outputPath, story.title);
      qualityResults.push({ title: story.title, passed });

      if (!passed) {
        failed++;
        continue;
      }

      // Copy MP3 and cover into the story folder for easy access
      const mp3Copy = path.join(storyOutputDir, `${name}.mp3`);
      if (!fs.existsSync(mp3Copy)) {
        fs.copyFileSync(mp3Path, mp3Copy);
        console.log(`   📋 Copied MP3 to story folder`);
      }
      const coverSrc = path.join(COVERS_DIR, `${name}.png`);
      const coverCopy = path.join(storyOutputDir, `cover.png`);
      if (fs.existsSync(coverSrc) && !fs.existsSync(coverCopy)) {
        fs.copyFileSync(coverSrc, coverCopy);
      }

      const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
      console.log(`   📦 ${name}.mp4 — ${sizeMb} MB`);
      success++;
    } catch (err) {
      console.error(`   ❌ FAILED: ${story.title} — ${err.message}`);
      failed++;
    }
  }

  // Summary
  console.log(`\n========================================`);
  console.log(`Done! ${success} created, ${skipped} skipped, ${failed} failed`);

  if (qualityResults.length > 0) {
    console.log(`\n📊 Quality Report:`);
    for (const r of qualityResults) {
      console.log(`   ${r.passed ? "✅" : "❌"} ${r.title}`);
    }
  }

  console.log(`\nOutput: ${OUTPUT_DIR}/`);
}

main().catch(console.error);
