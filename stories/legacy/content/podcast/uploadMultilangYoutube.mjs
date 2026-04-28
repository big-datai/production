#!/usr/bin/env node

/**
 * Upload multilingual story videos to YouTube.
 * Finds all *_{lang}.mp4 files, uploads with localized titles/descriptions,
 * and adds to language-specific playlists.
 *
 * Usage:
 *   node content/podcast/uploadMultilangYoutube.mjs --lang es
 *   node content/podcast/uploadMultilangYoutube.mjs --lang es --story "Cinderella"
 *   node content/podcast/uploadMultilangYoutube.mjs --lang es,hi,ar
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { google } from "googleapis";
import { getLang, TRANSLATABLE_STORIES, KLING_STORIES } from "./languageConfig.mjs";

const TOKEN_PATH = path.resolve(process.cwd(), "token.json");
const STORIES_DIR = path.resolve("exports/stories/_published");

const safeTitle = (t) => t.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");

// ── Auth ──
async function getAuth() {
  const creds = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  return google.auth.fromJSON(creds);
}

// ── Find story MP4 for a language ──
function findLangMp4(title, lang) {
  const safe = safeTitle(title);
  const dir = fs.readdirSync(STORIES_DIR).find((d) => d.startsWith(safe + "_"));
  if (!dir) return null;
  const mp4 = path.join(STORIES_DIR, dir, lang, "youtube", `${safe}_${lang}.mp4`);
  return fs.existsSync(mp4) ? mp4 : null;
}

// ── Get MP3 duration ──
import { execSync } from "node:child_process";

function getMp3Duration(title, lang) {
  const safe = safeTitle(title);
  const dir = fs.readdirSync(STORIES_DIR).find((d) => d.startsWith(safe + "_"));
  if (!dir) return 0;
  const mp3 = path.join(STORIES_DIR, dir, lang, "spotify", `${safe}_${lang}.mp3`);
  if (!fs.existsSync(mp3)) return 0;
  try {
    return parseFloat(
      execSync(`/usr/local/bin/ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp3}"`, { encoding: "utf8" }).trim()
    );
  } catch {
    return 0;
  }
}

// ── Get translated title from story_*.json ──
function getTranslatedTitle(title, lang) {
  const safe = safeTitle(title);
  const dir = fs.readdirSync(STORIES_DIR).find((d) => d.startsWith(safe + "_"));
  if (!dir) return title;
  const jsonPath = path.join(STORIES_DIR, dir, lang, "text", `story_${lang}.json`);
  if (!fs.existsSync(jsonPath)) return title;
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    return data.titleTranslated || title;
  } catch {
    return title;
  }
}

// ── Build description ──
function buildDescription(title, translatedTitle, lang, langConfig) {
  const appUrl = "https://apps.apple.com/app/goreadling/id6755505679";
  const webUrl = `https://goreadling.com/stories/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const descriptions = {
    es: `${langConfig.descIntro(translatedTitle)}

Una historia clásica narrada con múltiples voces, música relajante e ilustraciones animadas. Perfecta para la hora de dormir para niños de 3 a 8 años.

📖 Lee esta historia con ilustraciones: ${webUrl}
📱 Descarga GoReadling gratis: ${appUrl}
🎧 Escucha en Spotify: https://open.spotify.com/show/5Xibl3BuCkhfxRJRu5v6ML
📺 Más cuentos: https://www.youtube.com/@goreadling

#cuentosparadormir #cuentosinfantiles #historiasparaninos #cuentosparadormir #bedtimestories`,

    hi: `${langConfig.descIntro(translatedTitle)}

कई आवाज़ों में सुनाई गई एक क्लासिक कहानी, आरामदायक संगीत और एनिमेटेड चित्रों के साथ। 3 से 8 साल के बच्चों के लिए सोने की कहानी।

📖 इस कहानी को चित्रों के साथ पढ़ें: ${webUrl}
📱 GoReadling मुफ्त डाउनलोड करें: ${appUrl}
🎧 Spotify पर सुनें: https://open.spotify.com/show/5Xibl3BuCkhfxRJRu5v6ML
📺 और कहानियाँ: https://www.youtube.com/@goreadling

#सोनेकीकहानी #बच्चोंकीकहानी #हिंदीकहानी #bedtimestories`,

    ar: `${langConfig.descIntro(translatedTitle)}

قصة كلاسيكية مروية بأصوات متعددة، مع موسيقى هادئة ورسوم متحركة. مثالية لوقت النوم للأطفال من 3 إلى 8 سنوات.

📖 اقرأ هذه القصة مع الرسوم: ${webUrl}
📱 حمّل GoReadling مجاناً: ${appUrl}
🎧 استمع على سبوتيفاي: https://open.spotify.com/show/5Xibl3BuCkhfxRJRu5v6ML
📺 المزيد من القصص: https://www.youtube.com/@goreadling

#قصص_اطفال #قصص_قبل_النوم #حكايات_اطفال #bedtimestories`,

    pt: `${langConfig.descIntro(translatedTitle)}

Uma história clássica narrada com múltiplas vozes, música relaxante e ilustrações animadas. Perfeita para a hora de dormir para crianças de 3 a 8 anos.

📖 Leia esta história com ilustrações: ${webUrl}
📱 Baixe GoReadling grátis: ${appUrl}
📺 Mais histórias: https://www.youtube.com/@goreadling

#historiasparadormir #contosinfantis #historiaparacriancas #bedtimestories`,

    ru: `${langConfig.descIntro(translatedTitle)}

Классическая сказка с многоголосой озвучкой, расслабляющей музыкой и анимированными иллюстрациями. Идеально для засыпания детей от 3 до 8 лет.

📖 Читайте эту сказку с иллюстрациями: ${webUrl}
📱 Скачайте GoReadling бесплатно: ${appUrl}
📺 Ещё сказки: https://www.youtube.com/@goreadling

#сказкинаночь #сказкидлядетей #детскиесказки #bedtimestories`,
  };

  return descriptions[lang] || descriptions.es;
}

// ── Tags per language ──
const TAGS = {
  es: "cuentos para dormir,cuentos infantiles,historias para ninos,cuento para dormir,bedtime stories,bedtime stories for kids,cuentos para ninos,historias infantiles,cuentos animados,musica relajante para ninos",
  hi: "सोने की कहानी,बच्चों की कहानी,हिंदी कहानी,bedtime stories hindi,hindi stories for kids,kids stories hindi,सोने की कहानियाँ,बच्चों की कहानियाँ,bedtime stories,hindi fairy tales",
  ar: "قصص اطفال,قصص قبل النوم,حكايات اطفال,bedtime stories arabic,arabic stories for kids,قصص للاطفال,حكايات قبل النوم,قصص اطفال قبل النوم,bedtime stories",
  pt: "historias para dormir,contos infantis,historias para criancas,bedtime stories portuguese,historias infantis,contos para dormir,bedtime stories for kids",
  ru: "сказки на ночь,сказки для детей,детские сказки,bedtime stories russian,русские сказки,сказки перед сном,bedtime stories for kids",
};

// ── Main ──
const args = process.argv.slice(2);
const langArg = args.find((a) => a.startsWith("--lang="))?.split("=")[1] || args[args.indexOf("--lang") + 1];
const storyArg = args.find((a) => a.startsWith("--story="))?.split("=")[1] || (args.indexOf("--story") !== -1 ? args[args.indexOf("--story") + 1] : null);

if (!langArg) {
  console.error("Usage: node uploadMultilangYoutube.mjs --lang es [--story title]");
  process.exit(1);
}

const langs = langArg.split(",");
const auth = await getAuth();
const youtube = google.youtube({ version: "v3", auth });

// KLING_STORIES imported from languageConfig.mjs (single source of truth)

const stories = storyArg
  ? KLING_STORIES.filter((s) => s.toLowerCase().includes(storyArg.toLowerCase()))
  : KLING_STORIES;

for (const lang of langs) {
  const langConfig = getLang(lang);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🌍 Uploading ${lang.toUpperCase()} videos to YouTube`);
  console.log(`${"=".repeat(60)}\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const title of stories) {
    const mp4 = findLangMp4(title, lang);
    if (!mp4) {
      console.log(`  ❌ ${title} — no ${lang} MP4`);
      skipped++;
      continue;
    }

    const translatedTitle = getTranslatedTitle(title, lang);
    const fileSize = fs.statSync(mp4).size;
    const dur = getMp3Duration(title, lang);
    const mins = dur > 0 ? Math.round(dur / 60) : Math.round(fileSize / (1024 * 1024) / 4.5);
    const ytTitle = langConfig.titlePattern(translatedTitle, mins);

    // Truncate title to 100 chars (YouTube limit)
    const finalTitle = ytTitle.length > 100 ? ytTitle.substring(0, 97) + "..." : ytTitle;

    const description = buildDescription(title, translatedTitle, lang, langConfig);

    console.log(`  📤 ${finalTitle}`);
    console.log(`     ${(fileSize / 1024 / 1024).toFixed(0)} MB`);

    try {
      const res = await youtube.videos.insert({
        part: "id,snippet,status",
        notifySubscribers: false,
        requestBody: {
          snippet: {
            title: finalTitle,
            description,
            tags: (TAGS[lang] || "").split(",").map((t) => t.trim()),
            categoryId: "1",
            defaultLanguage: lang,
            defaultAudioLanguage: lang,
          },
          status: {
            privacyStatus: "private",
            selfDeclaredMadeForKids: true,
          },
        },
        media: {
          body: fs.createReadStream(mp4),
        },
      }, {
        onUploadProgress: (evt) => {
          const pct = Math.round((evt.bytesRead / fileSize) * 100);
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
          process.stdout.write(`     Progress: ${pct}%`);
        },
      });

      console.log(`\n     ✅ ${res.data.id}`);

      // Add to language playlist
      if (langConfig.ytPlaylist) {
        try {
          await youtube.playlistItems.insert({
            part: "snippet",
            requestBody: {
              snippet: {
                playlistId: langConfig.ytPlaylist,
                resourceId: { kind: "youtube#video", videoId: res.data.id },
              },
            },
          });
          console.log(`     📋 Added to ${lang.toUpperCase()} playlist`);
        } catch (e) {
          console.log(`     ⚠️ Playlist add failed: ${e.message.slice(0, 60)}`);
        }
      }

      uploaded++;
    } catch (err) {
      console.error(`\n     ❌ Upload failed: ${err.message.slice(0, 100)}`);
      failed++;
    }
  }

  console.log(`\n  ✅ ${lang.toUpperCase()}: ${uploaded} uploaded, ${skipped} skipped, ${failed} failed`);
}
