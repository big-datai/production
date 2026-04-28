#!/usr/bin/env node
/**
 * Validate leveled reading stories in Firestore — checks all required components.
 *
 * Usage:
 *   node scripts/validateLeveledStory.mjs             # validate most recent leveled story
 *   node scripts/validateLeveledStory.mjs all          # validate all leveled stories
 *   node scripts/validateLeveledStory.mjs A            # validate all Level A stories
 *   node scripts/validateLeveledStory.mjs 1-3          # validate stories #1 through #3
 *   node scripts/validateLeveledStory.mjs "I See Colors"  # validate by title (partial match)
 *   node scripts/validateLeveledStory.mjs --id ABC123  # validate by Firestore doc ID
 *
 * Checks per story:
 *   ✓ Title exists
 *   ✓ Reading level set
 *   ✓ Cover illustration URL exists and is reachable
 *   ✓ Each page has: text, audioUrl, illustrationUrl, timings[], subtitles
 *   ✓ Audio URLs are reachable (HTTP HEAD)
 *   ✓ Timings have valid word/start/end and are monotonically increasing
 *   ✓ Subtitles are valid WebVTT
 */
import admin from "firebase-admin";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { LEVELED_STORIES } from "./leveledStoryConstants.js";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const getEnvValue = (...keys) => keys.map((k) => process.env[k]).find(Boolean);

const PROJECT_ID = getEnvValue("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID") || "gen-lang-client-0430249113";
const STORAGE_BUCKET = getEnvValue("FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET") || "goreading-gemini-object";
const FIRESTORE_DB = "google-gemini-firestore";

// ── URL Reachability Check ──
const checkUrl = async (url) => {
  if (!url) return { ok: false, reason: "missing" };
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok ? { ok: true } : { ok: false, reason: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
};

// ── Timing Validation ──
const validateTimings = (timings, pageText) => {
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

// ── WebVTT Validation ──
const validateSubtitles = (subtitles) => {
  if (!subtitles || typeof subtitles !== "string") return ["subtitles missing or not a string"];
  const issues = [];
  if (!subtitles.startsWith("WEBVTT")) issues.push("subtitles missing WEBVTT header");
  const cueCount = (subtitles.match(/-->/g) || []).length;
  if (cueCount === 0) issues.push("subtitles has no cues");
  return issues;
};

// ── Validate a Single Story Document ──
const validateStory = async (doc, index, total) => {
  const data = doc.data();
  const id = doc.id;
  const label = `[${index}/${total}] "${data.title || "(no title)"}" Level ${data.readingLevel || "?"} (${id})`;
  console.log(`\n🔍 Validating ${label}`);

  const errors = [];
  const warnings = [];

  if (!data.title) errors.push("❌ Missing title");
  if (!data.readingLevel) warnings.push("⚠️  readingLevel not set");
  if (data.isPrebuilt === undefined) warnings.push("⚠️  isPrebuilt not set");
  if (!data.storyKind) warnings.push("⚠️  storyKind not set");
  if (!data.narrationMode) warnings.push("⚠️  narrationMode not set");
  if (!data.createdAt) warnings.push("⚠️  createdAt not set");

  // Cover illustration
  if (!data.illustrationUrl) {
    errors.push("❌ Missing cover illustration URL");
  } else {
    const coverCheck = await checkUrl(data.illustrationUrl);
    if (!coverCheck.ok) errors.push(`❌ Cover illustration unreachable: ${coverCheck.reason}`);
    else console.log(`   ✅ Cover illustration reachable`);
  }

  // Pages
  if (!Array.isArray(data.pages) || data.pages.length === 0) {
    errors.push("❌ No pages found");
  } else {
    console.log(`   📄 ${data.pages.length} pages`);
    for (let i = 0; i < data.pages.length; i++) {
      const page = data.pages[i];
      const prefix = `   Page ${i + 1}`;
      const pageErrors = [];

      if (!page.text || typeof page.text !== "string" || page.text.trim().length === 0) {
        pageErrors.push("missing or empty text");
      }

      if (!page.illustrationUrl) {
        warnings.push(`⚠️  ${prefix}: missing illustration URL`);
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

      const timingIssues = validateTimings(page.timings, page.text || "");
      timingIssues.forEach((issue) => {
        if (issue.includes("mismatch")) warnings.push(`⚠️  ${prefix}: ${issue}`);
        else pageErrors.push(issue);
      });

      const subIssues = validateSubtitles(page.subtitles);
      subIssues.forEach((issue) => pageErrors.push(issue));

      if (pageErrors.length) {
        pageErrors.forEach((e) => errors.push(`❌ ${prefix}: ${e}`));
      } else {
        console.log(`   ✅${prefix}: text ✓ audio ✓ illustration ✓ timings ✓ subtitles ✓`);
      }
    }
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log(`   ✅ All checks passed`);
  } else {
    warnings.forEach((w) => console.log(`   ${w}`));
    errors.forEach((e) => console.log(`   ${e}`));
  }

  return { id, title: data.title, readingLevel: data.readingLevel, errors: errors.length, warnings: warnings.length };
};

// ── Fetch stories from Firestore ──
const fetchStories = async (db) => {
  const [, , arg, argValue] = process.argv;

  // By Firestore document ID
  if (arg === "--id" && argValue) {
    const doc = await db.collection("stories").doc(argValue).get();
    if (!doc.exists) throw new Error(`No story found with ID "${argValue}"`);
    return [doc];
  }

  // All leveled stories
  if (arg === "all") {
    const snapshot = await db.collection("stories").where("isPrebuilt", "==", true).get();
    const leveledTitles = new Set(LEVELED_STORIES.map((s) => s.title));
    return snapshot.docs.filter((d) => leveledTitles.has(d.data().title));
  }

  // Filter by level letter (A-E)
  if (/^[A-Ea-e]$/.test(arg)) {
    const level = arg.toUpperCase();
    const titles = LEVELED_STORIES.filter((s) => s.readingLevel === level).map((s) => s.title);
    if (!titles.length) throw new Error(`No leveled stories for level ${level}`);
    const docs = [];
    for (const title of titles) {
      const snap = await db.collection("stories").where("title", "==", title).limit(1).get();
      if (snap.empty) console.log(`⚠️  "${title}" not found in Firestore — not seeded yet?`);
      else docs.push(snap.docs[0]);
    }
    if (!docs.length) throw new Error(`No Level ${level} stories found in Firestore.`);
    return docs;
  }

  // Range by index in LEVELED_STORIES
  const rangeMatch = arg?.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start < 1 || end < start) throw new Error(`Invalid range "${arg}". Use N-M where 1 ≤ N ≤ M.`);
    const titles = LEVELED_STORIES.slice(start - 1, Math.min(end, LEVELED_STORIES.length)).map((s) => s.title);
    const docs = [];
    for (const title of titles) {
      const snap = await db.collection("stories").where("title", "==", title).limit(1).get();
      if (snap.empty) console.log(`⚠️  "${title}" not found in Firestore — not seeded yet?`);
      else docs.push(snap.docs[0]);
    }
    if (!docs.length) throw new Error("No matching leveled stories found in Firestore.");
    return docs;
  }

  // Partial title match
  if (arg) {
    const snapshot = await db.collection("stories").where("isPrebuilt", "==", true).get();
    const needle = arg.toLowerCase();
    const leveledTitles = new Set(LEVELED_STORIES.map((s) => s.title));
    const matched = snapshot.docs.filter((d) => {
      const title = d.data().title;
      return leveledTitles.has(title) && title?.toLowerCase().includes(needle);
    });
    if (!matched.length) throw new Error(`No leveled story found matching "${arg}"`);
    return matched;
  }

  // Default: most recently created leveled story
  const snapshot = await db.collection("stories")
    .where("isPrebuilt", "==", true)
    .orderBy("createdAt", "desc")
    .get();
  const leveledTitles = new Set(LEVELED_STORIES.map((s) => s.title));
  const leveled = snapshot.docs.filter((d) => leveledTitles.has(d.data().title));
  if (!leveled.length) throw new Error("No leveled stories found in Firestore.");
  return [leveled[0]];
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

  console.log(`🔧 Project: ${PROJECT_ID}, DB: ${FIRESTORE_DB}`);

  const docs = await fetchStories(db);
  console.log(`\n🔎 Validating ${docs.length} leveled stor${docs.length === 1 ? "y" : "ies"}...`);

  const results = [];
  for (let i = 0; i < docs.length; i++) {
    results.push(await validateStory(docs[i], i + 1, docs.length));
  }

  // Final report
  const passed = results.filter((r) => r.errors === 0);
  const failed = results.filter((r) => r.errors > 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings, 0);

  console.log("\n" + "═".repeat(60));
  console.log(`📊 Results: ${passed.length} passed, ${failed.length} failed, ${totalWarnings} warnings`);
  if (failed.length) {
    console.log("\n❌ Failed stories:");
    failed.forEach((r) => console.log(`   • "${r.title}" [Level ${r.readingLevel}] — ${r.errors} error(s)`));
  }
  console.log("═".repeat(60));

  process.exit(failed.length > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error("💥 Validation failed:", err.message);
  process.exit(1);
});
