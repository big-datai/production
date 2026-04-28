#!/usr/bin/env node
/**
 * Generate Gemini illustrations for bednight stories that have no illustrations.
 *
 * Usage:
 *   node content/podcast/generateBednightIllustrations.mjs              # all missing
 *   node content/podcast/generateBednightIllustrations.mjs "Snow White"  # one story
 */
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenAI, Modality } from '@google/genai';
import { config as loadEnv } from 'dotenv';
import fs from 'fs';
import path from 'path';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0430249113';
const STORAGE_BUCKET   = process.env.FIREBASE_STORAGE_BUCKET || 'goreading-gemini-object';
const FIRESTORE_DB     = process.env.FIRESTORE_DATABASE_ID || 'google-gemini-firestore';
const GEMINI_KEY       = process.env.GEMINI_API_KEY;

// ── Gemini setup ──────────────────────────────────────────────────────────────

let _ai;
const ai = () => _ai || (_ai = new GoogleGenAI({ apiKey: GEMINI_KEY }));

const buildPrompt = (title, pageText) => {
  const stopWords = new Set(['said','that','this','with','from','they','them','their','were','have','been','will','would','could','should','very','just','then','when','what','your','pooh','winnie','gretel','hansel','grimm','snow','white']);
  const words = pageText
    .replace(/[^a-zA-Z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && w[0] === w[0].toLowerCase() && !stopWords.has(w.toLowerCase()))
    .slice(0, 12)
    .join(', ');
  return `A cheerful watercolor children's book illustration. Scene: ${words}. Style: soft pastel colors, rounded friendly shapes, cozy and warm, suitable for ages 3-7. No people, no faces, no text or letters in image.`;
};

async function generateImage(title, pageText, maxRetries = 2) {
  const prompt = buildPrompt(title, pageText);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts: [{ text: prompt }] },
        config: { responseModalities: [Modality.IMAGE] },
      });
      const part = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
      if (!part?.inlineData?.data) {
        const reason = res.candidates?.[0]?.finishReason || 'unknown';
        throw new Error(`No image data (finishReason: ${reason})`);
      }
      return part.inlineData.data; // base64
    } catch (e) {
      if (attempt < maxRetries) {
        const wait = 5 * (attempt + 1);
        console.log(`    ⚠️  Attempt ${attempt + 1} failed: ${e.message} — retrying in ${wait}s...`);
        await new Promise(r => setTimeout(r, wait * 1000));
      } else {
        throw e;
      }
    }
  }
}

async function uploadImage(bucket, remotePath, b64) {
  const buf = Buffer.from(b64, 'base64');
  const file = bucket.file(remotePath);
  await file.save(buf, { contentType: 'image/jpeg', metadata: { cacheControl: 'public, max-age=31536000' } });
  const encoded = remotePath.split('/').map(encodeURIComponent).join('/');
  return `https://storage.googleapis.com/${bucket.name}/${encoded}`;
}

// ── Firebase init ─────────────────────────────────────────────────────────────

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
const credential = fs.existsSync(serviceAccountPath)
  ? admin.credential.cert(serviceAccountPath)
  : admin.credential.applicationDefault();

if (!admin.apps.length) {
  admin.initializeApp({ credential, storageBucket: STORAGE_BUCKET, projectId: FIREBASE_PROJECT });
}
const db = getFirestore(admin.app(), FIRESTORE_DB);
const bucket = admin.storage().bucket(STORAGE_BUCKET);

// ── Main ──────────────────────────────────────────────────────────────────────

const filterArg = process.argv[2];

// Find all night stories with missing illustrations
const snap = await db.collection('stories')
  .where('storyKind', '==', 'night')
  .where('isPrebuilt', '==', true)
  .get();

const toProcess = snap.docs.filter(doc => {
  const d = doc.data();
  if (filterArg && !d.title.toLowerCase().includes(filterArg.toLowerCase())) return false;
  // Has missing cover OR any page with null illustrationUrl
  return !d.illustrationUrl || d.pages?.some(p => !p.illustrationUrl);
});

if (!toProcess.length) {
  console.log('✅ All stories already have illustrations.');
  process.exit(0);
}

console.log(`\n🎨 Generating illustrations for ${toProcess.length} stories...\n`);

for (const doc of toProcess) {
  const data = doc.data();
  const { title, pages } = data;
  const storyId = doc.id;
  console.log(`\n📖 ${title} (${storyId})`);

  const updatedPages = [...pages];
  let coverUrl = data.illustrationUrl;

  for (let i = 0; i < pages.length; i++) {
    if (pages[i].illustrationUrl) continue; // already has one
    const pageNum = String(i + 1).padStart(3, '0');
    console.log(`  🖼  Page ${pageNum}/${pages.length}...`);

    try {
      const b64 = await generateImage(title, pages[i].text);

      // Upload page illustration
      const pageUrl = await uploadImage(bucket, `illustrations/${storyId}/page_${i}.jpg`, b64);
      updatedPages[i] = { ...pages[i], illustrationUrl: pageUrl };

      // Use first page as cover if no cover yet
      if (!coverUrl && i === 0) {
        coverUrl = await uploadImage(bucket, `illustrations/${storyId}.jpg`, b64);
        console.log(`  🖼  Cover set from page 1`);
      }

      console.log(`    ✅ page_${pageNum}`);
    } catch (e) {
      console.error(`    ❌ Page ${pageNum} failed: ${e.message}`);
    }

    // Rate limit: ~1 image/sec
    await new Promise(r => setTimeout(r, 1000));
  }

  await doc.ref.update({ pages: updatedPages, illustrationUrl: coverUrl });
  console.log(`  ✅ Saved ${title}`);
}

console.log('\n✅ Done!');
