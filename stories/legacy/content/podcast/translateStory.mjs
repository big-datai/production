#!/usr/bin/env node

/**
 * Translate story text to another language using Gemini.
 * Preserves page count, segment structure, and speaker tags.
 *
 * Usage:
 *   node content/podcast/translateStory.mjs "Cinderella" --lang es
 *   node content/podcast/translateStory.mjs all --lang es          # translate all ready stories
 *   node content/podcast/translateStory.mjs all --lang es,pt,zh    # multiple languages
 *
 * Output: exports/stories/_published/<SafeTitle>_MMDDYYYY/<lang>/text/story_<lang>.json
 */

import { GoogleGenAI } from "@google/genai";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { PODCAST_STORIES } from "./podcastStoryConstants.js";
import { getLang, TRANSLATABLE_STORIES } from "./languageConfig.mjs";
import { pageToText } from "./pageUtils.mjs";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });

const STORIES_DIR = path.resolve("exports/stories/_published");
const GEMINI_MODEL = "gemini-2.5-flash";

// ── API setup ──
const API_KEYS = [
  process.env.GEMINI_API_KEY_5,
  process.env.GEMINI_API_KEY,
  process.env.API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
].filter(Boolean);

if (!API_KEYS.length) {
  console.error("❌ No Gemini API key found");
  process.exit(1);
}

let keyIdx = 0;
let client = new GoogleGenAI({ apiKey: API_KEYS[0] });
function rotateKey() {
  if (keyIdx + 1 < API_KEYS.length) {
    keyIdx++;
    client = new GoogleGenAI({ apiKey: API_KEYS[keyIdx] });
    return true;
  }
  return false;
}

// ── Helpers ──
const safeTitle = (t) => t.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");

function findStoryDir(title) {
  const safe = safeTitle(title);
  if (!fs.existsSync(STORIES_DIR)) return null;
  const match = fs
    .readdirSync(STORIES_DIR)
    .filter((d) => d.startsWith(safe + "_"))
    .sort()
    .reverse()[0];
  return match ? path.join(STORIES_DIR, match) : null;
}

async function translateText(text, langConfig, context = "") {
  const prompt = `Translate the following bedtime story text from English to ${langConfig.name} (${langConfig.nativeName}).

Rules:
- This is a bedtime story for children ages 3-7. Use simple, warm, soothing language.
- Keep the same paragraph structure and length.
- Do NOT translate character names — keep them in English (e.g., "Cinderella", "Captain Bramble", "Luna").
- Do NOT add or remove any content. Translate faithfully.
- The translation should sound natural when read aloud as a bedtime story.
${context}

Text to translate:
${text}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { thinkingConfig: { thinkingBudget: 0 } },
      });
      return res.text.trim();
    } catch (e) {
      if (e.message?.includes("429") || e.message?.includes("quota")) {
        if (rotateKey()) {
          console.log(`    🔄 Rotated to key ${keyIdx + 1}/${API_KEYS.length}`);
          continue;
        }
        console.log(`    ⏳ Quota hit, waiting 30s...`);
        await new Promise((r) => setTimeout(r, 30000));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Failed after 5 attempts");
}

async function translateSegmentedPage(page, langConfig) {
  // Translate all segments in one call for consistency
  const segTexts = page.segments.map((s) => `[${s.speaker}]: ${s.text}`).join("\n\n");

  const prompt = `Translate the following bedtime story dialogue from English to ${langConfig.name} (${langConfig.nativeName}).

Rules:
- This is a bedtime story for children ages 3-7. Use simple, warm, soothing language.
- Each line starts with [SpeakerName]: — keep the speaker tags EXACTLY as they are (in English).
- ONLY translate the text AFTER the colon. Do NOT translate speaker names.
- Keep the same number of lines/segments.
- The translation should sound natural when read aloud.
- NEVER translate into a description of how someone speaks. Only translate WHAT they say.
  WRONG: "Captain Bramble's voice was warm" — this describes the voice, not what he says.
  WRONG: "she said with worry in her eyes" — this describes manner, not content.
  RIGHT: Just translate the actual spoken/narrated words.

Text:
${segTexts}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { thinkingConfig: { thinkingBudget: 0 } },
      });

      // Parse back into segments
      const lines = res.text
        .trim()
        .split("\n")
        .filter((l) => l.trim());
      const segments = [];
      for (const line of lines) {
        const match = line.match(/^\[([^\]]+)\]:\s*(.+)/);
        if (match) {
          segments.push({ speaker: match[1], text: match[2].trim() });
        } else if (segments.length > 0) {
          // Continuation of previous segment
          segments[segments.length - 1].text += " " + line.trim();
        }
      }

      // Validate segment count matches
      if (segments.length !== page.segments.length) {
        console.log(
          `    ⚠️  Segment count mismatch: got ${segments.length}, expected ${page.segments.length}. Retrying...`
        );
        if (attempt < 4) continue;
        // On last attempt, pad or trim to match
        while (segments.length < page.segments.length) {
          const missing = page.segments[segments.length];
          segments.push({ speaker: missing.speaker, text: missing.text }); // fallback to English
        }
        segments.length = page.segments.length;
      }

      return { page: page.page, segments };
    } catch (e) {
      if (e.message?.includes("429") || e.message?.includes("quota")) {
        if (rotateKey()) continue;
        await new Promise((r) => setTimeout(r, 30000));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Failed after 5 attempts");
}

async function translateFlatToSegments(pageText, pageNum, langConfig, characterNames) {
  const charList = characterNames.length > 0
    ? `Known characters in this story: ${characterNames.join(", ")}.`
    : "";

  const prompt = `You are converting a bedtime story page from English to ${langConfig.name} AND structuring it into multi-voice segments.

The input is a flat text page with narration and dialogue mixed together. You must:
1. Translate everything to ${langConfig.name} (${langConfig.nativeName})
2. Split into segments, each with a speaker tag
3. Use "Captain Bramble" for all narration/description (he is the storyteller)
4. Use character names (in English) for dialogue — identify who is speaking from context
5. Each segment should be 1-3 sentences — not too long, not too short
6. Keep character names in English — do NOT translate them
7. Every character must speak in third person about themselves using their own name (e.g., "Cinderella is so happy!" not "I am so happy!")
8. Maximum 12 segments per page — combine short segments if needed

CRITICAL — these rules prevent TTS failures:
9. Every segment MUST be actual words to READ ALOUD. This text goes directly to a text-to-speech engine.
10. NEVER describe HOW someone speaks — only write WHAT they say or narrate.
    WRONG: "Captain Bramble's voice was warm and deep" (describes the voice)
    WRONG: "Paper Ballerina's eyebrows furrowed with worry" (describes action)
    WRONG: "Rosie spoke nervously" (describes manner of speaking)
    WRONG: "Other Tin Soldiers' voice had a note of concern" (describes tone)
    RIGHT: "Once upon a time, in a cozy little nursery..." (actual narration)
    RIGHT: "Oh look at them, they are wonderful!" (actual dialogue)
11. NEVER start a segment with a character name followed by a description of their emotion/voice/expression.
12. If the original text says "she said nervously" — just include what she said, not how she said it.

${charList}

Output ONLY valid JSON — no markdown, no explanation. Format:
{"page": ${pageNum}, "segments": [{"speaker": "Captain Bramble", "text": "translated narration..."}, {"speaker": "CharacterName", "text": "translated dialogue..."}]}

English text to translate and segment:
${pageText}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { thinkingConfig: { thinkingBudget: 0 } },
      });

      // Parse JSON from response (strip markdown code fences if present)
      let jsonText = res.text.trim();
      jsonText = jsonText.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
      const parsed = JSON.parse(jsonText);

      // Validate structure
      if (!parsed.segments || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
        throw new Error("Invalid segment structure");
      }

      // Validate each segment has speaker + text
      for (const seg of parsed.segments) {
        if (!seg.speaker || !seg.text) throw new Error("Segment missing speaker or text");
      }

      return { page: pageNum, segments: parsed.segments };
    } catch (e) {
      if (e.message?.includes("429") || e.message?.includes("quota")) {
        if (rotateKey()) {
          console.log(` 🔄`);
          continue;
        }
        await new Promise((r) => setTimeout(r, 30000));
        continue;
      }
      if (attempt < 4 && (e instanceof SyntaxError || e.message?.includes("Invalid"))) {
        console.log(` ⚠️ retry ${attempt + 2}...`);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Failed to translate+segment page ${pageNum} after 5 attempts`);
}

// ── Post-processing: strip meta-description segments that TTS rejects ──
function sanitizeSegments(page) {
  if (!page?.segments) return page;

  const original = page.segments.length;
  page.segments = page.segments.filter((seg) => {
    const t = seg.text;
    // Detect meta-descriptions: text that describes how someone speaks/acts rather than what they say
    // Pattern: "[Name]'s voice was...", "[Name] spoke nervously", "[Name]'s eyebrows furrowed"
    const metaPatterns = [
      // English
      /voice\s+was\s/i, /voice\s+had\s/i, /voice\s+sounded\s/i,
      /spoke\s+(nervously|softly|warmly|gently|quietly|loudly|firmly)/i,
      /eyebrows?\s+(furrowed|raised|knitted)/i,
      /eyes?\s+(widened|narrowed|sparkled|glistened)/i,
      /said\s+(with|in)\s+(a\s+)?(worry|concern|fear|anger|joy|excitement)/i,
      /smiled\s+(gently|softly|warmly)/i,
      // Hindi
      /आवाज़?\s*(में|थी|से|आई|गूँजी)/,
      /भौंहें|भौंह/,
      /घबराई\s+हुई\s+सी\s+बोली/,
      /मुस्कुराई|मुस्कुराया/,
      /आँखें?\s*(आश्चर्य|बड़ी|चौड़ी|चमक)/,
      // Arabic
      /صوت.*كان/, /صوته.*كان/,
      /قال[تة]?\s+(بـ?قلق|بـ?خوف|بـ?فرح|بـ?حزن|بهدوء|بعصبية)/,
      /حاجب[يا].*تقطب/,
      /عيناه.*اتسع/,
      // Spanish
      /voz\s+(era|fue|tenía|sonaba)/i,
      /dijo\s+(con|en)\s+(voz|tono|preocupación|miedo)/i,
      /cejas?\s+(se\s+)?frunci/i,
      /ojos?\s+(se\s+)?(abrieron|agrandaron)/i,
      // Portuguese
      /voz\s+(era|foi|tinha|soava)/i,
      /disse\s+(com|em)\s+(voz|tom|preocupação)/i,
      /sobrancelhas?\s+(se\s+)?franzi/i,
      /olhos?\s+(se\s+)?(arregalaram|abriram)/i,
      // Russian
      /голос\s+(был|звучал|прозвучал)/i,
      /сказал[аи]?\s+(с\s+)?(тревогой|беспокойством|радостью|грустью|нервно|тихо)/i,
      /брови\s+(нахмурил|сдвинул|свел)/i,
      /глаза\s+(расширились|округлились|заблестели)/i,
    ];

    for (const pattern of metaPatterns) {
      if (pattern.test(t)) {
        return false; // Strip this segment
      }
    }

    // Also strip very short segments (< 3 words) that are just sound effects
    const wordCount = t.trim().split(/\s+/).length;
    if (wordCount < 2) return false;

    return true;
  });

  // Cap at 12 segments — pages with 18+ consistently fail TTS
  if (page.segments.length > 12) {
    const extra = page.segments.splice(12);
    // Merge overflow into last segment
    page.segments[11].text += " " + extra.map((s) => s.text).join(" ");
  }

  const removed = original - page.segments.length;
  if (removed > 0) {
    console.log(` 🧹 Stripped ${removed} segment(s) (meta-descriptions + overflow)`);
  }

  return page;
}

async function translateStory(title, langCode) {
  const langConfig = getLang(langCode);
  const story = PODCAST_STORIES.find((s) => s.title === title);
  if (!story) {
    console.log(`  ❌ "${title}" not found in podcastStoryConstants.js`);
    return false;
  }

  const storyDir = findStoryDir(title);
  if (!storyDir) {
    console.log(`  ❌ No folder found for "${title}"`);
    return false;
  }

  // Check if already translated
  const outDir = path.join(storyDir, langCode, "text");
  const outFile = path.join(outDir, `story_${langCode}.json`);
  if (fs.existsSync(outFile)) {
    console.log(`  ⏩ Already translated: ${outFile}`);
    return true;
  }

  console.log(`  📖 Translating "${title}" → ${langConfig.name}...`);

  // Translate title
  const translatedTitle = await translateText(title, langConfig, "This is just the story title. Translate it naturally.");
  console.log(`    📝 Title: ${translatedTitle}`);

  // Translate intro
  const introText = `Welcome to GoReadling Bedtime Stories. Tonight's story is ${title}. Get cozy, close your eyes, and let's begin.`;
  const translatedIntro = await translateText(introText, langConfig, "This is the podcast intro narration.");

  // Translate outro
  const outroText = `And that's the end of our story. Sweet dreams, and we'll see you next time on GoReadling Bedtime Stories. Goodnight!`;
  const translatedOutro = await translateText(outroText, langConfig, "This is the podcast outro narration.");

  // Load character names from character_desc.json for flat→segment conversion
  const safe = safeTitle(title);
  const charDescPath = path.join(storyDir, "youtube", safe, "character_desc.json");
  let characterNames = [];
  if (fs.existsSync(charDescPath)) {
    try {
      const chars = JSON.parse(fs.readFileSync(charDescPath, "utf8"));
      characterNames = chars.map((c) => c.name);
    } catch {}
  }

  // Translate pages — ALL output in segment format {page, segments: [{speaker, text}]}
  const translatedPages = [];
  for (let i = 0; i < story.pages.length; i++) {
    const page = story.pages[i];
    process.stdout.write(`    📄 Page ${i + 1}/${story.pages.length}...`);

    if (typeof page === "object" && page.segments) {
      // Already segmented — translate preserving speaker tags
      const translated = await translateSegmentedPage(page, langConfig);
      translatedPages.push(sanitizeSegments(translated));
    } else {
      // Flat string → translate AND convert to segment format
      const pageText = typeof page === "string" ? page : pageToText(page);
      const translated = await translateFlatToSegments(
        pageText, i + 1, langConfig, characterNames
      );
      translatedPages.push(sanitizeSegments(translated));
    }
    console.log(" ✅");

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  // Save translated story
  fs.mkdirSync(outDir, { recursive: true });
  const output = {
    title,
    titleTranslated: translatedTitle,
    language: langCode,
    languageName: langConfig.name,
    intro: translatedIntro,
    outro: translatedOutro,
    pages: translatedPages,
    translatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`    ✅ Saved: ${outFile}`);
  return true;
}

// ── CLI ──
const args = process.argv.slice(2);
const langArg = args.find((a) => a.startsWith("--lang"))?.split("=")[1] ||
  args[args.indexOf("--lang") + 1];
const storyArg = args.find((a) => !a.startsWith("--"));

if (!langArg) {
  console.error("Usage: node translateStory.mjs <title|all> --lang <es|pt|zh|hi|ru>");
  process.exit(1);
}

const langs = langArg.split(",");
const stories = storyArg === "all" ? TRANSLATABLE_STORIES : [storyArg];

console.log(`\n🌍 Translating ${stories.length} stories → ${langs.join(", ")}\n`);

let translated = 0;
let failed = 0;

for (const lang of langs) {
  console.log(`\n══ ${getLang(lang).name} (${getLang(lang).nativeName}) ══\n`);
  for (const title of stories) {
    try {
      const ok = await translateStory(title, lang);
      if (ok) translated++;
    } catch (e) {
      console.log(`  ❌ "${title}": ${e.message}`);
      failed++;
    }
  }
}

console.log(`\n✅ Done! ${translated} translated, ${failed} failed.\n`);
