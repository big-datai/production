#!/usr/bin/env node
/**
 * Generate Spotify podcast cover art for each story using Gemini image generation.
 * Outputs 3000x3000 PNG files (Spotify recommended) to exports/spotify/covers/
 *
 * Usage: node scripts/generateSpotifyCovers.mjs [storyNumber]
 *   No args = all stories
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { PODCAST_STORIES } from "./podcastStoryConstants.js";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const API_KEY = process.env.GEMINI_API_KEY?.replace(/"/g, "");
const MODEL = "gemini-2.5-flash-image"; // supports image generation via generateContent
const STORIES_DIR = path.join(process.cwd(), "exports", "stories");
const LEGACY_COVERS_DIR = path.join(process.cwd(), "exports", "spotify", "covers");
const COVERS_DIR = LEGACY_COVERS_DIR; // fallback — covers are shared across all stories

if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR, { recursive: true });

// Story-specific visual themes for each cover
const STORY_THEMES = {
  "Aladdin and the Wonderful Lamp": "a golden magic lamp glowing with blue magical smoke, Arabian palace in background, starry desert night sky",
  "Pocahontas, Daughter of the River": "a Native American girl by a sparkling river, autumn forest with colorful leaves, deer nearby",
  "Snow White and the Seven Dwarfs": "a kind princess with dark hair and a red hair bow in a cozy forest cottage surrounded by seven friendly small bearded men, enchanted forest, woodland animals, apples on a table",
  "The Three Little Pigs": "three cute pigs near houses of straw, sticks, and bricks, a wolf peering from behind a tree",
  "The Gingerbread Man": "a smiling gingerbread cookie running across a countryside bridge, a fox by the river",
  "Marina the Little Mermaid": "a mermaid with flowing hair underwater, colorful coral reef, fish, and a distant castle above the waves",
  "Goldilocks and the Three Bears": "a golden-haired girl peeking into a cozy forest cottage, three bears approaching from the woods",
  "Jack and the Beanstalk": "a boy climbing a giant beanstalk reaching into the clouds, a castle visible above the clouds",
  "Little Red Riding Hood": "a girl in a red hood walking through a magical forest path, flowers, a friendly-looking wolf hiding behind trees",
  "Cinderella": "a sparkling glass slipper on a palace staircase, a magical pumpkin carriage, stars and sparkles",
  "The Ugly Duckling": "a small gray duckling by a pond, beautiful swans in the background, water lilies and reeds",
  "Hansel and Gretel": "two children discovering a candy house in a dark enchanted forest, gumdrops and lollipops on the roof",
  "Rapunzel": "a girl with very long golden hair in a tall stone tower, flowers growing up the walls, birds flying around",
  "The Princess and the Pea": "a princess sleeping on a tall stack of colorful mattresses, a tiny green pea visible at the bottom, royal bedroom",
  "Puss in Boots": "a charming orange cat wearing fancy boots and a feathered hat, standing heroically, a castle in background",
  "The Tortoise and the Hare": "a determined tortoise and a sleeping hare on a race track through a meadow, finish line ahead",
  "The Boy Who Cried Wolf": "a shepherd boy on a green hillside with fluffy sheep, a wolf peeking from behind rocks, village below",
  "Pinocchio, the Wooden Boy": "a wooden puppet boy with a long nose, a kind old woodcarver, a workshop with tools and wood shavings",
  "The Wizard of Oz": "a girl in blue gingham dress with a little dog on a yellow brick road, an emerald green city glowing in the distance, a scarecrow, tin man, and lion walking together",
  "The Tale of Peter Rabbit": "a mischievous little brown rabbit in a blue jacket sneaking under a garden gate, rows of vegetables, a watering can, English cottage garden",
  "Winnie-the-Pooh and the Honey Tree": "a cute round golden teddy bear stuck halfway inside a hole in a large oak tree trunk, honey pot nearby, bees buzzing around, lush green forest meadow, Hundred Acre Wood vibes",
  "Sleeping Beauty": "a princess asleep on a bed of roses in a castle tower, thorny vines and blooming roses climbing the walls, soft moonlight, fairy godmothers with wands",
  "The Frog Prince": "a green frog wearing a tiny golden crown sitting on the edge of a stone well, a golden ball floating in the water, a princess in a garden, lily pads",
  "The Elves and the Shoemaker": "two tiny cheerful elves working by candlelight at a wooden cobbler's bench, sewing beautiful little shoes, moonlight through a workshop window",
  "Jack and the Seven League Boots": "a brave boy wearing enormous magical golden boots taking a giant leap across rolling green hills, a castle and mountains in the background, clouds at his feet",
  "Rumpelstiltskin": "a mysterious small man dancing around a fire next to a spinning wheel, golden straw and gold thread everywhere, a dark castle room lit by torchlight",
  "Thumbelina": "a tiny girl the size of a thumb sitting on a flower petal, a sparkling dewdrop beside her, giant daisies and buttercups, a friendly swallow bird nearby",
  "The Little Match Girl": "a small girl in a shawl sitting by a snowy street corner, warm golden light from a lit match illuminating her face, snowflakes falling gently, a cozy window glowing in the background",
};

async function generateCover(storyTitle, storyIndex) {
  const safeTitle = storyTitle.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  const outputPath = path.join(COVERS_DIR, `${safeTitle}.png`);

  if (fs.existsSync(outputPath)) {
    console.log(`  ⏩ ${storyTitle} — cover exists, skipping`);
    return outputPath;
  }

  const theme = STORY_THEMES[storyTitle] || `illustration of ${storyTitle}`;

  // Some titles trigger safety filters — generate without title text,
  // then post-process with ffmpeg to overlay the real title.
  const NEEDS_FFMPEG_TITLE = new Set([
    "Snow White and the Seven Dwarfs",
    "Winnie-the-Pooh and the Honey Tree",
  ]);
  const skipTitle = NEEDS_FFMPEG_TITLE.has(storyTitle);

  const titleInstruction = skipTitle
    ? '' // title will be added by ffmpeg post-processing
    : `Also include the story title "${storyTitle}" at the top in an elegant storybook font.`;

  const prompt = `Create a beautiful children's book illustration for a podcast cover art. The scene shows: ${theme}. 

Style: Warm, dreamy, watercolor-style children's book illustration. Soft lighting, magical atmosphere, vibrant but gentle colors. Safe and inviting for children.

IMPORTANT: Include the text "GoReadling.com" clearly written at the bottom of the image in a clean, readable white font with a subtle dark shadow. ${titleInstruction}

The image should be square format, suitable for a Spotify podcast episode cover.`;

  console.log(`  🎨 Generating cover for: ${storyTitle}...`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 429) {
          console.log(`    ⏳ Rate limited, waiting 60s (attempt ${attempt + 1}/3)...`);
          await new Promise((r) => setTimeout(r, 60000));
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));

      if (!imagePart) {
        console.log(`    ⚠️ No image in response, retrying (attempt ${attempt + 1}/3)...`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
      fs.writeFileSync(outputPath, imageBuffer);

      // If title was skipped (safety filter), overlay it with sharp + SVG
      if (skipTitle) {
        console.log(`    🔤 Overlaying real title with sharp...`);
        const sharp = (await import("sharp")).default;
        const meta = await sharp(outputPath).metadata();
        const w = meta.width;
        const svg = `<svg width="${w}" height="120" xmlns="http://www.w3.org/2000/svg">
          <defs><filter id="shadow" x="-5%" y="-5%" width="110%" height="130%">
            <feDropShadow dx="2" dy="2" stdDeviation="4" flood-color="black" flood-opacity="0.8"/>
          </filter></defs>
          <text x="${w / 2}" y="70" text-anchor="middle" 
            font-family="Georgia, 'Times New Roman', serif" 
            font-size="52" font-weight="bold" 
            fill="white" filter="url(#shadow)">${storyTitle}</text>
        </svg>`;
        const tmpPath = outputPath.replace(".png", "_titled.png");
        await sharp(outputPath)
          .composite([{ input: Buffer.from(svg), top: 20, left: 0 }])
          .toFile(tmpPath);
        fs.renameSync(tmpPath, outputPath);
        console.log(`    ✅ Title overlaid successfully`);
      }

      const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
      console.log(`  ✅ ${storyTitle} — ${sizeMb} MB → ${outputPath}`);
      return outputPath;
    } catch (err) {
      console.error(`    ❌ Attempt ${attempt + 1}/3 failed: ${err.message}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 10000));
    }
  }

  console.error(`  ❌ FAILED: ${storyTitle} — all attempts exhausted`);
  return null;
}

// ── Main ──
const main = async () => {
  const arg = process.argv[2];
  let stories;

  if (arg) {
    const n = Number(arg);
    if (n >= 1 && n <= PODCAST_STORIES.length) {
      stories = [{ story: PODCAST_STORIES[n - 1], index: n }];
    } else {
      console.error(`Invalid story number: ${arg}. Use 1-${PODCAST_STORIES.length}`);
      process.exit(1);
    }
  } else {
    stories = PODCAST_STORIES.map((s, i) => ({ story: s, index: i + 1 }));
  }

  console.log(`\n🎨 Generating ${stories.length} Spotify cover(s)`);
  console.log(`📂 Output: ${COVERS_DIR}\n`);

  const results = [];
  for (const { story, index } of stories) {
    const result = await generateCover(story.title, index);
    results.push({ title: story.title, ok: !!result });
    // Rate limit between generations
    if (stories.length > 1) await new Promise((r) => setTimeout(r, 3000));
  }

  console.log("\n════════════════════════════════════════════");
  console.log("📊 COVER ART RESULTS");
  console.log("════════════════════════════════════════════");
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.title}: ${r.ok ? "✅" : "❌"}`);
  });
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n  ${ok}/${results.length} covers generated`);
  console.log("════════════════════════════════════════════\n");
};

main().catch(console.error);
