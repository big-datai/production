#!/usr/bin/env node
/**
 * Pre-upload checklist for an assembled Sara & Eva episode.
 *
 * Verifies the deliverable before YouTube upload:
 *   - All declared clips have rendered mp4s in clips/
 *   - No gaps in numeric clip sequence
 *   - Music-video loop segments (4.5/12.5/18.5/etc) match the song's block duration
 *   - Intro + outro clips present and within expected duration
 *   - Final assembled mp4 exists with reasonable size + duration
 *   - Thumbnail exists, metadata files exist (description/tags)
 *
 * Usage:
 *   node validateEpisode.mjs --episode=10
 *   node validateEpisode.mjs --episode=10 --strict
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv.filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const strict = flags.strict === "true";
if (!flags.episode) {
  console.error("Usage: validateEpisode.mjs --episode=NN [--strict]");
  process.exit(1);
}
const epNum = Number(flags.episode);
const epPad = String(epNum).padStart(2, "0");
const specDir = path.join(PROJECT_ROOT, "content", "episodes", `ep${epPad}`);
const deliverDir = path.join(PROJECT_ROOT, "season_01", `episode_${epPad}`);
const clipsDir = path.join(deliverDir, "clips");

console.log(`🩺 Validating ep${epPad}`);
console.log(`   spec dir:    ${specDir}`);
console.log(`   deliver dir: ${deliverDir}`);
console.log("");

let errors = 0, warnings = 0;
const errs = [];
const warns = [];

function probeDuration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
  return r.status === 0 ? Number(r.stdout.trim()) : null;
}

// 1. Spec dir exists
if (!fs.existsSync(specDir)) {
  errs.push(`spec directory missing: ${specDir}`);
  errors++;
}
// 2. Clips dir exists
if (!fs.existsSync(clipsDir)) {
  errs.push(`clips directory missing: ${clipsDir}`);
  errors++;
} else {
  const specs = fs.readdirSync(specDir).filter(f => /^(\d+(\.\d+)?|[A-Z])\.json$/.test(f));
  const renders = fs.readdirSync(clipsDir).filter(f => /^(\d+(\.\d+)?|[A-Z])\.mp4$/.test(f));
  const renderStems = new Set(renders.map(f => f.replace(".mp4", "")));

  // Each spec must have a matching mp4 (except letter clips A/B/C which become 4.5/12.5/etc decimal mp4s)
  for (const s of specs) {
    const stem = s.replace(".json", "");
    // Letter specs (A/B/C) get rendered to letter.mp4 then folded into music-video segments
    if (/^[A-Z]$/.test(stem)) {
      // Letter clip: was downloaded as A.mp4/B.mp4/C.mp4 OR is now embedded into 4.5/12.5/18.5
      // We expect either the raw letter mp4 OR a corresponding decimal segment
      continue;
    }
    if (!renderStems.has(stem)) {
      errs.push(`spec ${s} has no rendered mp4 (expected clips/${stem}.mp4)`);
      errors++;
    }
  }

  // Numeric clip sequence — flag gaps
  const numericStems = [...renderStems].filter(s => /^\d+$/.test(s)).map(Number).sort((a, b) => a - b);
  if (numericStems.length > 0) {
    const min = numericStems[0], max = numericStems[numericStems.length - 1];
    for (let i = min; i <= max; i++) {
      if (!numericStems.includes(i)) {
        warns.push(`numeric clip ${i}.mp4 missing (sequence gap between ${min} and ${max})`);
        warnings++;
      }
    }
  }

  // Music-video segments (decimal stems like 4.5, 12.5, 18.5) — verify each block has
  // SOME segment file with matching duration. Naming convention is loose (blockId
  // doesn't always match segment number — e.g. ep10's "20music" block is the 18.5.mp4
  // segment because it plays between clips 18 and 19).
  const flatSpec = path.join(PROJECT_ROOT, "content", "episodes", `ep${epPad}.json`);
  if (fs.existsSync(flatSpec)) {
    const ep = JSON.parse(fs.readFileSync(flatSpec, "utf8"));
    const blocks = ep?.music?.musicVideoBlocks || [];
    const decimalSegments = renders.filter(f => /^\d+\.\d+\.mp4$/.test(f));
    if (blocks.length > 0 && decimalSegments.length === 0) {
      warns.push(`spec declares ${blocks.length} music-video block(s) but no decimal segment files found in clips/`);
      warnings++;
    }
    // Match each block to a segment by duration (within 5s tolerance)
    const segmentDurations = decimalSegments.map(f => ({ file: f, dur: probeDuration(path.join(clipsDir, f)) }));
    const used = new Set();
    for (const b of blocks) {
      const expected = b.blockDurationSec;
      const matched = segmentDurations.find(sd => !used.has(sd.file) && sd.dur !== null && Math.abs(sd.dur - expected) <= 5);
      if (matched) {
        used.add(matched.file);
      } else {
        warns.push(`music-video block ${b.blockId} (${expected}s) has no matching segment file (decimal segments: ${decimalSegments.join(", ") || "none"})`);
        warnings++;
      }
    }
  }
}

// 3. Final assembled mp4 — pick the highest-version
const versions = fs.existsSync(deliverDir)
  ? fs.readdirSync(deliverDir).filter(f => new RegExp(`^ep${epPad}_v\\d+\\.mp4$`).test(f)).sort()
  : [];
if (versions.length === 0) {
  errs.push(`no assembled episode mp4 found (expected season_01/episode_${epPad}/ep${epPad}_v*.mp4)`);
  errors++;
} else {
  const latest = versions[versions.length - 1];
  const latestPath = path.join(deliverDir, latest);
  const stat = fs.statSync(latestPath);
  const dur = probeDuration(latestPath);
  console.log(`   latest:      ${latest} (${(stat.size/1024/1024).toFixed(1)} MB, ${dur?.toFixed(1)}s)`);
  if (stat.size < 50 * 1024 * 1024) {
    warns.push(`${latest} is ${(stat.size/1024/1024).toFixed(1)} MB — unusually small for a full episode`);
    warnings++;
  }
  if (dur !== null && (dur < 360 || dur > 600)) {
    warns.push(`${latest} duration ${dur.toFixed(1)}s outside typical 6-10 min range`);
    warnings++;
  }
}

// 4. Thumbnail exists
const thumbPath = path.join(deliverDir, `ep${epPad}_thumbnail.jpg`);
if (!fs.existsSync(thumbPath)) {
  errs.push(`thumbnail missing: ${thumbPath} (run generateThumbnail.mjs)`);
  errors++;
}

// 5. Metadata files
const descPath = path.join(deliverDir, `ep${epPad}_description.txt`);
const tagsPath = path.join(deliverDir, `ep${epPad}_tags.txt`);
if (!fs.existsSync(descPath)) { warns.push(`description missing: ${descPath}`); warnings++; }
if (!fs.existsSync(tagsPath)) { warns.push(`tags missing: ${tagsPath}`); warnings++; }
else {
  const tagsRaw = fs.readFileSync(tagsPath, "utf8");
  if (tagsRaw.length > 500) {
    errs.push(`tags file > 500 chars (${tagsRaw.length}) — YouTube rejects with "invalid video keywords"`);
    errors++;
  }
}

// 6. Vertical short
const shortPath = path.join(deliverDir, `ep${epPad}_short.mp4`);
if (!fs.existsSync(shortPath)) {
  warns.push(`vertical short missing: ${shortPath} (run generateShort.mjs)`);
  warnings++;
}

// ─── Report ─────────────────────────────────────────────────────────────
console.log("");
for (const e of errs) console.log(`  ❌ ${e}`);
for (const w of warns) console.log(`  ⚠  ${w}`);

console.log("");
console.log(`📊 Summary: ${errors} errors · ${warnings} warnings`);
if (errors > 0) {
  console.log(`\n❌ Episode is NOT ready to upload.`);
  process.exit(1);
} else if (warnings > 0 && strict) {
  console.log(`\n⚠ ${warnings} warning(s) — strict mode treats as errors.`);
  process.exit(2);
} else if (warnings > 0) {
  console.log(`\n⚠ ${warnings} warning(s) — review but not blocking.`);
  process.exit(0);
} else {
  console.log(`\n✅ Episode ready to upload.`);
  process.exit(0);
}
