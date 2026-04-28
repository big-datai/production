#!/usr/bin/env node
/**
 * Validate seeded stories in Firestore — checks all required components.
 *
 * Usage:
 *   node scripts/validateStory.mjs                  # validate most recent story
 *   node scripts/validateStory.mjs all              # validate all prebuilt stories
 *   node scripts/validateStory.mjs "The Little Bear" # validate by title (partial match)
 *   node scripts/validateStory.mjs 1-3              # validate stories #1 through #3 (by seed order)
 *   node scripts/validateStory.mjs --id ABC123      # validate by Firestore doc ID
 *
 * Checks per story:
 *   ✓ Title exists
 *   ✓ Cover illustration URL exists and is reachable
 *   ✓ Each page has: text, audioUrl, illustrationUrl, timings[], subtitles
 *   ✓ Audio URLs are reachable (HTTP HEAD)
 *   ✓ Timings have valid word/start/end and are monotonically increasing
 *   ✓ Subtitles are valid WebVTT
 */
import admin from "firebase-admin";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { STORY_CONSTANTS } from "./constants.js";

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
  const label = `[${index}/${total}] "${data.title || "(no title)"}" (${id})`;
  console.log(`\n🔍 Validating ${label}`);

  const errors = [];
  const warnings = [];

  // Top-level fields
  if (!data.title) errors.push("❌ Missing title");
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
  }

  // Pages
  if (!Array.isArray(data.pages) || data.pages.length === 0) {
    errors.push("❌ No pages found");
  } else {
    console.log(`   📄 ${data.pages.length} pages`);

    for (let i = 0; i < data.pages.length; i++) {
      const page = data.pages[i];
      const prefix = `   Page ${i + 1}`;

      // Text
      if (!page.text || typeof page.text !== "string" || page.text.trim().length === 0) {
        errors.push(`❌ ${prefix}: missing or empty text`);
      }

      // Illustration
      if (!page.illustrationUrl) {
        warnings.push(`⚠️  ${prefix}: missing illustration URL`);
      } else {
        const imgCheck = await checkUrl(page.illustrationUrl);
        if (!imgCheck.ok) errors.push(`❌ ${prefix}: illustration unreachable (${imgCheck.reason})`);
      }

      // Audio
      if (!page.audioUrl) {
        errors.push(`❌ ${prefix}: missing audio URL`);
      } else {
        const audioCheck = await checkUrl(page.audioUrl);
        if (!audioCheck.ok) errors.push(`❌ ${prefix}: audio unreachable (${audioCheck.reason})`);
      }

      // Timings
      const timingIssues = validateTimings(page.timings, page.text || "");
      timingIssues.forEach((issue) => {
        if (issue.includes("mismatch")) warnings.push(`⚠️  ${prefix}: ${issue}`);
        else errors.push(`❌ ${prefix}: ${issue}`);
      });

      // Subtitles
      const subIssues = validateSubtitles(page.subtitles);
      subIssues.forEach((issue) => errors.push(`❌ ${prefix}: ${issue}`));
    }
  }

  // Summary
  if (errors.length === 0 && warnings.length === 0) {
    console.log(`   ✅ All checks passed`);
  } else {
    warnings.forEach((w) => console.log(`   ${w}`));
    errors.forEach((e) => console.log(`   ${e}`));
  }

  return { id, title: data.title, errors: errors.length, warnings: warnings.length };
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

  // All prebuilt stories
  if (arg === "all") {
    const snapshot = await db.collection("stories").where("isPrebuilt", "==", true).get();
    return snapshot.docs;
  }

  // Range by seed order (match against STORY_CONSTANTS titles)
  const rangeMatch = arg?.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start < 1 || end < start) throw new Error(`Invalid range "${arg}". Use N-M where 1 ≤ N ≤ M.`);
    const titles = STORY_CONSTANTS.slice(start - 1, Math.min(end, STORY_CONSTANTS.length)).map((s) => s.title);
    const docs = [];
    for (const title of titles) {
      const snap = await db.collection("stories").where("title", "==", title).limit(1).get();
      if (snap.empty) console.log(`⚠️  "${title}" not found in Firestore — not seeded yet?`);
      else docs.push(snap.docs[0]);
    }
    if (!docs.length) throw new Error("No matching stories found in Firestore.");
    return docs;
  }

  // Partial title match
  if (arg && arg !== "all") {
    const snapshot = await db.collection("stories").where("isPrebuilt", "==", true).get();
    const needle = arg.toLowerCase();
    const matched = snapshot.docs.filter((d) => d.data().title?.toLowerCase().includes(needle));
    if (!matched.length) throw new Error(`No story found matching "${arg}"`);
    return matched;
  }

  // Default: most recently created prebuilt story
  const snapshot = await db.collection("stories")
    .where("isPrebuilt", "==", true)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (snapshot.empty) throw new Error("No prebuilt stories found in Firestore.");
  return snapshot.docs;
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
  console.log(`\n🔎 Validating ${docs.length} stor${docs.length === 1 ? "y" : "ies"}...`);

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
    failed.forEach((r) => console.log(`   • "${r.title}" — ${r.errors} error(s)`));
  }
  console.log("═".repeat(60));

  process.exit(failed.length > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error("💥 Validation failed:", err.message);
  process.exit(1);
});
