#!/usr/bin/env node
/**
 * Pre-submission lint for an entire episode's clip specs.
 *
 * Runs ALL the rules submitOmniClip enforces, plus the post-ep10 traps that
 * cost 450 cr in retries (ghost-character, driver-180, 3-arm anatomy).
 * Catches issues BEFORE spending Kling credits — fail fast at draft time.
 *
 * Usage:
 *   node validateClipCasting.mjs <episode_dir>
 *   node validateClipCasting.mjs --episode=10
 *   node validateClipCasting.mjs <ep_dir> --strict   # treat warnings as errors
 *
 * Exit: 0 = clean, 1 = errors, 2 = warnings only (non-strict mode passes)
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv.filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const positional = argv.filter(a => !a.startsWith("--"));
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const strict = flags.strict === "true";

let epDir;
if (positional[0]) epDir = path.resolve(positional[0]);
else if (flags.episode) epDir = path.join(PROJECT_ROOT, "content", "episodes", `ep${String(flags.episode).padStart(2, "0")}`);
else {
  console.error("Usage: validateClipCasting.mjs <ep_dir> | --episode=NN  [--strict]");
  process.exit(1);
}
if (!fs.existsSync(epDir) || !fs.statSync(epDir).isDirectory()) {
  console.error(`❌ episode dir not found: ${epDir}`);
  process.exit(1);
}

// ─── Rule definitions (mirror submitOmniClip + post-ep10 traps) ─────────────
const FORBIDDEN_PHRASES = [
  /\brace\b/i, /\bchase\b/i,
  /\bhigh[- ]?five\b/i, /\bhigh[- ]?fives\b/i,
  /\bgroup of\b/i, /\bcrowd\b/i, /\bfamily of\b/i,
  /\benters\b/i, /\barriving\b/i, /\bmirror(ed)? figure\b/i,
  /\bwalks?\s+in\b/i, /\bwalking\s+in\b/i,
  /\bwalks?\s+(up|toward|up to|over to|into)\b/i, /\bwalking\s+(up|toward|up to|over to|into)\b/i,
  /\bapproach(es|ing)\b/i,
  /\bmoves?\s+to(ward)?\b/i, /\bmoving\s+to(ward)?\b/i,
  /\bhead(s|ing|ed)?\s+(into|to|toward|over\s+to)\b/i,
];
const REQUIRED_NEG_TERMS = [
  "duplicate character", "twin", "clone", "two of the same",
  "mirrored figure", "second father", "second mother",
  "two Papa", "two Mama", "identical adults",
];
const MUSIC_STING_PHRASES = [
  "music sting", "music swell", "tender swell", "cheerful music",
  "comedic music", "playful music", "heartfelt music", "music cue",
  "score swell", "background music",
];

// Post-ep10 trap patterns. Tuned to be specific enough to avoid false positives
// on valid framings like "rear-of-cabin shot looking forward through windshield"
// where Mama is at the wheel facing forward (no 180° trap).
const TRAP_LOOKING_BACK_DRIVER = [
  // Explicit "looking back at the kids" with driver-at-wheel nearby
  /looking\s+back\s+at\s+(?:the\s+)?(?:kids|girls|children|back\s*[- ]?row)/i,
  // Driver "turned around" / "turned toward the back"
  /(?:driver|mama|papa)\s+(?:is|already)?\s*turned\s+(?:around|toward\s+the\s+back|backward)/i,
];
const TRAP_OBJECT_HOLD_ARM_SWING = [
  // "holding X" + "swinging arms" or "pointing fingers" or "hands in air" creates 3rd-arm risk
  // Detect when prompt mentions holding a cup/shake/cone AND free-arm verbs
];

// ─── Load all per-clip JSONs ────────────────────────────────────────────────
const clips = [];
for (const f of fs.readdirSync(epDir).sort()) {
  if (!/^(\d+(\.\d+)?|[A-Z])\.json$/.test(f)) continue;
  const spec = JSON.parse(fs.readFileSync(path.join(epDir, f), "utf8"));
  clips.push({ file: f, spec });
}
if (clips.length === 0) {
  console.error(`❌ no clip JSONs found in ${epDir}`);
  process.exit(1);
}

console.log(`🔍 Linting ${clips.length} clips in ${path.basename(epDir)}/`);
console.log("");

let errors = 0, warnings = 0;
const groupShotCandidates = [];

for (const { file, spec } of clips) {
  const issues = [];
  const warns = [];
  const prompt = spec.prompt || "";
  const negPrompt = (spec.negativePrompt || "").toLowerCase();
  const tags = (spec.boundElements || []).map(b => b.tag);
  const subjects = spec.subjects || [];

  // 1. Required spec fields
  if (spec.mode !== "omni") issues.push(`mode must be "omni" (got "${spec.mode}")`);
  if (![5, 10, 15].includes(spec.durationSec)) issues.push(`durationSec must be 5/10/15 (got ${spec.durationSec})`);
  if (!Array.isArray(spec.boundElements) || spec.boundElements.length < 1 || spec.boundElements.length > 7) {
    issues.push(`boundElements length must be 1-7 (got ${spec.boundElements?.length ?? 0})`);
  }
  if (!prompt) issues.push("prompt is empty");

  // 2. Forbidden prompt phrases (motion-toward, group-of, music-sting)
  for (const re of FORBIDDEN_PHRASES) {
    if (re.test(prompt)) issues.push(`forbidden phrase ${re} in prompt`);
  }
  for (const phrase of MUSIC_STING_PHRASES) {
    if (prompt.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push(`music-sting phrase "${phrase}" — Suno mixes music in assemble, no music phrases in Kling prompts`);
    }
  }

  // 3. Required negative-prompt terms (auto-prepended at submit but flag at lint time so author sees the gap)
  const missingNeg = REQUIRED_NEG_TERMS.filter(t => !negPrompt.includes(t.toLowerCase()));
  if (missingNeg.length > 0) {
    warns.push(`negativePrompt missing ${missingNeg.length} required terms (will auto-prepend at submit): ${missingNeg.slice(0,3).join(", ")}${missingNeg.length > 3 ? "..." : ""}`);
  }

  // 4. @-tag references in prompt must match boundElements (case-insensitive)
  const atTags = [...prompt.matchAll(/@([A-Za-z][A-Za-z0-9_-]*)/g)].map(m => m[1]);
  const declaredLower = new Set(tags.map(t => t.toLowerCase()));
  for (const tag of atTags) {
    if (!declaredLower.has(tag.toLowerCase())) {
      issues.push(`@${tag} in prompt has no matching boundElement (declared: ${tags.join(", ")})`);
    }
  }

  // 5. Each character @-tag should appear at most once in prompt (clone rule #8)
  const charTags = atTags.filter(t => /^(Sara|Eva|Mama|Papa|Ginger|Joe|Grandma)$/i.test(t));
  const charCounts = {};
  for (const t of charTags) charCounts[t.toLowerCase()] = (charCounts[t.toLowerCase()] || 0) + 1;
  for (const [t, n] of Object.entries(charCounts)) {
    if (n > 1) issues.push(`character @${t} appears ${n} times in prompt (max 1; subsequent mentions should be bare name)`);
  }

  // 6. Character count check (post-ep10 rule 5d)
  const charBoundCount = tags.filter(t => /^(Sara|Eva|Mama|Papa|Ginger|Joe|Grandma)$/i.test(t)).length;
  if (charBoundCount >= 4) {
    warns.push(`${charBoundCount} characters bound — recommend Nano Banana group-shot pre-render via generateGroupShot.py to lock count`);
    groupShotCandidates.push({ file, charBoundCount, chars: tags.filter(t => /^(Sara|Eva|Mama|Papa)$/i.test(t)) });
  }

  // 7. Driver-180 trap (post-ep10 rule 5e)
  for (const re of TRAP_LOOKING_BACK_DRIVER) {
    if (re.test(prompt)) {
      issues.push(`"looking back at kids" + driver framing → Mama/Papa rotates 180° (post-ep10 clip 12 trap). Use side-exterior or front-view instead.`);
      break;
    }
  }

  // 8. Holding-object + free-arm-dance trap (post-ep10 rule 5f)
  const holdsObject = /\b(holds?|holding) (a |an |the )?(?:milkshake|shake|cup|cone|burger|book|toy|prop)/i.test(prompt);
  const freeArmDance = /\b(swing(s|ing)? arms?|arms? (raised|in the air|swinging)|point(s|ing)? fingers?|hands? on hips)\b/i.test(prompt);
  if (holdsObject && freeArmDance) {
    issues.push(`holding-object + free-arm-dance combo (3rd-arm anatomy bug, post-ep10 clip C). Lock both hands on object, dance lower-body + head only.`);
  }

  // 9. Group-noun check (rule #5) — only flag when the group noun is the SUBJECT
  // of an action verb (not in stage direction or compound nouns like "family selfie").
  const groupNounAsSubject = /\b(everyone|the\s+family|both\s+girls|the\s+kids|the\s+sisters)\s+(?:is|are|was|were|run|runs|walk|walks|laugh|laughs|smile|smiles|jump|jumps|cheer|cheers|shout|shouts|sing|sings|dance|dances|play|plays)\b/i;
  if (groupNounAsSubject.test(prompt)) {
    issues.push(`group-noun as subject in prompt — spawns strangers. Bind every member individually.`);
  }

  // 10. Bound character name in another character's dialogue (rule from ep01)
  const charSpeakers = ["Sara", "Eva", "Mama", "Papa"];
  for (const speaker of charSpeakers) {
    const regex = new RegExp(`${speaker}[^"]*?: "([^"]*)"`, "g");
    let match;
    while ((match = regex.exec(prompt)) !== null) {
      const dialogue = match[1];
      for (const otherChar of charSpeakers) {
        if (otherChar === speaker) continue;
        if (new RegExp(`\\b${otherChar}\\b`).test(dialogue)) {
          warns.push(`${speaker} says "${otherChar}" in dialogue — may spawn extra ${otherChar} (rule from ep01)`);
        }
      }
    }
  }

  // ─── Report ────────────────────────────────────────────────────────────
  if (issues.length === 0 && warns.length === 0) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  ${issues.length > 0 ? "✗" : "⚠"} ${file}`);
    for (const e of issues) { console.log(`      ❌ ${e}`); errors++; }
    for (const w of warns) { console.log(`      ⚠  ${w}`); warnings++; }
  }
}

// ─── Final summary ─────────────────────────────────────────────────────────
console.log("");
console.log(`📊 Summary: ${clips.length} clips · ${errors} errors · ${warnings} warnings`);
if (groupShotCandidates.length > 0) {
  console.log("");
  console.log(`🎨 Nano Banana group-shot candidates (4+ char clips):`);
  for (const c of groupShotCandidates) {
    console.log(`   ${c.file}: ${c.charBoundCount} chars [${c.chars.join(", ")}]`);
    console.log(`     → python3 content/generateGroupShot.py ep<NN>_clip${c.file.replace(".json","")}_<beat> --chars ${c.chars.map(s => s.toLowerCase()).join(",")} --pose "..." --n 3`);
  }
}

if (errors > 0) {
  console.log(`\n❌ ${errors} hard error(s) — fix before submitting.`);
  process.exit(1);
} else if (warnings > 0 && strict) {
  console.log(`\n⚠ ${warnings} warning(s) — strict mode treats as errors.`);
  process.exit(2);
} else if (warnings > 0) {
  console.log(`\n⚠ ${warnings} warning(s) — review but not blocking.`);
  process.exit(0);
} else {
  console.log(`\n✅ All clips clean. Safe to submit.`);
  process.exit(0);
}
