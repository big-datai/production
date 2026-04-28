#!/usr/bin/env node

/**
 * Generate YOUTUBE_MARKETING.md video entries with automatic timestamps.
 * Reads MP3s, runs silence detection, creates chapter timestamps, and outputs
 * SEO-optimized video entries.
 *
 * Usage:
 *   node content/podcast/generateYoutubeMarketing.mjs
 */

import { execSync } from "child_process";
import fs from "node:fs";
import path from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PODCAST_STORIES } from "./podcastStoryConstants.js";
import { pageToText } from './pageUtils.mjs';
// Import SPOTIFY_IDS for per-story Spotify links
const seedPath2 = path.resolve(process.cwd(), 'content/podcast/seedBednightStories.mjs');
const seedContent2 = fs.readFileSync(seedPath2, 'utf8');
const spMatch = seedContent2.match(/const SPOTIFY_IDS = \{([\s\S]*?)\};/);
const SPOTIFY_IDS = {};
if (spMatch) {
  // Handle both 'title': 'id' and "title's": 'id' formats
  const entries = spMatch[1].matchAll(/"([^"]+)":\s*'([^']+)'|'([^']+)':\s*'([^']+)'/g);
  for (const m of entries) SPOTIFY_IDS[m[1] || m[3]] = m[2] || m[4];
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateStoryData(title, synopsis) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = `You are writing YouTube marketing metadata for a kids bedtime story channel called GoReadling.

Story title: "${title}"
${synopsis ? `Synopsis: ${synopsis}` : ''}

Generate a JSON object with these fields:
- emoji: one emoji that fits the story (e.g. 🪿 for goose, 🧚 for fairy)
- desc: a 2-3 sentence YouTube description starting with "🌙 ${title} —", mentioning "a soothing bedtime story for kids ages 3-7", describing the story warmly, ending with "✨". Include calming language.
- hashtags: space-separated hashtags including #bedtimestory #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories and 2-3 story-specific ones
- tags: comma-separated YouTube tags including "bedtime story, kids story, children's story, sleep story, fairy tale, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026" plus story-specific tags

Return ONLY valid JSON, no markdown.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(text);
}

const STORIES_DIR = "exports/stories";
const LEGACY_MP3_DIR = "exports/spotify";
const OUTPUT_FILE = path.join(STORIES_DIR, "YOUTUBE_MARKETING.md");

const safeTitle = (title) =>
  title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");

/** Find story-specific export folder */
function findStoryDir(title) {
  const safe = safeTitle(title);
  const searchDirs = [STORIES_DIR, path.join(STORIES_DIR, "_published")];
  for (const base of searchDirs) {
    if (!fs.existsSync(base)) continue;
    const matches = fs.readdirSync(base)
      .filter(d => d.startsWith(safe + "_") && fs.statSync(path.join(base, d)).isDirectory())
      .sort().reverse();
    if (matches.length > 0) return path.join(base, matches[0]);
  }
  return null;
}

/** Find MP3 — story folder first, then legacy */
function findMp3(title) {
  const safe = safeTitle(title);
  const storyDir = findStoryDir(title);
  if (storyDir) {
    const mp3 = path.join(storyDir, "spotify", `${safe}.mp3`);
    if (fs.existsSync(mp3)) return mp3;
  }
  const legacy = path.join(LEGACY_MP3_DIR, `${safe}.mp3`);
  if (fs.existsSync(legacy)) return legacy;
  return null;
}

const kebab = (title) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const fmtTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const getAudioDuration = (filePath) =>
  parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
  );

function detectBoundaries(mp3Path) {
  const totalDuration = getAudioDuration(mp3Path);
  const output = execSync(
    `ffmpeg -i "${path.resolve(mp3Path)}" -af silencedetect=noise=-30dB:d=1.5 -f null - 2>&1`,
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 120000 }
  );
  const silences = [];
  let currentStart = null;
  for (const line of output.split("\n")) {
    const sm = line.match(/silence_start:\s*([\d.]+)/);
    const em = line.match(/silence_end:\s*([\d.]+)/);
    if (sm) currentStart = parseFloat(sm[1]);
    if (em && currentStart !== null) {
      silences.push({ start: currentStart, end: parseFloat(em[1]) });
      currentStart = null;
    }
  }
  const boundaries = [0];
  for (const s of silences) boundaries.push((s.start + s.end) / 2);
  boundaries.push(totalDuration);
  return { boundaries, totalDuration };
}

/** Create brief chapter label from first sentence of page text */
function chapterLabel(pageText, pageNum) {
  // Get first sentence, trim to ~40 chars
  const first = pageText.split(/[.!?]/)[0].trim();
  if (first.length <= 45) return first;
  // Trim to last full word under 45 chars
  const words = first.split(" ");
  let label = "";
  for (const w of words) {
    if ((label + " " + w).trim().length > 45) break;
    label = (label + " " + w).trim();
  }
  return label || `Chapter ${pageNum}`;
}

// ── Story-specific marketing data ──
const STORY_DATA = {
  "Aladdin and the Wonderful Lamp": {
    emoji: "🪔",
    desc: "🌙 Aladdin and the Wonderful Lamp — a soothing bedtime story for kids ages 3-7. A magical journey with a kind-hearted boy who discovers a mysterious lamp in a hidden cave. With a powerful genie granting wishes, Aladdin must use courage and cleverness to outsmart the wicked sorcerer. Gentle narration with calming ambient music, perfect for drifting off to sleep. ✨",
    hashtags: "#bedtimestory #aladdin #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids",
    tags: "bedtime story, aladdin, magic lamp, genie, kids story, children's story, sleep story, fairy tale, arabian nights, bedtime for kids, soothing narration, story time, read aloud, kids bedtime, bedtime stories for kids, night stories, goreadling, calming story, bedtime stories for toddlers, sleep stories for children, fairy tales for kids, full story, 2026",
  },
  "Pocahontas, Daughter of the River": {
    emoji: "🌿",
    desc: "🌙 Pocahontas, Daughter of the River — a gentle bedtime story for kids ages 3-7. Follow a brave and curious young girl who bridges two worlds with kindness and courage. Pocahontas befriends woodland creatures, listens to the wisdom of the wind, and brings peace between her people and newcomers. Calming narration with soft ambient music. ✨",
    hashtags: "#bedtimestory #pocahontas #nature #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, pocahontas, nature, brave girl, kids story, children's story, sleep story, native american tale, bedtime for kids, soothing narration, story time, read aloud, river, forest, adventure, night stories, goreadling, calming story, bedtime stories for toddlers, fairy tales for kids, full story, 2026",
  },
  "Snow White and the Seven Dwarfs": {
    emoji: "🍎",
    desc: "🌙 Snow White and the Seven Dwarfs — a soothing bedtime story for kids ages 3-7. The beloved tale of a kind princess who finds friendship and shelter with seven lovable dwarfs in the enchanted forest. When the wicked queen's jealousy puts Snow White in danger, only true love and loyal friends can save the day. Gentle ambient music for peaceful sleep. ✨",
    hashtags: "#bedtimestory #snowwhite #sevendwarfs #princess #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud",
    tags: "bedtime story, snow white, seven dwarfs, princess, kids story, children's story, sleep story, fairy tale, enchanted forest, magic mirror, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, classic fairy tale, bedtime stories for toddlers, full story, 2026",
  },
  "The Three Little Pigs": {
    emoji: "🐷",
    desc: "🌙 The Three Little Pigs — a fun bedtime story for kids ages 3-7. Three piggy brothers set out to build their own homes. Will straw and sticks stand against the big bad wolf's huffing and puffing? Only the wisest pig's brick house can keep everyone safe! A playful bedtime story with gentle music, teaching hard work and perseverance. ✨",
    hashtags: "#bedtimestory #threelittlepigs #bigbadwolf #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, three little pigs, big bad wolf, kids story, children's story, sleep story, fairy tale, brick house, bedtime for kids, soothing narration, story time, read aloud, moral story, hard work, night stories, goreadling, bedtime stories for toddlers, full story, 2026",
  },
  "The Gingerbread Man": {
    emoji: "🍪",
    desc: "🌙 The Gingerbread Man — a delightful bedtime story for kids ages 3-7. Run, run, as fast as you can! A cheeky cookie jumps out of the oven and leads everyone on a merry chase through the countryside. From the baker to the farmer to the crafty fox — who will catch the Gingerbread Man? Fun and rhythmic with soothing ambient music. ✨",
    hashtags: "#bedtimestory #gingerbreadman #runrun #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, gingerbread man, run run, kids story, children's story, sleep story, fairy tale, fox, chase, bedtime for kids, soothing narration, story time, read aloud, nursery tale, night stories, goreadling, bedtime stories for toddlers, full story, 2026",
  },
  "Marina the Little Mermaid": {
    emoji: "🧜‍♀️",
    desc: "🌙 Marina the Little Mermaid — a dreamy bedtime story for kids ages 3-7. Dive into an underwater adventure with a kind mermaid princess who longs to explore the world above the waves. Follow Marina through coral gardens, moonlit shores, and a journey of courage and self-discovery. Soft ambient music for peaceful sleep. ✨",
    hashtags: "#bedtimestory #littlemermaid #mermaid #ocean #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, little mermaid, mermaid, ocean, underwater, kids story, children's story, sleep story, fairy tale, sea princess, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, bedtime stories for toddlers, full story, 2026",
  },
  "Goldilocks and the Three Bears": {
    emoji: "🐻",
    desc: "🌙 Goldilocks and the Three Bears — a warm bedtime story for kids ages 3-7. A curious girl named Goldie stumbles upon the Bruin family's cottage deep in the pine hills. She tries their porridge, breaks a cherry-red stool, and falls asleep in a cozy bed. When the three bears come home, an unexpected friendship begins. Gentle ambient music. ✨",
    hashtags: "#bedtimestory #goldilocks #threebears #porridge #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, goldilocks, three bears, porridge, kids story, children's story, sleep story, fairy tale, pine hills, just right, bedtime for kids, soothing narration, story time, read aloud, classic tale, friendship, night stories, goreadling, full story, 2026",
  },
  "Jack and the Beanstalk": {
    emoji: "🌱",
    desc: "🌙 Jack and the Beanstalk — an enchanting bedtime story for kids ages 3-7. A brave boy trades his cow for magic beans. When a towering beanstalk sprouts overnight, Jack climbs into a land above the clouds where a fearsome giant guards treasures of gold. Adventure, courage, and a thrilling escape await! Soothing narration with gentle music. ✨",
    hashtags: "#bedtimestory #jackandthebeanstalk #magicbeans #giant #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, jack and the beanstalk, magic beans, giant, kids story, children's story, sleep story, fairy tale, beanstalk, clouds, golden harp, bedtime for kids, soothing narration, story time, read aloud, adventure, night stories, goreadling, full story, 2026",
  },
  "Little Red Riding Hood": {
    emoji: "🧣",
    desc: "🌙 Little Red Riding Hood — a gentle bedtime story for kids ages 3-7. Walk through the enchanted forest with a kind girl bringing treats to her grandmother. Along the way she meets a clever wolf with a sneaky plan. Will Red Riding Hood see through the wolf's disguise? A reassuring retelling with soft ambient music for sweet dreams. ✨",
    hashtags: "#bedtimestory #littleredridinghood #wolf #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, little red riding hood, wolf, grandmother, kids story, children's story, sleep story, fairy tale, forest, big bad wolf, bedtime for kids, soothing narration, story time, read aloud, classic fairy tale, night stories, goreadling, full story, 2026",
  },
  "Cinderella": {
    emoji: "👠",
    desc: "🌙 Cinderella — a timeless bedtime story for kids ages 3-7. Dream of magic and kindness with a gentle girl whose life transforms in one enchanted evening. With the help of her fairy godmother, a pumpkin carriage, and glass slippers, Cinderella attends the royal ball. But when the clock strikes midnight... Soothing lullaby music. ✨",
    hashtags: "#bedtimestory #cinderella #glassslipper #fairygodmother #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, cinderella, glass slipper, fairy godmother, prince, kids story, children's story, sleep story, fairy tale, royal ball, pumpkin carriage, midnight, bedtime for kids, soothing narration, story time, read aloud, princess, night stories, goreadling, full story, 2026",
  },
  "The Ugly Duckling": {
    emoji: "🦢",
    desc: "🌙 The Ugly Duckling — a heartwarming bedtime story for kids ages 3-7. Hans Christian Andersen's beloved tale of a little duckling who feels different from everyone else. Teased and lonely, the duckling journeys through the seasons — only to discover a beautiful surprise waiting inside. A soothing story about self-acceptance and inner beauty. ✨",
    hashtags: "#bedtimestory #uglyduckling #swan #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, ugly duckling, swan, kids story, children's story, sleep story, fairy tale, self-acceptance, inner beauty, pond, seasons, bedtime for kids, soothing narration, story time, read aloud, hans christian andersen, night stories, goreadling, full story, 2026",
  },
  "Hansel and Gretel": {
    emoji: "🍭",
    desc: "🌙 Hansel and Gretel — a cozy bedtime story for kids ages 3-7. Two brave siblings venture into the enchanted forest and discover a magical house made of candy and sweets. But things aren't as sweet as they seem! With cleverness and teamwork, Hansel and Gretel outsmart a tricky witch and find their way home. Gentle narration with calming music. ✨",
    hashtags: "#bedtimestory #hanselandgretel #candyhouse #witch #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, hansel and gretel, candy house, witch, kids story, children's story, sleep story, fairy tale, enchanted forest, siblings, breadcrumbs, bedtime for kids, soothing narration, story time, read aloud, brothers grimm, night stories, goreadling, full story, 2026",
  },
  "Rapunzel": {
    emoji: "👸",
    desc: "🌙 Rapunzel — a dreamy bedtime story for kids ages 3-7. A girl with magical golden hair is trapped in a tall tower by a jealous enchantress. When a kind prince hears her beautiful singing, a friendship blossoms. Together they find a way to break free and discover the world beyond. A soothing tale of hope and freedom with gentle ambient music. ✨",
    hashtags: "#bedtimestory #rapunzel #longhair #tower #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, rapunzel, long hair, tower, prince, kids story, children's story, sleep story, fairy tale, enchantress, golden hair, bedtime for kids, soothing narration, story time, read aloud, brothers grimm, freedom, night stories, goreadling, full story, 2026",
  },
  "The Princess and the Pea": {
    emoji: "👑",
    desc: "🌙 The Princess and the Pea — a charming bedtime story for kids ages 3-7. A queen's clever test to find a true princess: on a stormy night, a mysterious girl arrives at the castle. Can she feel a tiny pea hidden beneath twenty mattresses and twenty featherbeds? A whimsical, cozy tale with soft ambient music for sleepy little royals. ✨",
    hashtags: "#bedtimestory #princessandthepea #mattresses #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, princess and the pea, mattresses, royal test, kids story, children's story, sleep story, fairy tale, princess, castle, stormy night, bedtime for kids, soothing narration, story time, read aloud, hans christian andersen, night stories, goreadling, full story, 2026",
  },
  "Puss in Boots": {
    emoji: "🐱",
    desc: "🌙 Puss in Boots — a delightful bedtime story for kids ages 3-7. Meet the cleverest cat in all the kingdom! A resourceful cat helps his humble master become a lord through wit, charm, and a magnificent pair of boots. With quick thinking and bravery, Puss outsmarts an ogre and wins the day. Fun and soothing with gentle ambient music. ✨",
    hashtags: "#bedtimestory #pussinboots #clevercat #ogre #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, puss in boots, clever cat, ogre, kids story, children's story, sleep story, fairy tale, boots, castle, bedtime for kids, soothing narration, story time, read aloud, charles perrault, adventure, night stories, goreadling, full story, 2026",
  },
  "The Tortoise and the Hare": {
    emoji: "🐢",
    desc: "🌙 The Tortoise and the Hare — a gentle bedtime story for kids ages 3-7. Slow and steady wins the race! Aesop's timeless fable about a speedy but overconfident hare who challenges a calm, patient tortoise to a race. While the hare naps under a tree, the tortoise keeps plodding along. A story teaching persistence and determination. ✨",
    hashtags: "#bedtimestory #tortoiseandthehare #race #slowandsteady #kidsstory #fable #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, tortoise and the hare, race, slow and steady, kids story, children's story, sleep story, fable, aesop, patience, determination, bedtime for kids, soothing narration, story time, read aloud, moral story, night stories, goreadling, full story, 2026",
  },
  "The Boy Who Cried Wolf": {
    emoji: "🐺",
    desc: "🌙 The Boy Who Cried Wolf — a thoughtful bedtime story for kids ages 3-7. Young Tomas the shepherd of Millbrook village is so bored watching sheep that he shouts 'Wolf!' just to see the villagers come running. When a real wolf arrives, Tomas must face it alone. A powerful story about honesty, trust, and earning back what you've broken. ✨",
    hashtags: "#bedtimestory #boywhocried wolf #shepherd #honesty #kidsstory #fable #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, boy who cried wolf, shepherd, honesty, kids story, children's story, sleep story, fable, aesop, trust, wolf, village, courage, bedtime for kids, soothing narration, story time, read aloud, moral story, night stories, goreadling, full story, 2026",
  },
  "Pinocchio, the Wooden Boy": {
    emoji: "🪵",
    desc: "🌙 Pinocchio the Wooden Boy — a heartwarming bedtime story for kids ages 3-7. A wooden puppet dreams of becoming a real boy. Created by the kind woodcarver Geppetto, Pinocchio must learn honesty, bravery, and kindness on his magical journey. From talking crickets to whale adventures — every choice brings him closer to his dream. ✨",
    hashtags: "#bedtimestory #pinocchio #woodenboy #geppetto #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, pinocchio, wooden boy, geppetto, kids story, children's story, sleep story, fairy tale, puppet, real boy, honesty, cricket, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "The Wizard of Oz": {
    emoji: "🌈",
    desc: "🌙 The Wizard of Oz — a magical bedtime story for kids ages 3-7. Follow the yellow brick road with Dorothy, swept away by a cyclone to the enchanted Land of Oz. With Toto, a Scarecrow, a Tin Woodman, and a Cowardly Lion, she journeys to the Emerald City to find a way home. A tale of friendship, courage, and believing in yourself. ✨",
    hashtags: "#bedtimestory #wizardofoz #dorothy #yellowbrickroad #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, wizard of oz, dorothy, toto, scarecrow, tin woodman, cowardly lion, emerald city, kids story, children's story, sleep story, fairy tale, yellow brick road, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "The Tale of Peter Rabbit": {
    emoji: "🐰",
    desc: "🌙 The Tale of Peter Rabbit — a cozy bedtime story for kids ages 3-7. Beatrix Potter's beloved tale of a mischievous little rabbit who sneaks into Mr. McGregor's garden. Follow Peter through rows of lettuce, radishes, and French beans as he has a thrilling adventure and learns an important lesson. Soft ambient music for peaceful dreams. ✨",
    hashtags: "#bedtimestory #peterrabbit #beatrixpotter #garden #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, peter rabbit, beatrix potter, garden, mr mcgregor, kids story, children's story, sleep story, classic tale, bunny, rabbit, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "Winnie-the-Pooh and the Honey Tree": {
    emoji: "🍯",
    desc: "🌙 Winnie-the-Pooh and the Honey Tree — a warm bedtime story for kids ages 3-7. Wander into the Hundred Acre Wood with a lovable bear who will do anything for a pot of honey. Join Pooh, Piglet, Rabbit, and friends for gentle adventures filled with kindness, friendship, and lots of honey. Perfectly soothing with soft ambient music. ✨",
    hashtags: "#bedtimestory #winniethepooh #honeytree #hundredacrewood #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, winnie the pooh, hundred acre wood, honey, piglet, rabbit, kids story, children's story, sleep story, classic tale, bear, friendship, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "Sleeping Beauty": {
    emoji: "🌹",
    desc: "🌙 Sleeping Beauty — a timeless bedtime story for kids ages 3-7. A beautiful princess is cursed by a wicked fairy to fall into a deep, magical sleep. Only the bravest prince can break the spell with a kiss of true love. With wise fairy godmothers, a castle wrapped in thorny roses, and a kingdom waiting to awaken. Perfect for carrying little ones off to dreamland. ✨",
    hashtags: "#bedtimestory #sleepingbeauty #princess #curse #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, sleeping beauty, princess, curse, fairy godmother, prince, kids story, children's story, sleep story, fairy tale, enchanted castle, thorns, roses, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "The Frog Prince": {
    emoji: "🐸",
    desc: "🌙 The Frog Prince — a classic bedtime story for kids ages 3-7. A spoiled princess drops her golden ball into a deep well. A friendly frog offers to help — but only if she promises to be his friend. When the princess learns to keep her word, a wonderful transformation awaits! A gentle story about kindness and keeping promises. ✨",
    hashtags: "#bedtimestory #frogprince #princess #goldenball #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, frog prince, princess, golden ball, well, transformation, kids story, children's story, sleep story, fairy tale, brothers grimm, promise, kindness, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "The Elves and the Shoemaker": {
    emoji: "🧝",
    desc: "🌙 The Elves and the Shoemaker — a heartwarming bedtime story for kids ages 3-7. A poor but honest shoemaker wakes each morning to find beautiful shoes mysteriously crafted during the night. Who are the tiny helpers working by moonlight? A cozy story of gratitude, generosity, and the magic of helping each other. Gentle narration with soft ambient music. ✨",
    hashtags: "#bedtimestory #elvesandtheshoemaker #elves #shoes #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, elves and the shoemaker, elves, shoes, cobbler, kids story, children's story, sleep story, fairy tale, brothers grimm, generosity, kindness, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "The Bremen Town Musicians": {
    emoji: "🎶",
    desc: "🌙 The Bremen Town Musicians — a delightful bedtime story for kids ages 3-7. Four aging animals — a donkey, a dog, a cat, and a rooster — set off on a grand adventure to become musicians in Bremen Town. Along the way they discover that friendship and teamwork are the greatest treasures of all. When they stumble upon a robber's hideout, their combined talents save the day! Gentle narration with calming ambient music, perfect for drifting off to sleep. ✨",
    hashtags: "#bedtimestory #brementownmusicians #animals #friendship #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, bremen town musicians, donkey, dog, cat, rooster, kids story, children's story, sleep story, fairy tale, brothers grimm, friendship, teamwork, animals, music, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "Jack and the Seven League Boots": {
    emoji: "👢",
    desc: "🌙 Jack and the Seven League Boots — an exciting bedtime story for kids ages 3-7. From French folklore, a clever young boy discovers magical boots that cover seven leagues in a single step. With bravery and quick thinking, Jack outwits giants and helps those in need on an incredible journey. Thrilling yet soothing with gentle ambient music. ✨",
    hashtags: "#bedtimestory #sevenleagueboots #jack #magicboots #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, seven league boots, jack, magic boots, french folklore, kids story, children's story, sleep story, fairy tale, giant, adventure, bravery, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "Rumpelstiltskin": {
    emoji: "🧶",
    desc: "🌙 Rumpelstiltskin — a captivating bedtime story for kids ages 3-7. A miller's daughter is locked in a room and told to spin straw into gold by morning. A mysterious little man appears to help — but his price is steep. Can the clever girl discover his secret name before it's too late? A story of wit and cleverness with soothing ambient music. ✨",
    hashtags: "#bedtimestory #rumpelstiltskin #spinningwheel #gold #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, rumpelstiltskin, spinning wheel, gold, straw, secret name, kids story, children's story, sleep story, fairy tale, brothers grimm, clever, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "Thumbelina": {
    emoji: "🌸",
    desc: "🌙 Thumbelina — an enchanting bedtime story for kids ages 3-7. Hans Christian Andersen's tale of a girl no bigger than a thumb, born from a magical flower. Follow Thumbelina's journey through meadows, ponds, and underground passages as she meets toads, beetles, mice, and moles — always dreaming of sunshine and flowers. A beautiful tale of hope. ✨",
    hashtags: "#bedtimestory #thumbelina #tinygirl #flower #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, thumbelina, tiny girl, flower, hans christian andersen, kids story, children's story, sleep story, fairy tale, miniature, swallow, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "The Little Match Girl": {
    emoji: "🕯️",
    desc: "🌙 The Little Match Girl — a tender bedtime story for kids ages 3-7. Hans Christian Andersen's beautiful tale of a poor little girl selling matches on a cold New Year's Eve. As she lights each match, she sees wonderful visions of warmth, feasts, and her beloved grandmother's loving smile. A story about hope, love, and the light that shines in the darkest nights. ✨",
    hashtags: "#bedtimestory #littlematchgirl #winter #snow #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories",
    tags: "bedtime story, little match girl, winter, snow, matches, hope, hans christian andersen, kids story, children's story, sleep story, fairy tale, new year, grandmother, warmth, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "The Golden Goose": {
    emoji: "🪿",
    desc: "🌙 The Golden Goose — a magical bedtime story for kids ages 3-7. A kind-hearted boy named Pip shares his meal with a mysterious old woman and is rewarded with a magical golden goose. Whoever touches it gets stuck — leading to a hilarious, growing chain of villagers following Pip through the kingdom! Can Pip make the sad princess laugh and find true happiness? A funny and heartwarming fairy tale with gentle narration and calming music. ✨",
    hashtags: "#bedtimestory #goldengoose #fairytale #kidsstory #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids",
    tags: "bedtime story, golden goose, fairy tale, magic goose, kids story, children's story, sleep story, Grimm fairy tale, princess, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, funny story, classic fairy tale, bedtime stories for toddlers, full story, 2026",
  },
  "The Brave Little Tailor": {
    emoji: "🪡",
    desc: "🌙 The Brave Little Tailor — a fun bedtime story for kids ages 3-7. A clever little tailor named Finn swats seven flies in one blow and embroiders a belt to prove it! His boastful adventure leads him through encounters with grumpy giants, a wild unicorn, and a fierce boar — outsmarting them all with wit and courage. Can Finn win the king's challenges and the princess's heart? A classic Brothers Grimm tale with gentle narration and calming music. ✨",
    hashtags: "#bedtimestory #bravelittletailor #fairytale #kidsstory #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids",
    tags: "bedtime story, brave little tailor, seven at one blow, tailor, giants, unicorn, wild boar, kids story, children's story, sleep story, fairy tale, Grimm fairy tale, princess, king, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, classic fairy tale, bedtime stories for toddlers, full story, 2026",
  },
  "The Pied Piper of Hamelin": {
    emoji: "🪈",
    desc: "🌙 The Pied Piper of Hamelin — a magical bedtime story for kids ages 3-7. When the town of Hamelin is overrun by mischievous rats, a mysterious piper appears with a promise to solve everything — for a price. But when greedy Mayor Hubert breaks his word, the piper's enchanted melody leads to consequences no one expected. A timeless tale about honesty, promises, and the magic of music. Gentle narration with calming ambient music, perfect for drifting off to sleep. ✨",
    hashtags: "#bedtimestory #piedpiper #hamelin #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids",
    tags: "bedtime story, pied piper, pied piper of hamelin, rats, magic flute, kids story, children's story, sleep story, fairy tale, brothers grimm, promises, honesty, music, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, classic fairy tale, bedtime stories for toddlers, full story, 2026",
  },
  "The Emperor's New Clothes": {
    emoji: "👔",
    desc: "🌙 The Emperor's New Clothes — a hilarious bedtime story for kids ages 3-7. A vain emperor hires two cunning swindlers who promise fabric so special that it's invisible to anyone who is foolish. The emperor, his ministers, and the entire kingdom pretend they can see the beautiful clothes — until one honest little child shouts the truth! A timeless Hans Christian Andersen tale about honesty, vanity, and the courage to speak up. Gentle narration with calming ambient music. ✨",
    hashtags: "#bedtimestory #emperorsnewclothes #honesty #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids",
    tags: "bedtime story, emperor's new clothes, hans christian andersen, honesty, vanity, kids story, children's story, sleep story, fairy tale, swindlers, truth, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, classic fairy tale, full story, 2026",
  },
  "The Twelve Dancing Princesses": {
    emoji: "💃",
    desc: "🌙 The Twelve Dancing Princesses — a magical bedtime story for kids ages 3-7. Every morning, twelve princesses wake up with their dancing shoes worn through — but no one can discover where they go at night! When a kind soldier receives a magical cloak of invisibility, he follows the princesses through a hidden trapdoor into breathtaking underground kingdoms of silver, golden, and diamond trees, where they dance the night away. A fairy tale full of mystery, magic, and enchantment. Gentle narration with dreamy ambient music. ✨",
    hashtags: "#bedtimestory #twelveprincessses #dancing #fairytale #kidsstory #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids",
    tags: "bedtime story, twelve dancing princesses, princesses, dancing, soldier, magic cloak, invisibility, underground kingdom, kids story, children's story, sleep story, fairy tale, brothers grimm, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "Stone Soup": {
    emoji: "🍲",
    desc: "🌙 Stone Soup — a heartwarming bedtime story for kids ages 3-7. A hungry, clever traveler arrives in a village where nobody wants to share. He announces he'll make the most delicious soup from nothing but a stone and water! One by one, curious villagers add 'just a little something' — until the whole village is sharing the most wonderful feast. A warm folk tale about generosity, community, and the magic of sharing. Gentle narration with cozy ambient music. ✨",
    hashtags: "#bedtimestory #stonesoup #sharing #community #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids",
    tags: "bedtime story, stone soup, sharing, community, generosity, soup, village, travelers, kids story, children's story, sleep story, folk tale, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, classic story, full story, 2026",
  },
  "The Little Red Hen": {
    emoji: "🐔",
    desc: "🌙 The Little Red Hen — a charming bedtime story for kids ages 3-7. A hardworking hen finds a grain of wheat and asks her farmyard friends for help planting, harvesting, milling, and baking — 'Not I!' they all say every time. But when the warm, golden bread comes fresh out of the oven, suddenly everyone wants to help eat it! A beloved tale about hard work, fairness, and earning your rewards. Fun narration with playful animal characters and gentle music. ✨",
    hashtags: "#bedtimestory #littleredhen #hardwork #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids",
    tags: "bedtime story, little red hen, hard work, baking bread, farm animals, cat, dog, duck, kids story, children's story, sleep story, folk tale, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, classic story, full story, 2026",
  },
  "Beauty and the Beast": {
    emoji: "🌹",
    desc: "🌙 Beauty and the Beast — a timeless bedtime story for kids ages 3-7. When a merchant plucks a rose from a mysterious castle garden, a fearsome Beast demands a terrible price. His brave daughter Beauty offers to take her father's place, and slowly discovers that beneath the Beast's frightening exterior beats the gentlest of hearts. A tale of love, kindness, inner beauty, and transformation. Multi-voice narration with magical atmosphere and soothing ambient music. ✨",
    hashtags: "#bedtimestory #beautyandthebeast #love #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids",
    tags: "bedtime story, beauty and the beast, enchanted castle, rose, prince, transformation, love, inner beauty, kids story, children's story, sleep story, fairy tale, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, classic fairy tale, full story, 2026",
  },
  "The Steadfast Tin Soldier": {
    emoji: "🪖",
    desc: "🌙 The Steadfast Tin Soldier — a touching bedtime story for kids ages 3-7. Among twenty-five tin soldiers, one stands out — he has only one leg, but stands just as straight and proud as any soldier. He falls in love with a beautiful paper ballerina and embarks on an incredible journey through rain gutters, paper boats, and even the belly of a fish — never losing his courage or devotion. A beautiful Hans Christian Andersen tale about loyalty, bravery, and enduring love. ✨",
    hashtags: "#bedtimestory #tinsoldier #bravery #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids",
    tags: "bedtime story, steadfast tin soldier, tin soldier, ballerina, bravery, loyalty, love, hans christian andersen, kids story, children's story, sleep story, fairy tale, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, classic fairy tale, full story, 2026",
  },
  "Ali Baba and the Forty Thieves": {
    emoji: "💰",
    desc: "🌙 Ali Baba and the Forty Thieves — a thrilling bedtime story for kids ages 3-7. A humble woodcutter discovers the secret cave of forty fearsome thieves — 'Open, Sesame!' reveals treasure beyond imagination. But when the ruthless chief thief discovers someone knows their secret, Ali Baba and his clever servant Morgiana must outwit the entire band. A classic Arabian Nights adventure full of cunning, courage, and the triumph of cleverness. Gentle narration with dramatic sound effects. ✨",
    hashtags: "#bedtimestory #alibaba #fortythieves #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids",
    tags: "bedtime story, ali baba, forty thieves, open sesame, treasure, cave, arabian nights, morgiana, kids story, children's story, sleep story, fairy tale, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, adventure, full story, 2026",
  },
  "The Jungle Book": {
    emoji: "🐯",
    desc: "🌙 The Jungle Book — an epic bedtime story for kids ages 3-7. A young boy named Mowgli is raised by wolves in the heart of the Indian jungle. Under the watchful eyes of Bagheera the panther and Baloo the bear, Mowgli learns the laws of the jungle. But the fearsome tiger Shere Khan believes the man-cub has no place among the animals, setting the stage for an epic confrontation. Rudyard Kipling's timeless adventure about identity, courage, and belonging. Gentle narration with lush jungle sounds. ✨",
    hashtags: "#bedtimestory #junglebook #mowgli #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids",
    tags: "bedtime story, jungle book, mowgli, bagheera, baloo, shere khan, wolves, panther, bear, tiger, indian jungle, rudyard kipling, kids story, children's story, sleep story, adventure, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, full story, 2026",
  },
  "The Snow Queen": {
    emoji: "❄️",
    desc: "🌙 The Snow Queen — an enchanting bedtime story for kids ages 3-7. A brave girl journeys through enchanted forests, royal palaces, and frozen wastelands to rescue her best friend from the Snow Queen's icy spell. She meets a wise raven, kind royals, a spirited robber girl, and a loyal reindeer. A beloved Hans Christian Andersen tale about friendship, courage, and the warmth of love. Gentle narration with winter ambient sounds. ✨",
    hashtags: "#bedtimestory #snowqueen #fairytale #kidsstory #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids #hanschristianandersen",
    tags: "bedtime story, snow queen, hans christian andersen, ice queen, frozen, friendship, love, courage, raven, reindeer, fairy tale, kids story, children's story, sleep story, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, classic fairy tale, full story, 2026",
  },
  "The Nutcracker": {
    emoji: "🎄",
    desc: "🌙 The Nutcracker — a magical bedtime story for kids ages 3-7. On Christmas Eve, a girl receives a nutcracker toy that comes to life at midnight. Together they battle the Mouse King and journey to the enchanted Land of Sweets, where dancing snowflakes and sugar plum fairies celebrate. A beloved holiday classic with dreamy narration and magical ambient music. ✨",
    hashtags: "#bedtimestory #nutcracker #christmas #kidsstory #fairytale #sleepstory #bedtimeforkids #goreadling #storytime #readaloud #nightstories #bedtimestoriesforkids #holiday",
    tags: "bedtime story, nutcracker, christmas, holiday, mouse king, sugar plum fairy, land of sweets, ballet, kids story, children's story, sleep story, fairy tale, bedtime for kids, soothing narration, story time, read aloud, night stories, goreadling, classic story, full story, 2026",
  },
};

// ── Main ──
async function main() {
  console.log("🎬 Generating YouTube Marketing doc with timestamps...\n");

  // Read existing header (everything before first VIDEO entry)
  const existingContent = fs.readFileSync(OUTPUT_FILE, "utf8");
  const headerEndIdx = existingContent.indexOf("\n═══════════════════════════════════════════════════\nVIDEO 1:");
  const header = headerEndIdx > 0 ? existingContent.slice(0, headerEndIdx) : existingContent;

  const videoEntries = [];

  for (let i = 0; i < PODCAST_STORIES.length; i++) {
    const story = PODCAST_STORIES[i];
    const name = safeTitle(story.title);
    const mp3Path = findMp3(story.title);
    const num = i + 1;

    console.log(`📖 ${num}. ${story.title}`);

    let data = STORY_DATA[story.title];
    if (!data) {
      console.log(`   🤖 No STORY_DATA entry — auto-generating via Gemini...`);
      try {
        const synopsis = story.pages?.[0] ? pageToText(story.pages[0]).slice(0, 300) : '';
        data = await generateStoryData(story.title, synopsis);
        console.log(`   ✅ Generated: ${data.emoji} ${story.title}`);
      } catch (err) {
        console.log(`   ⚠️ Auto-generate failed: ${err.message}, skipping`);
        continue;
      }
    }

    // Get duration and timestamps
    let durationMin = "??";
    let chaptersText = "";

    if (mp3Path) {
      try {
        const { boundaries, totalDuration } = detectBoundaries(mp3Path);
        durationMin = Math.round(totalDuration / 60);

        // Build chapter labels: intro, pages, outro
        const numPages = story.pages.length;
        const chapLabels = ["Intro"];
        for (let p = 0; p < numPages; p++) {
          chapLabels.push(chapterLabel(pageToText(story.pages[p]), p + 1));
        }
        chapLabels.push("Outro — Goodnight");

        // Match boundaries to labels (use min count)
        const count = Math.min(boundaries.length, chapLabels.length);
        const lines = [];
        for (let j = 0; j < count; j++) {
          lines.push(`${fmtTime(boundaries[j])} ${chapLabels[j]}`);
        }
        chaptersText = lines.join("\n");
        console.log(`   ✅ ${count} chapters, ${durationMin} min`);
      } catch (err) {
        console.log(`   ⚠️ Silence detection failed: ${err.message}`);
      }
    } else {
      console.log(`   ❌ No MP3 found`);
    }

    // Construct title (keep under 60 chars)
    let shortTitle = story.title;
    // Remove common long suffixes for title brevity
    if (story.title === "Pinocchio, the Wooden Boy") shortTitle = "Pinocchio";
    if (story.title === "Pocahontas, Daughter of the River") shortTitle = "Pocahontas";
    if (story.title === "Winnie-the-Pooh and the Honey Tree") shortTitle = "Winnie-the-Pooh";
    if (story.title === "Marina the Little Mermaid") shortTitle = "The Little Mermaid";

    const titleStr = `${shortTitle} | Bedtime Story for Kids | ${durationMin} Min`;

    // Build entry
    let entry = `
═══════════════════════════════════════════════════
VIDEO ${num}: ${story.title}
═══════════════════════════════════════════════════

File name (rename before upload):
${kebab(shortTitle)}-bedtime-story-for-kids.mp4

Title:
${titleStr}

Description:
${data.desc}

📖 Chapters:
${chaptersText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 Read this story with illustrations and word highlighting:
https://goreadling.com/stories/${kebab(story.title)}

📱 Download GoReadling — AI bedtime stories for kids:
https://apps.apple.com/app/goreadling/id6755505679

${SPOTIFY_IDS[story.title] ? `🎧 Listen on Spotify:\nhttps://open.spotify.com/episode/${SPOTIFY_IDS[story.title]}` : `🎧 Listen on Spotify:\nhttps://open.spotify.com/show/5Xibl3BuCkhfxRJRu5v6ML`}

📚 More free bedtime stories: https://goreadling.com/stories

You might also enjoy:
${(() => {
      const others = PODCAST_STORIES.filter(s => s.title !== story.title);
      const picks = others.sort(() => 0.5 - Math.random()).slice(0, 3);
      return picks.map(s => `${s.title}: https://goreadling.com/stories/${kebab(s.title)}`).join('\n');
    })()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GoReadling creates personalized AI stories with beautiful illustrations, read-aloud narration, and fun learning games. 157+ free stories — no sign-up needed!

${data.hashtags}

Tags:
${data.tags}`;

    videoEntries.push(entry);
  }

  // Write full file
  const output = header + "\n" + videoEntries.join("\n") + "\n";
  fs.writeFileSync(OUTPUT_FILE, output, "utf8");
  console.log(`\n✅ Wrote ${OUTPUT_FILE} (${videoEntries.length} videos)`);
}

main();
