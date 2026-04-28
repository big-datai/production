#!/usr/bin/env node

/**
 * Build YouTube compilation videos from existing story MP4s.
 * Concatenates multiple stories into a single long video with chapter markers.
 *
 * Usage:
 *   node content/podcast/buildCompilation.mjs                    # build all defined compilations
 *   node content/podcast/buildCompilation.mjs "Animal Stories"   # build one compilation
 *   node content/podcast/buildCompilation.mjs --list             # list available compilations
 *
 * Output: exports/compilations/<SafeTitle>/<SafeTitle>.mp4
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const FFMPEG = "/usr/local/bin/ffmpeg";
const FFPROBE = "/usr/local/bin/ffprobe";
const STORIES_DIR = path.resolve("exports/stories/_published");
const OUTPUT_DIR = path.resolve("exports/compilations");

// ── Compilation definitions ──────────────────────────────────────────────────

const COMPILATIONS = {
  "Animal Bedtime Stories": {
    stories: [
      "The Jungle Book",
      "The Tale of Peter Rabbit",
      "The Ugly Duckling",
      "The Three Little Pigs",
      "The Tortoise and the Hare",
      "The Gingerbread Man",
      "Goldilocks and the Three Bears",
      "The Bremen Town Musicians",
      "Thumbelina",
    ],
    // SEO-optimized title for YouTube (top search keywords)
    youtubeTitle:
      "Animal Bedtime Stories for Kids | 4+ HOURS Relaxing Sleep Stories with Calming Music",
    description: `🌙 4+ Hours of soothing animal bedtime stories for kids — the perfect sleep companion!

Let your little ones drift off to dreamland with these beloved animal tales, each featuring gentle multi-voice narration, calming ambient music, and beautiful animated illustrations.

Stories included:
{{chapters}}

✨ Perfect for:
• Bedtime routine for toddlers and kids ages 2-8
• Naptime stories with calming music
• Long car rides and quiet time
• Screen-free listening (audio works great on its own!)

📖 Read along with illustrations & word highlighting in our free app:
https://apps.apple.com/app/goreadling/id6755505679

🌐 More stories: https://goreadling.com/stories

#bedtimestories #kidsstories #animalstories #sleepstories #storiesforkids #bedtimestoriesforkids #toddlerstories #relaxingstories #calmingmusic #animatedstories`,
    tags: "bedtime stories,bedtime stories for kids,animal stories for kids,sleep stories,kids sleep stories,relaxing bedtime stories,calming stories for kids,toddler bedtime stories,bedtime story,stories for toddlers,animal stories,animated bedtime stories,long bedtime stories,2 hour bedtime story,peter rabbit,jungle book,three little pigs,ugly duckling,kids stories,children stories,read aloud,story time",
  },

  "Fairy Tale Bedtime Stories": {
    stories: [
      "Cinderella",
      "Rapunzel",
      "Hansel and Gretel",
      "Rumpelstiltskin",
      "Little Red Riding Hood",
      "The Princess and the Pea",
      "The Elves and the Shoemaker",
      "The Pied Piper of Hamelin",
      "The Little Match Girl",
    ],
    youtubeTitle:
      "Fairy Tale Bedtime Stories for Kids | 5+ HOURS Classic Stories with Calming Music",
    description: `🌙 5+ Hours of timeless fairy tale bedtime stories — a magical journey to dreamland!

The most beloved fairy tales of all time, gently narrated with distinct character voices, soothing ambient music, and enchanting animated illustrations. Perfect for bedtime, naptime, or any quiet moment.

Stories included:
{{chapters}}

✨ Perfect for:
• Bedtime routine for kids ages 2-8
• Fairy tale story time with calming narration
• Long sleep compilations that play all night
• Educational listening with classic literature

📖 Read along with illustrations & word highlighting in our free app:
https://apps.apple.com/app/goreadling/id6755505679

🌐 More stories: https://goreadling.com/stories

#bedtimestories #fairytales #kidsstories #sleepstories #classicfairytales #bedtimestoriesforkids #cinderella #rapunzel #hanselgretel #grimm #calmingmusic #animatedstories #storiesforkids`,
    tags: "bedtime stories,fairy tales for kids,bedtime stories for kids,classic fairy tales,sleep stories for kids,cinderella story,rapunzel story,hansel and gretel,grimm fairy tales,kids stories,long bedtime stories,3 hour bedtime story,relaxing stories,calming bedtime stories,animated fairy tales,story time,children stories,read aloud,princess stories,fairy tale compilation",
  },

  "Adventure Bedtime Stories": {
    stories: [
      "Aladdin and the Wonderful Lamp",
      "The Wizard of Oz",
      "Jack and the Beanstalk",
      "Puss in Boots",
      "Pinocchio, the Wooden Boy",
      "Jack and the Seven League Boots",
      "Ali Baba and the Forty Thieves",
    ],
    youtubeTitle:
      "Adventure Bedtime Stories for Kids | 4+ HOURS Epic Tales with Calming Music",
    description: `🌙 4+ Hours of exciting adventure bedtime stories — thrilling tales told in the gentlest way!

Epic adventures reimagined as soothing bedtime stories, with multi-voice narration, calming ambient music, and beautiful animated illustrations. Excitement that won't keep them up!

Stories included:
{{chapters}}

✨ Perfect for:
• Bedtime for kids who love adventure (ages 3-8)
• Long compilations for overnight sleep
• Road trips and quiet time listening
• Calming adventure stories that won't overstimulate

📖 Read along with illustrations & word highlighting in our free app:
https://apps.apple.com/app/goreadling/id6755505679

🌐 More stories: https://goreadling.com/stories

#bedtimestories #adventurestories #kidsstories #sleepstories #aladdin #wizardofoz #jackandbeanstalk #pussinboots #pinocchio #alibaba #bedtimestoriesforkids #animatedstories #calmingmusic`,
    tags: "bedtime stories,adventure stories for kids,bedtime stories for kids,sleep stories,aladdin story,wizard of oz story,jack and the beanstalk,puss in boots,pinocchio,ali baba,kids stories,long bedtime stories,4 hour bedtime story,relaxing adventure stories,animated stories,story time,children stories,read aloud,epic bedtime stories",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const safeTitle = (t) => t.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");

function findStoryMp4(storyTitle) {
  const safe = safeTitle(storyTitle);
  if (!fs.existsSync(STORIES_DIR)) return null;

  for (const dir of fs.readdirSync(STORIES_DIR)) {
    if (!dir.startsWith(safe)) continue;
    const storyRoot = path.join(STORIES_DIR, dir);
    const youtubeDir = path.join(storyRoot, "youtube");
    if (!fs.existsSync(youtubeDir)) continue;

    for (const sub of fs.readdirSync(youtubeDir)) {
      const mp4 = path.join(youtubeDir, sub, `${sub}.mp4`);
      if (fs.existsSync(mp4)) return mp4;
    }
  }
  return null;
}

function getMp4Duration(mp4Path) {
  const dur = execSync(
    `${FFPROBE} -v error -show_entries format=duration -of csv=p=0 "${mp4Path}"`,
    { encoding: "utf8" }
  ).trim();
  return parseFloat(dur);
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Build one compilation ────────────────────────────────────────────────────

function buildCompilation(name, config) {
  console.log(`\n🎬 Building: ${name}`);
  console.log(`   ${config.stories.length} stories\n`);

  // Find all MP4s
  const videos = [];
  const missing = [];
  for (const title of config.stories) {
    const mp4 = findStoryMp4(title);
    if (mp4) {
      const dur = getMp4Duration(mp4);
      if (dur > 60) {
        // Only include full videos (> 1 min)
        videos.push({ title, mp4, duration: dur });
        console.log(`   ✅ ${title} — ${(dur / 60).toFixed(1)} min`);
      } else {
        missing.push(title);
        console.log(`   ⚠️  ${title} — only ${dur.toFixed(0)}s (clip fragment, skipping)`);
      }
    } else {
      missing.push(title);
      console.log(`   ❌ ${title} — no MP4 found`);
    }
  }

  if (videos.length < 2) {
    console.log(`   ❌ Not enough videos (${videos.length}). Need at least 2.`);
    return null;
  }

  const totalDur = videos.reduce((sum, v) => sum + v.duration, 0);
  const totalHours = (totalDur / 3600).toFixed(1);
  console.log(
    `\n   📊 ${videos.length} videos, ${totalHours} hours total`
  );
  if (missing.length > 0) {
    console.log(`   ⚠️  ${missing.length} stories skipped: ${missing.join(", ")}`);
  }

  // Generate chapter markers
  let offset = 0;
  const chapters = [];
  for (const v of videos) {
    chapters.push(`${formatTimestamp(offset)} ${v.title}`);
    offset += v.duration;
  }

  // Update title with actual duration
  const durationLabel = totalDur >= 7200
    ? `${Math.round(totalDur / 3600)}+`
    : `${Math.round(totalDur / 3600)}+`;
  const hoursLabel = `${Math.floor(totalDur / 3600)}+ HOURS`;

  // Create output directory
  const safeName = safeTitle(name);
  const outDir = path.join(OUTPUT_DIR, safeName);
  fs.mkdirSync(outDir, { recursive: true });

  // Write concat file — need to re-encode to ensure consistent format
  const concatFile = path.join(outDir, "concat.txt");
  const concatLines = videos.map(
    (v) => `file '${v.mp4}'`
  );
  fs.writeFileSync(concatFile, concatLines.join("\n") + "\n");

  // Build compilation MP4
  const outMp4 = path.join(outDir, `${safeName}.mp4`);
  console.log(`\n   🔨 Concatenating ${videos.length} videos...`);

  // First try direct concat (fast, works if all videos have same codec/resolution)
  try {
    execSync(
      `${FFMPEG} -y -f concat -safe 0 -i "${concatFile}" -c copy "${outMp4}"`,
      { stdio: "pipe", timeout: 600000 }
    );
  } catch {
    // Fallback: re-encode (slower but handles different formats)
    console.log(`   ⚠️  Direct concat failed, re-encoding...`);
    execSync(
      `${FFMPEG} -y -f concat -safe 0 -i "${concatFile}" ` +
        `-c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k "${outMp4}"`,
      { stdio: "pipe", timeout: 3600000 }
    );
  }

  const finalSize = (fs.statSync(outMp4).size / 1024 / 1024 / 1024).toFixed(2);
  console.log(`   ✅ ${outMp4} (${finalSize} GB)`);

  // Write marketing metadata
  const description = config.description.replace(
    "{{chapters}}",
    chapters.join("\n")
  );

  // Update title with actual hours
  const actualTitle = config.youtubeTitle.replace(
    /\d+\+\s*HOURS/,
    hoursLabel
  );

  const marketing = {
    title: actualTitle,
    description,
    tags: config.tags,
    chapters,
    stories: videos.map((v) => v.title),
    totalDuration: totalDur,
    totalHours: parseFloat(totalHours),
    mp4: outMp4,
  };

  const metaPath = path.join(outDir, "marketing.json");
  fs.writeFileSync(metaPath, JSON.stringify(marketing, null, 2));
  console.log(`   📝 ${metaPath}`);

  return marketing;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--list")) {
  console.log("\n📋 Available compilations:\n");
  for (const [name, config] of Object.entries(COMPILATIONS)) {
    console.log(`  ${name} (${config.stories.length} stories)`);
    for (const s of config.stories) console.log(`    - ${s}`);
    console.log();
  }
  process.exit(0);
}

const filterName = args.find((a) => !a.startsWith("--"));

console.log("🎬 GoReadling Compilation Builder\n");

const results = [];
for (const [name, config] of Object.entries(COMPILATIONS)) {
  if (filterName && !name.toLowerCase().includes(filterName.toLowerCase()))
    continue;
  const result = buildCompilation(name, config);
  if (result) results.push({ name, ...result });
}

console.log("\n══════════════════════════════════════════════════");
console.log(`✅ Built ${results.length} compilation(s)`);
for (const r of results) {
  console.log(`   ${r.name}: ${r.totalHours}h, ${r.stories.length} stories → ${r.mp4}`);
}
console.log("══════════════════════════════════════════════════\n");
