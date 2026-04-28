#!/usr/bin/env node

/**
 * Generate canonical avatar portraits for all recurring characters.
 * Uses Gemini 2.5 Flash Image (REST API) to create consistent reference images.
 * Each character gets a full-body portrait on a cream background.
 */

import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

const ROOT = path.resolve(process.cwd());
config({ path: path.join(ROOT, '.env.local') });

const CHARACTERS_FILE = path.join(ROOT, 'assets/characters/recurringCharacters.json');
const OUTPUT_DIR = path.join(ROOT, 'assets/characters');
const IMAGE_MODEL = 'gemini-2.5-flash-image';

const ART_STYLE = `Hand-painted watercolor children's book illustration style. Soft edges, warm colors, gentle lighting. Whimsical and inviting, suitable for ages 3-7. No text or letters anywhere in the image.`;

function getEnvValue(...keys) {
  for (const k of keys) {
    if (process.env[k]) return process.env[k];
  }
  return null;
}

const API_KEYS = [
  getEnvValue('GEMINI_API_KEY', 'VITE_GEMINI_API_KEY', 'API_KEY'),
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean);

let keyIndex = 0;
function getApiKey() {
  const key = API_KEYS[keyIndex % API_KEYS.length];
  keyIndex++;
  return key;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function generateAvatar(character, attempt = 1) {
  const apiKey = getApiKey();

  const speciesRules = character.species === 'hen'
    ? 'The hen has exactly 2 legs, 2 wings, 1 beak, 1 red comb. No arms or hands — only wings.'
    : character.species === 'fox'
    ? 'The fox has exactly 4 legs, 1 bushy tail, 2 pointed ears, 1 snout. Walks on all fours like a real fox.'
    : character.species === 'fairy'
    ? 'The fairy has exactly 2 arms, 2 legs, 2 translucent wings on her back. Human proportions with wings.'
    : 'The character has exactly 2 arms, 2 legs, correct human proportions.';

  const prompt = `Create a full-body character portrait of ${character.name}, ${character.role}.

CHARACTER DETAILS:
- Species: ${character.species}
- Age: ${character.age}
- Body: ${character.body}
- Face: ${character.face}
- Hair: ${character.hair || 'N/A'}
- Skin/Fur: ${character.skin}
- Outfit: ${character.outfit}
- Distinguishing features: ${character.features}

ANATOMY RULES: ${speciesRules}

COMPOSITION:
- Full body view, 3/4 angle, standing pose with personality (${character.personality.split('.')[0]})
- Plain warm cream/ivory background with soft gradient
- Character centered, filling about 70% of frame height
- Friendly, approachable expression
- Warm, soft lighting from upper left

ART STYLE: ${ART_STYLE}

This is the CANONICAL reference portrait for this character. It will be used as a visual reference across many stories, so make it clear, detailed, and distinctive.`;

  console.log(`  Generating portrait for ${character.name} (attempt ${attempt})...`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429) {
        console.log(`  ⏳ Rate limited, waiting 30s...`);
        await sleep(30000);
        if (attempt < 5) return generateAvatar(character, attempt + 1);
      }
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart) {
      throw new Error('No image in response');
    }

    const outputPath = path.join(OUTPUT_DIR, `${character.id}.png`);
    const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    fs.writeFileSync(outputPath, imageBuffer);
    console.log(`  ✅ ${character.name} → ${character.id}.png (${(imageBuffer.length / 1024).toFixed(0)} KB)`);
    return true;
  } catch (err) {
    console.error(`  ❌ ${character.name} attempt ${attempt} failed: ${err.message}`);
    if (attempt < 3) {
      await sleep(3000);
      return generateAvatar(character, attempt + 1);
    }
    return false;
  }
}

async function main() {
  console.log('🎨 Generating recurring character avatars...\n');

  if (!API_KEYS.length) {
    console.error('❌ No GEMINI_API_KEY found in .env.local');
    process.exit(1);
  }
  console.log(`Using ${API_KEYS.length} API key(s)\n`);

  const registry = JSON.parse(fs.readFileSync(CHARACTERS_FILE, 'utf8'));

  let success = 0;
  let failed = 0;

  for (const char of registry.characters) {
    const existing = path.join(OUTPUT_DIR, `${char.id}.png`);
    if (fs.existsSync(existing) && !process.argv.includes('--force')) {
      console.log(`⏭️  ${char.name} already exists (use --force to regenerate)`);
      success++;
      continue;
    }

    const ok = await generateAvatar(char);
    if (ok) success++;
    else failed++;

    // Rate limit between characters
    await sleep(2000);
  }

  console.log(`\n🎉 Done! ${success} generated, ${failed} failed.`);
  console.log(`Avatars saved to: ${OUTPUT_DIR}/`);
}

main().catch(console.error);
