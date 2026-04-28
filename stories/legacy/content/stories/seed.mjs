#!/usr/bin/env node
/**
 * Seed prebuilt stories into Firestore using Firebase Admin SDK.
 * Uses Application Default Credentials (gcloud auth) — bypasses security rules.
 *
 * Usage:
 *   node scripts/seedSingleStory.mjs              # seed first story only
 *   node scripts/seedSingleStory.mjs all           # seed all stories
 *   node scripts/seedSingleStory.mjs night          # seed night stories only
 *   node scripts/seedSingleStory.mjs regular        # seed regular stories only
 *   node scripts/seedSingleStory.mjs 5              # seed first 5 stories
 *   node scripts/seedSingleStory.mjs 3-5            # seed stories #3 through #5 (1-based)
 *   node scripts/seedSingleStory.mjs "Aladdin and the Magic Lamp"  # seed by title
 *   node scripts/seedSingleStory.mjs list           # list all stories with indices
 *   node scripts/seedSingleStory.mjs 1-1 --force    # delete & re-seed story #1
 *
 * Night stories export a combined WAV file to exports/ for Spotify upload.
 */
import admin from "firebase-admin";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { STORY_CONSTANTS } from "./constants.js";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const getEnvValue = (...keys) => keys.map((k) => process.env[k]).find(Boolean);

const PROJECT_ID = getEnvValue("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID") || "gen-lang-client-0430249113";
const STORAGE_BUCKET = getEnvValue("FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET") || "goreading-gemini-object";
const FIRESTORE_DB = "google-gemini-firestore";

const SAMPLE_RATE_HZ = 24000;
const MIN_WORD_DURATION_MS = 120;
const DELAY_BETWEEN_PAGES_MS = 3000;

const args = process.argv.slice(2);
const forceFlag = args.includes("--force");
const selectionArg = args.find((a) => a !== "--force");

const timingSchema = {
  type: Type.ARRAY,
  description: "Word timings array",
  items: {
    type: Type.OBJECT,
    properties: {
      word: { type: Type.STRING },
      start: { type: Type.INTEGER },
      end: { type: Type.INTEGER },
    },
    required: ["word", "start", "end"],
  },
};

// ── Selection Logic ──
const normalizeTitle = (t = "") => t.toLowerCase().trim();

const listStories = () => {
  console.log(`\n📚 Available stories (${STORY_CONSTANTS.length} total):\n`);
  STORY_CONSTANTS.forEach((s, i) => {
    const kind = s.kind === "night" ? " [night]" : "";
    console.log(`  ${String(i + 1).padStart(2)}. ${s.title}${kind}`);
  });
  console.log(`\nUse ranges like 1-3 or 5-6 (1-based, inclusive).\n`);
  process.exit(0);
};

const selectStories = () => {
  if (!STORY_CONSTANTS.length) throw new Error("STORY_CONSTANTS is empty.");
  if (!selectionArg) return [STORY_CONSTANTS[0]];
  if (selectionArg === "list") listStories();
  if (selectionArg === "all") return [...STORY_CONSTANTS];
  if (selectionArg === "night") return STORY_CONSTANTS.filter((s) => s.kind === "night");
  if (selectionArg === "regular") return STORY_CONSTANTS.filter((s) => !s.kind || s.kind === "regular");

  // Range: e.g. "3-5" → stories #3, #4, #5 (1-based inclusive)
  const rangeMatch = selectionArg.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start < 1 || end < start) throw new Error(`Invalid range "${selectionArg}". Use N-M where 1 ≤ N ≤ M.`);
    if (start > STORY_CONSTANTS.length) throw new Error(`Start ${start} exceeds total stories (${STORY_CONSTANTS.length}). Use "list" to see all.`);
    return STORY_CONSTANTS.slice(start - 1, Math.min(end, STORY_CONSTANTS.length));
  }

  const n = Number(selectionArg);
  if (!Number.isNaN(n) && n > 0) return STORY_CONSTANTS.slice(0, Math.min(n, STORY_CONSTANTS.length));

  const match = STORY_CONSTANTS.find((s) => normalizeTitle(s.title) === normalizeTitle(selectionArg));
  if (match) return [match];

  throw new Error(`Unknown argument "${selectionArg}". Use: all, night, regular, a number, N-M range, title, or list.`);
};

// ── Helpers ──
const msToTimestamp = (ms) => {
  const total = ms / 1000;
  const h = Math.floor(total / 3600).toString().padStart(2, "0");
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const s = (total % 60).toFixed(3).padStart(6, "0");
  return `${h}:${m}:${s}`;
};

const buildWebVtt = (timings) => {
  const header = "WEBVTT\n\n";
  const body = timings
    .map((e, i) => `${i + 1}\n${msToTimestamp(e.start)} --> ${msToTimestamp(e.end)}\n${e.word}\n`)
    .join("\n");
  return header + body;
};

const splitStoryText = (text) => text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

const alignScaledTimings = (text, timings, targetDurationMs) => {
  const words = splitStoryText(text);
  if (!timings.length) {
    return words.map((word, i) => ({ word, start: i * MIN_WORD_DURATION_MS, end: (i + 1) * MIN_WORD_DURATION_MS }));
  }
  const trimmed = timings.slice(0, words.length).map((e, i) => ({ ...e, word: words[i] ?? e.word }));
  if (words.length > trimmed.length) {
    const remaining = words.slice(trimmed.length);
    const lastEnd = trimmed[trimmed.length - 1]?.end ?? 0;
    const remDur = Math.max(0, (targetDurationMs ?? lastEnd) - lastEnd);
    const gap = remaining.length ? Math.max(MIN_WORD_DURATION_MS, Math.floor(remDur / remaining.length) || MIN_WORD_DURATION_MS) : MIN_WORD_DURATION_MS;
    let cursor = lastEnd;
    remaining.forEach((word) => {
      trimmed.push({ word, start: cursor, end: cursor + gap });
      cursor += gap;
    });
  }
  return trimmed;
};

const scaleTimings = (text, rawTimings, targetDurationMs) => {
  if (!rawTimings?.length || !targetDurationMs) return alignScaledTimings(text, [], targetDurationMs);
  const lastEnd = rawTimings[rawTimings.length - 1].end || targetDurationMs;
  const scale = lastEnd === 0 ? 1 : targetDurationMs / lastEnd;
  let prevEnd = 0;
  const scaled = rawTimings.map(({ word, start, end }) => {
    const sStart = Math.max(Math.round(start * scale), prevEnd);
    let sEnd = Math.max(Math.round(end * scale), sStart + MIN_WORD_DURATION_MS);
    if (sEnd - sStart > 4000) sEnd = sStart + MIN_WORD_DURATION_MS;
    prevEnd = sEnd;
    return { word, start: sStart, end: sEnd };
  });
  return alignScaledTimings(text, scaled, targetDurationMs);
};

// ── WAV Header ──
const createWavHeader = (dataLength) => {
  const header = Buffer.alloc(44);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE_HZ * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);  // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(SAMPLE_RATE_HZ, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
};

// ── GCS uploads (Admin SDK) ──
const uploadAudio = async (bucket, storyId, pageIndex, base64Audio, uploadedPaths) => {
  const buf = Buffer.from(base64Audio, "base64");
  const filePath = `audio/${storyId}/page_${pageIndex}.raw`;
  const file = bucket.file(filePath);
  await file.save(buf, { contentType: "audio/L16; rate=24000", metadata: { cacheControl: "public,max-age=31536000" } });
  uploadedPaths.push(filePath);
  const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
  const durationMs = (buf.byteLength / 2 / SAMPLE_RATE_HZ) * 1000;
  return { url, durationMs, rawBuffer: buf };
};

const uploadIllustration = async (bucket, gcsPath, base64Image, uploadedPaths) => {
  const buf = Buffer.from(base64Image, "base64");
  const file = bucket.file(gcsPath);
  await file.save(buf, { contentType: "image/jpeg", metadata: { cacheControl: "public,max-age=31536000" } });
  uploadedPaths.push(gcsPath);
  return `https://storage.googleapis.com/${bucket.name}/${gcsPath}`;
};

const cleanupFailed = async (docRef, bucket, uploadedPaths) => {
  if (uploadedPaths.length) {
    console.warn("🧹 Cleaning up assets...");
    await Promise.allSettled(uploadedPaths.map((p) => bucket.file(p).delete().catch(() => null)));
  }
  if (docRef) {
    try { await docRef.delete(); } catch {}
  }
};

// ── Gemini Client (with API key rotation) ──
const API_KEYS = [
  getEnvValue("GEMINI_API_KEY", "API_KEY", "VITE_GEMINI_API_KEY"),
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean);

if (!API_KEYS.length) { console.error("❌ Missing Gemini API key."); process.exit(1); }
console.log(`🔑 ${API_KEYS.length} API key(s) available for rotation`);

let activeKeyIndex = 0;
let geminiClient;
const ai = () => {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: API_KEYS[activeKeyIndex] });
  }
  return geminiClient;
};

const rotateApiKey = () => {
  if (activeKeyIndex + 1 < API_KEYS.length) {
    activeKeyIndex++;
    geminiClient = new GoogleGenAI({ apiKey: API_KEYS[activeKeyIndex] });
    console.log(`    🔄 Rotated to API key ${activeKeyIndex + 1}/${API_KEYS.length}`);
    return true;
  }
  return false;
};

const TTS_MODELS = ["gemini-2.5-pro-preview-tts", "gemini-2.5-flash-preview-tts"];
let activeTtsModel = 0;

const generateSpeech = async (text) => {
  const totalAttempts = TTS_MODELS.length * API_KEYS.length;
  let attempt = 0;
  let keyRotations = 0;

  while (attempt < totalAttempts) {
    const model = TTS_MODELS[activeTtsModel];
    try {
      const res = await ai().models.generateContent({
        model,
        contents: [{ parts: [{ text }] }],
        config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } } },
      });
      const inline = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!inline?.inlineData?.data) throw new Error("No audio data from Gemini");
      return inline.inlineData.data;
    } catch (e) {
      const is429 = e.message?.includes("429") || e.message?.includes("RESOURCE_EXHAUSTED") || e.status === 429;
      if (is429) {
        const nextModelIdx = (activeTtsModel + 1) % TTS_MODELS.length;
        if (nextModelIdx !== 0 || keyRotations === 0) {
          if (nextModelIdx === 0) {
            if (rotateApiKey()) { keyRotations++; activeTtsModel = 0; attempt++; continue; }
          } else {
            console.log(`    ⚠️ ${model} quota exceeded, trying ${TTS_MODELS[nextModelIdx]}`);
            activeTtsModel = nextModelIdx; attempt++; continue;
          }
        }
        if (rotateApiKey()) { keyRotations++; activeTtsModel = 0; attempt++; continue; }
      }
      throw e;
    }
  }
};

const generateWordTimings = async (text) => {
  const res = await ai().models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Provide word-level timings for this narration. Return JSON only. Text: "${text}"`,
    config: { responseMimeType: "application/json", responseSchema: timingSchema },
  });
  const payload = res.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? "[]";
  return JSON.parse(payload);
};

const buildIllustrationPrompt = (storyTitle, pageText) => {
  // Extract safe scene words, strip proper nouns and short words
  const stopWords = new Set(["said", "that", "this", "with", "from", "they", "them", "their", "were", "have", "been", "will", "would", "could", "should", "very", "just", "then", "when", "what", "your"]);
  const words = pageText
    .replace(/[^a-zA-Z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && w[0] === w[0].toLowerCase() && !stopWords.has(w.toLowerCase()))
    .slice(0, 15)
    .join(", ");
  return `Create a cute, safe, child-friendly watercolor illustration for a children's picture book page. Scene elements: ${words}. Style: bright pastel colors, adorable cartoon characters, rounded shapes, warm and cozy, suitable for ages 2-6. Square 1:1 ratio. No text, words, letters, numbers, or writing in the image.`;
};

const generatePageIllustration = async (storyTitle, pageText, maxRetries = 1) => {
  const prompt = buildIllustrationPrompt(storyTitle, pageText);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: { parts: [{ text: prompt }] },
        config: { responseModalities: [Modality.IMAGE] },
      });
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part?.inlineData?.data) {
        const reason = res.candidates?.[0]?.finishReason || "unknown";
        throw new Error(`No illustration data from Gemini (finishReason: ${reason})`);
      }
      return part.inlineData.data;
    } catch (e) {
      if (attempt < maxRetries) {
        const waitSec = 5 * (attempt + 1);
        console.log(`    ⚠️ Illustration attempt ${attempt + 1} failed: ${e.message}`);
        console.log(`    🔄 Retrying in ${waitSec}s...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
      } else {
        throw e;
      }
    }
  }
};

// ── Duplicate check & force-delete ──
const findExisting = async (db, title) => {
  const snapshot = await db.collection("stories").where("title", "==", title).limit(1).get();
  return snapshot.empty ? null : snapshot.docs[0];
};

const deleteExistingStory = async (doc, bucket) => {
  const data = doc.data();
  const id = doc.id;
  console.log(`  🗑 Deleting existing "${data.title}" (${id})...`);

  // Delete GCS assets
  const paths = [];
  if (data.illustrationUrl) paths.push(`illustrations/${id}.jpg`);
  if (Array.isArray(data.pages)) {
    data.pages.forEach((_, i) => {
      paths.push(`audio/${id}/page_${i}.raw`);
      paths.push(`illustrations/${id}/page_${i}.jpg`);
    });
  }
  await Promise.allSettled(paths.map((p) => bucket.file(p).delete().catch(() => null)));
  await doc.ref.delete();
  console.log(`  🗑 Deleted doc + ${paths.length} assets`);
};

// ── Main seed function ──
const seedStory = async ({ storyTemplate, storyNumber, totalStories, db, bucket }) => {
  const existing = await findExisting(db, storyTemplate.title);
  if (existing) {
    if (!forceFlag) {
      console.log(`⚠️ [${storyNumber}/${totalStories}] "${storyTemplate.title}" exists. Skipping. (use --force to re-seed)`);
      return { skipped: true };
    }
    await deleteExistingStory(existing, bucket);
  }

  const isNight = storyTemplate.kind === "night";
  const storyKind = isNight ? "night" : "regular";
  console.log(`\n🌱 [${storyNumber}/${totalStories}] Seeding: ${storyTemplate.title} (${storyKind}, ${storyTemplate.pages.length} pages)`);

  const uploadedPaths = [];
  let docRef = null;
  const allRawAudioBuffers = [];

  try {
    docRef = await db.collection("stories").add({
      title: storyTemplate.title,
      isPrebuilt: true,
      storyKind,
      supportsHighlighting: true,
      narrationMode: "precomputed",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      pages: [],
    });
    const storyId = docRef.id;

    // Cover illustration
    console.log("  🖼 Generating cover illustration...");
    let illustrationUrl = null;
    try {
      const b64 = await generatePageIllustration(storyTemplate.title, storyTemplate.pages[0]);
      illustrationUrl = await uploadIllustration(bucket, `illustrations/${storyId}.jpg`, b64, uploadedPaths);
      console.log("  🎨 Cover uploaded");
    } catch (e) {
      console.error("  ⚠️ Cover illustration failed:", e.message);
    }

    const processedPages = [];

    for (let i = 0; i < storyTemplate.pages.length; i++) {
      const pageText = storyTemplate.pages[i];
      console.log(`\n  📄 Page ${i + 1}/${storyTemplate.pages.length}`);

      // Per-page illustration
      let pageIllustrationUrl = null;
      console.log("    🖼 Generating illustration...");
      try {
        const imgB64 = await generatePageIllustration(storyTemplate.title, pageText);
        pageIllustrationUrl = await uploadIllustration(bucket, `illustrations/${storyId}/page_${i}.jpg`, imgB64, uploadedPaths);
        console.log("    🎨 Illustration uploaded");
      } catch (e) {
        console.error("    ⚠️ Illustration failed:", e.message);
      }

      // Audio
      console.log("    🎵 Generating audio...");
      const audioB64 = await generateSpeech(pageText);
      const { url: audioUrl, durationMs, rawBuffer } = await uploadAudio(bucket, storyId, i, audioB64, uploadedPaths);
      console.log(`    🔊 Audio uploaded (${(durationMs / 1000).toFixed(2)}s)`);

      if (isNight) allRawAudioBuffers.push(rawBuffer);

      // Word timings
      console.log("    🕒 Generating timings...");
      const rawTimings = await generateWordTimings(pageText);
      const timings = scaleTimings(pageText, rawTimings, durationMs);
      console.log(`    ✅ ${timings.length} words aligned`);

      processedPages.push({
        text: pageText,
        audioUrl,
        illustrationUrl: pageIllustrationUrl,
        timings,
        subtitles: buildWebVtt(timings),
      });

      // Rate limit delay between pages
      if (i < storyTemplate.pages.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_PAGES_MS));
      }
    }

    await docRef.update({
      illustrationUrl,
      pages: processedPages,
    });

    console.log(`\n  🎉 Story seeded! ID: ${storyId}`);

    // Export combined WAV for night stories
    if (isNight && allRawAudioBuffers.length) {
      const exportsDir = path.resolve(process.cwd(), "exports");
      if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

      const combinedPcm = Buffer.concat(allRawAudioBuffers);
      const wavHeader = createWavHeader(combinedPcm.byteLength);
      const wavBuffer = Buffer.concat([wavHeader, combinedPcm]);

      const safeTitle = storyTemplate.title.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
      const wavPath = path.join(exportsDir, `${safeTitle}.wav`);
      fs.writeFileSync(wavPath, wavBuffer);
      const durationSec = (combinedPcm.byteLength / 2 / SAMPLE_RATE_HZ).toFixed(1);
      console.log(`  🎧 WAV exported: ${wavPath} (${durationSec}s, ${(wavBuffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);
    }

    return { skipped: false, storyId };
  } catch (error) {
    await cleanupFailed(docRef, bucket, uploadedPaths);
    throw error;
  }
};

// ── Entry Point ──
const main = async () => {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: STORAGE_BUCKET,
      projectId: PROJECT_ID,
    });
  }

  const db = admin.firestore();
  db.settings({ databaseId: FIRESTORE_DB });
  const bucket = admin.storage().bucket(STORAGE_BUCKET);

  console.log(`🔧 Project: ${PROJECT_ID}, DB: ${FIRESTORE_DB}, Bucket: ${STORAGE_BUCKET}`);

  const stories = selectStories();
  const nightCount = stories.filter((s) => s.kind === "night").length;
  const regularCount = stories.length - nightCount;
  console.log(`🚀 Seeding ${stories.length} stor${stories.length === 1 ? "y" : "ies"} (${regularCount} regular, ${nightCount} night)...\n`);

  let completed = 0, skipped = 0;

  for (let idx = 0; idx < stories.length; idx++) {
    try {
      const result = await seedStory({
        storyTemplate: stories[idx],
        storyNumber: idx + 1,
        totalStories: stories.length,
        db,
        bucket,
      });
      if (result?.skipped) skipped++; else completed++;
    } catch (error) {
      console.error(`\n💥 Failed to seed "${stories[idx].title}":`, error.message);
      console.log("   Continuing with next story...\n");
    }
  }

  console.log(`\n✅ Done! ${completed} seeded, ${skipped} skipped.`);
};

main().catch((e) => {
  console.error("💥 Fatal:", e.message);
  process.exit(1);
});
