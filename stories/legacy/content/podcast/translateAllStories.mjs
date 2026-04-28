#!/usr/bin/env node

/**
 * Batch orchestrator: translate + generate TTS + swap audio for all stories in a language.
 * Runs up to N stories in PARALLEL, each with a DEDICATED API key (no rotation conflicts).
 *
 * Usage:
 *   node content/podcast/translateAllStories.mjs --lang es              # full pipeline, parallel
 *   node content/podcast/translateAllStories.mjs --lang es,pt,zh,hi,ru  # all 5 languages
 *   node content/podcast/translateAllStories.mjs --lang es --only-translate
 *   node content/podcast/translateAllStories.mjs --lang es --only-tts
 *   node content/podcast/translateAllStories.mjs --lang es --only-swap
 *   node content/podcast/translateAllStories.mjs --lang es --story "Cinderella"
 */

import { execSync, spawn } from "node:child_process";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { TRANSLATABLE_STORIES, KLING_STORIES, getLang } from "./languageConfig.mjs";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });

const NODE = "/usr/local/bin/node";
const SCRIPTS_DIR = "content/podcast";

// ── Collect API keys ──
const API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean);

const PARALLELISM = API_KEYS.length; // 3 parallel stories, 1 dedicated key each (RPM limit is per-key)

// ── CLI args ──
const args = process.argv.slice(2);
const langArg = args.find((a) => a.startsWith("--lang="))?.split("=")[1] ||
  args[args.indexOf("--lang") + 1];
const storyArg = args.find((a) => a.startsWith("--story="))?.split("=")[1] ||
  (args.indexOf("--story") !== -1 ? args[args.indexOf("--story") + 1] : null);
const onlyTranslate = args.includes("--only-translate");
const onlyTts = args.includes("--only-tts");
const onlySwap = args.includes("--only-swap");
const doUpload = args.includes("--upload");
const doPublic = args.includes("--make-public");

if (!langArg) {
  console.error("Usage: node translateAllStories.mjs --lang <es|pt|zh|hi|ru> [--story <title>] [--only-translate|--only-tts|--only-swap]");
  process.exit(1);
}

const langs = langArg.split(",");

// KLING_STORIES imported from languageConfig.mjs (single source of truth)

const targetStories = storyArg
  ? TRANSLATABLE_STORIES.filter((s) => s.toLowerCase().includes(storyArg.toLowerCase()))
  : KLING_STORIES;

const safeTitle = (t) => t.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");

// ── Run a command, return promise ──
function runAsync(cmd, label, env = {}) {
  return new Promise((resolve) => {
    console.log(`  🔧 ${label}`);
    const child = spawn("bash", ["-c", cmd], {
      stdio: "inherit",
      env: { ...process.env, ...env },
      timeout: 600000,
    });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

// ── Process one story (translate → TTS → swap) ──
async function processStory(title, lang, keyIndex) {
  const safe = safeTitle(title);
  const storyDir = fs.readdirSync("exports/stories/_published")
    .filter((d) => d.startsWith(safe + "_"))
    .sort().reverse()[0];

  if (!storyDir) {
    console.log(`  ❌ No folder for "${title}"`);
    return false;
  }

  const spotifyDir = `exports/stories/_published/${storyDir}/spotify`;
  const keyNum = keyIndex + 1; // --key is 1-based

  // Check if already complete (has MP4)
  const mp4Path = `exports/stories/_published/${storyDir}/${lang}/youtube/${safe}_${lang}.mp4`;
  if (fs.existsSync(mp4Path)) {
    console.log(`  ⏩ ${title} → ${lang} already complete`);
    return true;
  }

  // Check if MP3 already exists (TTS done, just need swap)
  const mp3Path = `exports/stories/_published/${storyDir}/${lang}/spotify/${safe}_${lang}.mp3`;
  const hasMp3 = fs.existsSync(mp3Path);

  let ok = true;

  // Step 1: Translate (fast, uses text model not TTS)
  if (!onlyTts && !onlySwap) {
    ok = await runAsync(
      `${NODE} ${SCRIPTS_DIR}/translateStory.mjs "${title}" --lang ${lang}`,
      `[Key ${keyNum}] Translating "${title}" → ${lang}`
    );
    if (!ok) return false;
  }

  // Step 2: Generate TTS (slow, uses dedicated key)
  if (!onlyTranslate && !onlySwap && !hasMp3) {
    ok = await runAsync(
      `STORY_SPOTIFY_DIR="${spotifyDir}" ${NODE} ${SCRIPTS_DIR}/generatePodcast.mjs "${title}" --lang ${lang} --key ${keyNum}`,
      `[Key ${keyNum}] TTS "${title}" → ${lang}`
    );
    if (!ok) return false;
  } else if (hasMp3 && !onlyTranslate && !onlySwap) {
    console.log(`  ⏩ ${title} MP3 exists, skipping TTS`);
  }

  // Step 3: Swap audio
  if (!onlyTranslate && !onlyTts) {
    ok = await runAsync(
      `${NODE} ${SCRIPTS_DIR}/swapAudioTrack.mjs "${title}" --lang ${lang}`,
      `[Key ${keyNum}] Swap audio "${title}" → ${lang}`
    );
    if (!ok) return false;
  }

  return true;
}

// ── Main: parallel execution ──
console.log(`\n🌍 Multilingual Pipeline (${PARALLELISM} parallel, 1 key each)`);
console.log(`   Languages: ${langs.map((l) => getLang(l).name).join(", ")}`);
console.log(`   Stories: ${targetStories.length}`);
console.log(`   API Keys: ${API_KEYS.length}`);
console.log(`   Mode: ${onlyTranslate ? "translate only" : onlyTts ? "TTS only" : onlySwap ? "swap only" : "full pipeline"}\n`);

let totalDone = 0;
let totalFailed = 0;

for (const lang of langs) {
  const langConfig = getLang(lang);
  console.log(`\n${"═".repeat(60)}`);
  console.log(`🌍 ${langConfig.name} (${langConfig.nativeName})`);
  console.log(`${"═".repeat(60)}\n`);

  // Process stories in batches of PARALLELISM
  for (let i = 0; i < targetStories.length; i += PARALLELISM) {
    const batch = targetStories.slice(i, i + PARALLELISM);
    console.log(`\n── Batch ${Math.floor(i / PARALLELISM) + 1}: ${batch.map(t => t.split(' ').slice(0,3).join(' ')).join(', ')} ──\n`);

    const results = await Promise.all(
      batch.map((title, j) => processStory(title, lang, j))
    );

    for (let k = 0; k < results.length; k++) {
      if (results[k]) totalDone++;
      else totalFailed++;
    }
  }
}

// ── Upload to YouTube ──
if (doUpload) {
  for (const lang of langs) {
    console.log(`\n📤 Uploading ${lang.toUpperCase()} to YouTube...`);
    await runAsync(
      `${NODE} ${SCRIPTS_DIR}/uploadMultilangYoutube.mjs --lang ${lang}`,
      `Uploading ${lang} videos`
    );
  }
}

// ── Make public ──
if (doPublic) {
  console.log(`\n🌐 Making all private videos public...`);
  await runAsync(
    `${NODE} -e "
      const{google}=require('googleapis');const fs=require('fs');
      const auth=google.auth.fromJSON(JSON.parse(fs.readFileSync('token.json','utf8')));
      const yt=google.youtube({version:'v3',auth});
      (async()=>{let m=0,np;do{const r=await yt.search.list({part:'id',forMine:true,type:'video',maxResults:50,pageToken:np});
      for(const i of r.data.items||[]){const v=await yt.videos.list({part:'status',id:i.id.videoId});const s=v.data.items?.[0];
      if(s?.status?.privacyStatus==='private'){await yt.videos.update({part:'status',requestBody:{id:s.id,status:{privacyStatus:'public',selfDeclaredMadeForKids:true}}});m++;}}
      np=r.data.nextPageToken;}while(np);console.log(m+' videos made public');})();
    "`,
    `Making videos public`
  );
}

console.log(`\n${"═".repeat(60)}`);
console.log(`✅ Done! ${totalDone} completed, ${totalFailed} failed.`);
console.log(`${"═".repeat(60)}\n`);
