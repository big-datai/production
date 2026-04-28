#!/usr/bin/env node
/**
 * Patch missing illustrations on already-seeded stories.
 * Only generates + uploads illustrations that are missing — leaves audio/timings untouched.
 *
 * Usage:
 *   node scripts/patchIllustrations.mjs "Snow White"     # patch by partial title
 *   node scripts/patchIllustrations.mjs 2-2              # patch story #2 (by seed order)
 *   node scripts/patchIllustrations.mjs all               # patch all prebuilt stories
 *   node scripts/patchIllustrations.mjs --id ABC123       # patch by Firestore doc ID
 */
import admin from "firebase-admin";
import { GoogleGenAI, Modality } from "@google/genai";
import { Buffer } from "node:buffer";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { STORY_CONSTANTS } from "./constants.js";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const getEnvValue = (...keys) => keys.map((k) => process.env[k]).find(Boolean);

const PROJECT_ID = getEnvValue("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID") || "gen-lang-client-0430249113";
const STORAGE_BUCKET = getEnvValue("FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET") || "goreading-gemini-object";
const FIRESTORE_DB = "google-gemini-firestore";

const API_KEY = getEnvValue("GEMINI_API_KEY", "API_KEY", "VITE_GEMINI_API_KEY");
if (!API_KEY) { console.error("❌ Missing Gemini API key."); process.exit(1); }

const ai = new GoogleGenAI({ apiKey: API_KEY });

// ── Illustration generation with retry ──
const buildIllustrationPrompt = (storyTitle, pageText) => {
  const stopWords = new Set(["said", "that", "this", "with", "from", "they", "them", "their", "were", "have", "been", "will", "would", "could", "should", "very", "just", "then", "when", "what", "your"]);
  const words = pageText
    .replace(/[^a-zA-Z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && w[0] === w[0].toLowerCase() && !stopWords.has(w.toLowerCase()))
    .slice(0, 15)
    .join(", ");
  return `Create a cute, safe, child-friendly watercolor illustration for a children's picture book page. Scene elements: ${words}. Style: bright pastel colors, adorable cartoon characters, rounded shapes, warm and cozy, suitable for ages 2-6. Square 1:1 ratio. No text, words, letters, numbers, or writing in the image.`;
};

const generateIllustration = async (storyTitle, pageText, maxRetries = 1) => {
  const prompt = buildIllustrationPrompt(storyTitle, pageText);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: { parts: [{ text: prompt }] },
        config: { responseModalities: [Modality.IMAGE] },
      });
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part?.inlineData?.data) {
        const reason = res.candidates?.[0]?.finishReason || "unknown";
        throw new Error(`No illustration data (finishReason: ${reason})`);
      }
      return part.inlineData.data;
    } catch (e) {
      if (attempt < maxRetries) {
        const waitSec = 5 * (attempt + 1);
        console.log(`    ⚠️ Attempt ${attempt + 1} failed: ${e.message}`);
        console.log(`    🔄 Retrying in ${waitSec}s...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
      } else {
        throw e;
      }
    }
  }
};

const uploadIllustration = async (bucket, gcsPath, base64Image) => {
  const buf = Buffer.from(base64Image, "base64");
  const file = bucket.file(gcsPath);
  await file.save(buf, { contentType: "image/jpeg", metadata: { cacheControl: "public,max-age=31536000" } });
  return `https://storage.googleapis.com/${bucket.name}/${gcsPath}`;
};

// ── Fetch stories from Firestore ──
const fetchStories = async (db) => {
  const [, , arg, argValue] = process.argv;

  if (arg === "--id" && argValue) {
    const doc = await db.collection("stories").doc(argValue).get();
    if (!doc.exists) throw new Error(`No story with ID "${argValue}"`);
    return [doc];
  }
  if (arg === "all") {
    const snap = await db.collection("stories").where("isPrebuilt", "==", true).get();
    return snap.docs;
  }
  const rangeMatch = arg?.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start < 1 || end < start) throw new Error(`Invalid range "${arg}".`);
    const titles = STORY_CONSTANTS.slice(start - 1, Math.min(end, STORY_CONSTANTS.length)).map((s) => s.title);
    const docs = [];
    for (const title of titles) {
      const snap = await db.collection("stories").where("title", "==", title).limit(1).get();
      if (snap.empty) console.log(`⚠️  "${title}" not found in Firestore`);
      else docs.push(snap.docs[0]);
    }
    if (!docs.length) throw new Error("No matching stories found.");
    return docs;
  }
  if (arg) {
    const snap = await db.collection("stories").where("isPrebuilt", "==", true).get();
    const needle = arg.toLowerCase();
    const matched = snap.docs.filter((d) => d.data().title?.toLowerCase().includes(needle));
    if (!matched.length) throw new Error(`No story matching "${arg}"`);
    return matched;
  }
  throw new Error("Provide a title, range, 'all', or --id.");
};

// ── Patch a single story ──
const patchStory = async (doc, bucket, index, total) => {
  const data = doc.data();
  const id = doc.id;
  console.log(`\n🔧 [${index}/${total}] "${data.title}" (${id})`);

  let needsUpdate = false;
  const updates = {};

  // Cover illustration
  if (!data.illustrationUrl) {
    console.log("  🖼 Missing cover — generating...");
    try {
      const firstPageText = data.pages?.[0]?.text || data.title;
      const b64 = await generateIllustration(data.title, firstPageText);
      const url = await uploadIllustration(bucket, `illustrations/${id}.jpg`, b64);
      updates.illustrationUrl = url;
      needsUpdate = true;
      console.log("  ✅ Cover uploaded");
    } catch (e) {
      console.error(`  ❌ Cover failed after retry: ${e.message}`);
    }
  } else {
    console.log("  ✅ Cover OK");
  }

  // Page illustrations
  if (Array.isArray(data.pages)) {
    const updatedPages = [...data.pages];
    let pagesChanged = false;

    for (let i = 0; i < updatedPages.length; i++) {
      const page = updatedPages[i];
      if (!page.illustrationUrl) {
        console.log(`  🖼 Page ${i + 1}/${updatedPages.length} missing illustration — generating...`);
        try {
          const b64 = await generateIllustration(data.title, page.text || data.title);
          const url = await uploadIllustration(bucket, `illustrations/${id}/page_${i}.jpg`, b64);
          updatedPages[i] = { ...page, illustrationUrl: url };
          pagesChanged = true;
          console.log(`  ✅ Page ${i + 1} illustration uploaded`);
        } catch (e) {
          console.error(`  ❌ Page ${i + 1} failed after retry: ${e.message}`);
        }
        // Rate limit delay
        if (i < updatedPages.length - 1) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      } else {
        console.log(`  ✅ Page ${i + 1} illustration OK`);
      }
    }

    if (pagesChanged) {
      updates.pages = updatedPages;
      needsUpdate = true;
    }
  }

  if (needsUpdate) {
    await doc.ref.update(updates);
    console.log(`  💾 Firestore updated`);
  } else {
    console.log("  ✨ Nothing to patch");
  }

  return needsUpdate;
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

  console.log(`🔧 Project: ${PROJECT_ID}, DB: ${FIRESTORE_DB}`);

  const docs = await fetchStories(db);
  console.log(`\n🩹 Patching illustrations for ${docs.length} stor${docs.length === 1 ? "y" : "ies"}...`);

  let patched = 0;
  for (let i = 0; i < docs.length; i++) {
    const updated = await patchStory(docs[i], bucket, i + 1, docs.length);
    if (updated) patched++;
  }

  console.log(`\n✅ Done! ${patched} stor${patched === 1 ? "y" : "ies"} patched.`);
};

main().catch((e) => {
  console.error("💥 Fatal:", e.message);
  process.exit(1);
});
