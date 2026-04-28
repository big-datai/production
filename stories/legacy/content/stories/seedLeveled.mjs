#!/usr/bin/env node
/**
 * Seed leveled reading stories into Firestore using Firebase Admin SDK.
 * Uses Application Default Credentials (gcloud auth) — bypasses security rules.
 *
 * Usage:
 *   node scripts/seedLeveledStories.mjs            # seed first story only
 *   node scripts/seedLeveledStories.mjs all         # seed all 25 stories
 *   node scripts/seedLeveledStories.mjs A           # seed all Level A stories
 *   node scripts/seedLeveledStories.mjs B           # seed all Level B stories
 *   node scripts/seedLeveledStories.mjs 5           # seed first 5 stories
 *   node scripts/seedLeveledStories.mjs 3-5         # seed stories #3 through #5 (1-based)
 *   node scripts/seedLeveledStories.mjs list        # list all stories with indices
 */
import admin from "firebase-admin";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Buffer } from "node:buffer";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { LEVELED_STORIES } from "./leveledStoryConstants.js";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const getEnvValue = (...keys) => keys.map((k) => process.env[k]).find(Boolean);

const PROJECT_ID = getEnvValue("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID") || "gen-lang-client-0430249113";
const STORAGE_BUCKET = getEnvValue("FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET") || "goreading-gemini-object";
const FIRESTORE_DB = "google-gemini-firestore";

const SAMPLE_RATE_HZ = 24000;
const MIN_WORD_DURATION_MS = 120;
const DELAY_BETWEEN_PAGES_MS = 7000; // 10 req/min limit = 6s min gap, use 7s to be safe

const [, , selectionArg] = process.argv;

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
const listStories = () => {
  console.log(`\n📚 Available leveled stories (${LEVELED_STORIES.length} total):\n`);
  LEVELED_STORIES.forEach((s, i) => {
    const level = s.readingLevel ? ` [Level ${s.readingLevel}]` : "";
    console.log(`  ${String(i + 1).padStart(2)}. ${s.title}${level}`);
  });
  console.log(`\nUse ranges like 1-3 or 5-6 (1-based, inclusive).\n`);
  process.exit(0);
};

const selectStories = () => {
  if (!LEVELED_STORIES.length) throw new Error("LEVELED_STORIES is empty.");
  if (!selectionArg) return [LEVELED_STORIES[0]];
  if (selectionArg === "list") listStories();
  if (selectionArg === "all") return [...LEVELED_STORIES];
  // Single level letter
  if (/^[A-Ea-e]$/.test(selectionArg)) {
    const level = selectionArg.toUpperCase();
    const filtered = LEVELED_STORIES.filter((s) => s.readingLevel === level);
    if (!filtered.length) throw new Error(`No stories for level ${level}`);
    return filtered;
  }

  // Range: e.g. "3-5" → stories #3, #4, #5 (1-based inclusive)
  const rangeMatch = selectionArg.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start < 1 || end < start) throw new Error(`Invalid range "${selectionArg}". Use N-M where 1 ≤ N ≤ M.`);
    if (start > LEVELED_STORIES.length) throw new Error(`Start ${start} exceeds total stories (${LEVELED_STORIES.length}). Use "list" to see all.`);
    return LEVELED_STORIES.slice(start - 1, Math.min(end, LEVELED_STORIES.length));
  }

  // Numeric count
  const n = Number(selectionArg);
  if (!Number.isNaN(n) && n > 0) return LEVELED_STORIES.slice(0, Math.min(n, LEVELED_STORIES.length));

  throw new Error(`Unknown argument "${selectionArg}". Use: all, A-E, a number, N-M range, or list.`);
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

// ── GCS uploads (Admin SDK — direct bucket access) ──
const uploadAudio = async (bucket, storyId, pageIndex, base64Audio, uploadedPaths) => {
  const buf = Buffer.from(base64Audio, "base64");
  const filePath = `audio/${storyId}/page_${pageIndex}.raw`;
  const file = bucket.file(filePath);
  await file.save(buf, { contentType: "audio/L16; rate=24000", metadata: { cacheControl: "public,max-age=31536000" } });
  uploadedPaths.push(filePath);
  const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
  const durationMs = (buf.byteLength / 2 / SAMPLE_RATE_HZ) * 1000;
  return { url, durationMs };
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
let activeTtsModel = 0; // index into TTS_MODELS

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
      if (!inline?.inlineData?.data) throw new Error("NO_AUDIO_DATA");
      return inline.inlineData.data;
    } catch (e) {
      const is429 = e.message?.includes("429") || e.message?.includes("RESOURCE_EXHAUSTED") || e.status === 429 || e.message === "NO_AUDIO_DATA";
      if (is429) {
        console.log(`    ⚠️ TTS quota/empty response — rotating key/model (attempt ${attempt + 1}/${totalAttempts})`);
        // Try next TTS model on same key
        const nextModelIdx = (activeTtsModel + 1) % TTS_MODELS.length;
        if (nextModelIdx !== 0 || keyRotations === 0) {
          if (nextModelIdx === 0) {
            // Both models exhausted on this key, try rotating API key
            if (rotateApiKey()) {
              keyRotations++;
              activeTtsModel = 0; // reset to pro model on new key
              attempt++;
              continue;
            }
          } else {
            console.log(`    ⚠️ ${model} quota exceeded, trying ${TTS_MODELS[nextModelIdx]}`);
            activeTtsModel = nextModelIdx;
            attempt++;
            continue;
          }
        }
        // Also try rotating key even if we haven't cycled models
        if (rotateApiKey()) {
          keyRotations++;
          activeTtsModel = 0;
          attempt++;
          continue;
        }
      }
      throw e;
    }
  }
};

const generateWordTimings = async (text) => {
  let lastError;
  for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Provide word-level timings for this narration. Return JSON only. Text: "${text}"`,
        config: { responseMimeType: "application/json", responseSchema: timingSchema },
      });
      const payload = res.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? "[]";
      return JSON.parse(payload);
    } catch (e) {
      lastError = e;
      const shouldRotate = e.message?.includes("429") || e.message?.includes("RESOURCE_EXHAUSTED");
      if (shouldRotate && rotateApiKey()) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
};

const generatePageIllustration = async (storyTitle, pageText, readingLevel) => {
  const prompt = `A vibrant, friendly, text-free children's book illustration for a Level ${readingLevel} early reader story called "${storyTitle}". This page says: "${pageText}". Style: simple, colorful, warm, appealing to young children. Large simple shapes, bright colors, cute characters. Square aspect ratio (1:1). No text, words, letters, logos, or branding in the image.`;
  let lastError;
  // Try each API key — rotate on 429 or 503
  for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: { parts: [{ text: prompt }] },
        config: { responseModalities: [Modality.IMAGE] },
      });
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part?.inlineData?.data) throw new Error("No illustration data from Gemini");
      return part.inlineData.data;
    } catch (e) {
      lastError = e;
      const shouldRotate = e.message?.includes("429") || e.message?.includes("503") ||
        e.message?.includes("RESOURCE_EXHAUSTED") || e.message?.includes("UNAVAILABLE");
      if (shouldRotate && rotateApiKey()) {
        console.log(`    🔄 Illustration: rotated key after ${e.message?.slice(0, 40)}`);
        await new Promise(r => setTimeout(r, 2000)); // brief pause before retry
        continue;
      }
      throw e;
    }
  }
  throw lastError;
};

// ── Duplicate check ──
const storyExists = async (db, title) => {
  const snapshot = await db.collection("stories").where("title", "==", title).limit(1).get();
  return !snapshot.empty;
};

// ── Main seed function ──
const seedStory = async ({ storyTemplate, storyNumber, totalStories, db, bucket }) => {
  if (await storyExists(db, storyTemplate.title)) {
    console.log(`⚠️ [${storyNumber}/${totalStories}] "${storyTemplate.title}" exists. Skipping.`);
    return { skipped: true };
  }

  console.log(`\n🌱 [${storyNumber}/${totalStories}] Seeding: ${storyTemplate.title} (Level ${storyTemplate.readingLevel})`);
  const uploadedPaths = [];
  let docRef = null;

  try {
    docRef = await db.collection("stories").add({
      title: storyTemplate.title,
      isPrebuilt: true,
      readingLevel: storyTemplate.readingLevel,
      storyKind: "regular",
      supportsHighlighting: true,
      narrationMode: "precomputed",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      pages: [],
    });
    const storyId = docRef.id;

    // Generate a cover illustration
    console.log("  🖼 Generating cover illustration...");
    let illustrationUrl = null;
    try {
      const b64 = await generatePageIllustration(storyTemplate.title, storyTemplate.pages[0], storyTemplate.readingLevel);
      illustrationUrl = await uploadIllustration(bucket, `illustrations/${storyId}.jpg`, b64, uploadedPaths);
      console.log("  🎨 Cover uploaded");
    } catch (e) {
      console.error("  ⚠️ Cover illustration failed:", e.message);
    }

    const processedPages = [];

    for (let i = 0; i < storyTemplate.pages.length; i++) {
      const pageText = storyTemplate.pages[i];
      console.log(`\n  📄 Page ${i + 1}/${storyTemplate.pages.length}: "${pageText.slice(0, 50)}..."`);

      // Per-page illustration
      let pageIllustrationUrl = null;
      console.log("    🖼 Generating illustration...");
      try {
        const imgB64 = await generatePageIllustration(storyTemplate.title, pageText, storyTemplate.readingLevel);
        pageIllustrationUrl = await uploadIllustration(bucket, `illustrations/${storyId}/page_${i}.jpg`, imgB64, uploadedPaths);
        console.log("    🎨 Illustration uploaded");
      } catch (e) {
        console.error("    ⚠️ Illustration failed:", e.message);
      }

      // Audio
      console.log("    🎵 Generating audio...");
      const audioB64 = await generateSpeech(pageText);
      const { url: audioUrl, durationMs } = await uploadAudio(bucket, storyId, i, audioB64, uploadedPaths);
      console.log(`    🔊 Audio uploaded (${(durationMs / 1000).toFixed(2)}s)`);

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
    return { skipped: false, storyId };
  } catch (error) {
    await cleanupFailed(docRef, bucket, uploadedPaths);
    throw error;
  }
};

// ── Inline Validation (runs after each seed) ──
const checkUrl = async (url) => {
  if (!url) return { ok: false, reason: "missing" };
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok ? { ok: true } : { ok: false, reason: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
};

const validateTimingsData = (timings, pageText) => {
  const issues = [];
  if (!Array.isArray(timings) || timings.length === 0) {
    issues.push("timings array is empty or missing");
    return issues;
  }
  const textWords = pageText.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (timings.length !== textWords.length) {
    issues.push(`word count mismatch: timings has ${timings.length}, text has ${textWords.length} words`);
  }
  for (let i = 0; i < timings.length; i++) {
    const t = timings[i];
    if (!t.word || typeof t.word !== "string") issues.push(`timing[${i}]: missing or invalid word`);
    if (typeof t.start !== "number" || typeof t.end !== "number") {
      issues.push(`timing[${i}]: start/end not numbers`);
      continue;
    }
    if (t.start < 0) issues.push(`timing[${i}]: negative start (${t.start})`);
    if (t.end <= t.start) issues.push(`timing[${i}]: end (${t.end}) <= start (${t.start}) for "${t.word}"`);
    if (i > 0 && t.start < timings[i - 1].end) {
      issues.push(`timing[${i}]: overlaps previous (start ${t.start} < prev end ${timings[i - 1].end})`);
    }
  }
  return issues;
};

const validateSubtitlesData = (subtitles) => {
  if (!subtitles || typeof subtitles !== "string") return ["subtitles missing or not a string"];
  const issues = [];
  if (!subtitles.startsWith("WEBVTT")) issues.push("subtitles missing WEBVTT header");
  const cueCount = (subtitles.match(/-->/g) || []).length;
  if (cueCount === 0) issues.push("subtitles has no cues");
  return issues;
};

const validateSeededStory = async (db, storyId, storyTitle) => {
  console.log(`\n  🔍 Validating "${storyTitle}" (${storyId}) in Firestore...`);
  const doc = await db.collection("stories").doc(storyId).get();
  if (!doc.exists) return { passed: false, errors: ["Story document not found in Firestore"], warnings: [] };

  const data = doc.data();
  const errors = [];
  const warnings = [];

  if (!data.title) errors.push("Missing title");
  if (!data.readingLevel) warnings.push("readingLevel not set");
  if (!data.narrationMode) warnings.push("narrationMode not set");

  // Cover illustration
  if (!data.illustrationUrl) {
    warnings.push("Missing cover illustration URL");
  } else {
    const coverCheck = await checkUrl(data.illustrationUrl);
    if (!coverCheck.ok) errors.push(`Cover illustration unreachable: ${coverCheck.reason}`);
    else console.log(`     ✅ Cover illustration reachable`);
  }

  // Pages
  if (!Array.isArray(data.pages) || data.pages.length === 0) {
    errors.push("No pages found");
  } else {
    for (let i = 0; i < data.pages.length; i++) {
      const page = data.pages[i];
      const prefix = `Page ${i + 1}`;
      const pageErrors = [];

      if (!page.text || typeof page.text !== "string" || page.text.trim().length === 0) {
        pageErrors.push("missing or empty text");
      }

      if (!page.illustrationUrl) {
        warnings.push(`${prefix}: missing illustration URL`);
      } else {
        const imgCheck = await checkUrl(page.illustrationUrl);
        if (!imgCheck.ok) pageErrors.push(`illustration unreachable (${imgCheck.reason})`);
      }

      if (!page.audioUrl) {
        pageErrors.push("missing audio URL");
      } else {
        const audioCheck = await checkUrl(page.audioUrl);
        if (!audioCheck.ok) pageErrors.push(`audio unreachable (${audioCheck.reason})`);
      }

      const timingIssues = validateTimingsData(page.timings, page.text || "");
      timingIssues.forEach((issue) => {
        if (issue.includes("mismatch")) warnings.push(`${prefix}: ${issue}`);
        else pageErrors.push(issue);
      });

      const subIssues = validateSubtitlesData(page.subtitles);
      subIssues.forEach((issue) => pageErrors.push(issue));

      if (pageErrors.length) {
        pageErrors.forEach((e) => errors.push(`${prefix}: ${e}`));
      } else {
        console.log(`     ✅ ${prefix}: text ✓ audio ✓ illustration ✓ timings ✓ subtitles ✓`);
      }
    }
  }

  if (warnings.length) warnings.forEach((w) => console.log(`     ⚠️  ${w}`));
  if (errors.length) errors.forEach((e) => console.log(`     ❌ ${e}`));
  if (errors.length === 0) console.log(`     ✅ All validation checks passed`);

  return { passed: errors.length === 0, errors, warnings };
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
  console.log(`🚀 Seeding ${stories.length} leveled stor${stories.length === 1 ? "y" : "ies"} (seed → validate → next)...\n`);

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

      if (result?.skipped) {
        skipped++;
        continue;
      }

      // ── Validate the just-seeded story before moving to next ──
      const validation = await validateSeededStory(db, result.storyId, stories[idx].title);
      if (!validation.passed) {
        console.error(`\n🛑 Validation FAILED for "${stories[idx].title}". Stopping to preserve TTS quota.`);
        console.error(`   ${validation.errors.length} error(s). Fix before continuing.`);
        console.log(`\n📊 Progress: ${completed} seeded & validated, ${skipped} skipped, stopped at story ${idx + 1}/${stories.length}`);
        process.exit(1);
      }

      completed++;
      console.log(`\n  ✅ [${idx + 1}/${stories.length}] "${stories[idx].title}" — seeded & validated ✓`);
    } catch (error) {
      console.error(`\n💥 Failed to seed "${stories[idx].title}":`, error.message);
      console.error(`🛑 Stopping to preserve TTS quota. Fix the issue before continuing.`);
      console.log(`\n📊 Progress: ${completed} seeded & validated, ${skipped} skipped, failed at story ${idx + 1}/${stories.length}`);
      process.exit(1);
    }
  }

  console.log(`\n✅ All done! ${completed} seeded & validated, ${skipped} skipped.`);
};

main().catch((e) => {
  console.error("💥 Fatal:", e.message);
  process.exit(1);
});
