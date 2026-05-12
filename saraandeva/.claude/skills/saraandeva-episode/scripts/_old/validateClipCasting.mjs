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
  // Post-ep11: "running in from" / "runs in" / "runs over" — motion-toward variants that
  // ep11 clip 15 (parent-activity tackle-hug) used and which spawned ghost extras.
  /\bruns?\s+in\b/i, /\brunning\s+in\b/i,
  /\bruns?\s+in\s+from\b/i, /\brunning\s+in\s+from\b/i,
  /\bruns?\s+(up|toward|up to|over to|into)\b/i, /\brunning\s+(up|toward|up to|over to|into)\b/i,
  /\bruns?\s+over\b/i, /\brunning\s+over\b/i,
];

// Post-ep11: kids-show blood-trap. Bright-red liquid near a character's FACE / MOUTH /
// CHIN / NECK / APRON-FRONT renders as blood regardless of what the prompt CALLS it
// (ketchup, jam, paint…). ep11 clip 15 cost 135 cr to re-render after rendering as gore.
// Memory: lesson_no_red_splatter_kids_show.md
//
// Loose co-occurrence check: red+splatter-verb anywhere AND any body/clothing reference
// anywhere in the prompt. False positives are fine — the warning is non-blocking and
// prompts the author to re-read the visual, which is exactly the right reflex.
const TRAP_RED_LIQUID_NEAR_FACE = (prompt) => {
  const splatterRe = /\b(?:red|crimson|scarlet|bright[- ]?red|blood[- ]?red)\b[^.]*\b(?:squirt|squirts|squirting|splash|splashes|splashing|splatter|splatters|splattering|spray|sprays|spraying|drip|drips|dripping|drizzle|drizzling|spurt|spurting|gush|gushing|burst|bursting|smear|smears|smeared|stain|stains|stained|spilling)\b/i;
  const splatterRe2 = /\b(?:squirt|squirts|squirting|splash|splashes|splashing|splatter|splatters|splattering|spray|sprays|spraying|drip|drips|dripping|spurt|spurting|gush|gushing)\b[^.]*\b(?:red|crimson|scarlet|bright[- ]?red|blood[- ]?red)\b/i;
  const bodyOrApronRe = /\b(?:face|mouth|lip|lips|chin|neck|teeth|cheek|cheeks|nose|forehead|apron|chest|shirt|collar)\b/i;
  return (splatterRe.test(prompt) || splatterRe2.test(prompt)) && bodyOrApronRe.test(prompt);
};
const REQUIRED_NEG_TERMS = [
  "duplicate character", "twin", "clone", "two of the same",
  "mirrored figure", "second father", "second mother",
  "two Papa", "two Mama", "identical adults",
];

// Post-ep13 — UNIVERSAL ANTI-MORPH NEGATIVES (synthesis from Kling community
// prompt-anatomy guides, Dec 2025–Feb 2026). These address frame-to-frame
// inconsistency, anatomy warping, and stray ghost faces — a separate failure
// class from character-duplicate spawning. Adding them costs 0 cr (text-only)
// and is universally beneficial. Memory: lesson_kling_continuity_locks.md
const REQUIRED_ANTI_MORPH_NEG_TERMS = [
  "morphing", "flickering", "disfigured", "distorted",
  "extra face", "unstable motion",
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

// Post-ep11 v7 — POSITION-LOCK TRAP (Lesson #11). Describing the SAME @Char in
// two DIFFERENT physical positions across beats (e.g. "kneeling 3 feet away"
// beat 1 → "snuggled at shoulder" beat 3) makes Kling render BOTH states
// simultaneously. Result: duplicate character + ghost extras. ep11 clip 15
// burned 135 cr on a "two-Evas + ghost-girl" render before this was understood.
// Fix: lock all but ONE character (the moving one) to a single position for
// the entire clip. Memory: lesson_kling_position_lock.md
//
// Detection heuristic: same @Char anchored with "already" twice in the same
// prompt, where one anchor uses FAR-distance language and another uses
// CLOSE-contact language. False positives are unlikely because both bucket
// vocabularies are quite specific to physical staging.
const POSITION_LOCK_TRAP = (prompt) => {
  for (const char of ["Papa", "Sara", "Eva", "Mama", "Joe", "Ginger", "Grandma"]) {
    const re = new RegExp(`@?${char}\\s+already\\s+([^.]{20,250})`, "gi");
    const positions = [...prompt.matchAll(re)].map(m => m[1].toLowerCase());
    if (positions.length < 2) continue;
    const hasFar = positions.some(p =>
      /\b(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:feet|ft|meters?|m)\s+(?:away|from|apart|back|over)|few\s+feet|a\s+few\s+feet|across\s+the|opposite\s+side|other\s+side|far\s+side|edge\s+of|on\s+the\s+(?:left|right)\s+side\s+of\s+the\s+yard)\b/.test(p)
    );
    const hasClose = positions.some(p =>
      /\b(snuggled\s+(in\s+)?close|pressed\s+(in\s+)?(close\s+)?against|right\s+next\s+to|cuddled\s+(in\s+)?close|wrapped\s+around\s+his|wrapped\s+around\s+her|hugging\s+(his|her)\s+(arm|shoulder|leg)|leaning\s+(on|against)\s+(his|her)\s+(arm|shoulder|chest))\b/.test(p)
    );
    if (hasFar && hasClose) return char;
  }
  return null;
};

// Post-ep13 — MULTI-POSITION-PATH TRAP. Even with a "smooth continuous walk"
// disclaimer, describing the SAME @Char at 3+ named positions across beats
// (e.g. "Papa starts at the LEFT, paces to the BACK by sec 5, paces to the
// RIGHT by sec 10, paces to the FRONT by sec 15") makes Kling anchor multiple
// instances of that character — one at each named position. ep13 music-video
// A burned 135 cr on this exact mistake (Papa pacing around tower-house →
// rendered with multiple Papas + duplicate kids at the windows). Memory:
// lesson_kling_position_lock.md (extended).
//
// Detection: count distinct named POSITION TOKENS (LEFT/RIGHT/CENTER/BACK/
// FRONT/CORNER) within the beat-block describing one character's path.
// 3+ distinct tokens for the SAME char = HARD ERROR.
const MULTI_POSITION_PATH_TRAP = (prompt) => {
  // Genuine multi-position-along-path patterns. Tuned to AVOID false-positives
  // on CENTER-LEFT / CENTER-RIGHT anchor labels (those are single-position
  // staging, not a character moving). Dedup by the matched position name so
  // "left side" repeated 5× counts once.
  const POSITION_PATTERNS = [
    { name: "LEFT side", re: /\bleft side\b/ },
    { name: "RIGHT side", re: /\bright side\b/ },
    { name: "BACK of the [structure]", re: /\bback of the (?:tower|house|playground|yard|court|stage|car|jeep)\b/ },
    { name: "FRONT of the [structure]", re: /\bfront of the (?:tower|house|playground|yard|court|stage|car|jeep)\b/ },
    { name: "LEFT window", re: /\bleft window\b/ },
    { name: "RIGHT window", re: /\bright window\b/ },
    { name: "BACK window", re: /\bback window\b/ },
    { name: "LEFT corner", re: /\bleft corner\b/ },
    { name: "RIGHT corner", re: /\bright corner\b/ },
    { name: "FAR corner", re: /\bfar corner\b/ },
  ];
  for (const char of ["Papa", "Sara", "Eva", "Mama", "Joe", "Ginger", "Isabel", "Leo"]) {
    const sentenceRe = /[^.]+\./g;
    const charPositions = new Set();
    for (const sentence of prompt.match(sentenceRe) || []) {
      const lc = sentence.toLowerCase();
      // SKIP "POSITION LOCK" preamble sentences (rule explanation).
      if (lc.includes("position lock")) continue;
      // SKIP multi-character setup sentences ("Papa at FRONT, Sara at LEFT
      // window, Eva at RIGHT window") — those distribute positions across
      // 2+ chars, not giving any single char multiple positions. Only
      // count sentences that name THIS char (and at most one other for
      // dialogue context).
      const allCharNames = ["papa", "sara", "eva", "mama", "isabel", "leo", "joe", "ginger"];
      const namedInSentence = allCharNames.filter(n => new RegExp(`\\b@?${n}\\b`).test(lc));
      if (namedInSentence.length > 1) continue;
      const charRe = new RegExp(`\\b@?${char.toLowerCase()}\\b`);
      if (!charRe.test(lc)) continue;
      for (const { name, re } of POSITION_PATTERNS) {
        if (re.test(lc)) charPositions.add(name);
      }
    }
    if (charPositions.size >= 3) return { char, positions: [...charPositions] };
  }
  return null;
};

// Post-ep13 v2 — IMAGE-TO-VIDEO PROMPT-OVER-DESCRIPTION TRAP. When a Nano
// Banana group still is bound as the primary anchor (tag pattern: "*-group"
// or "*-still"), the Kling prompt should describe ONLY motion + dialogue,
// NOT re-describe the composition (positions, wardrobe, characters). Re-
// describing fights the still and spawns duplicates / wrong composition.
// ep13 v2 clips 16 + A burned 225 cr on this — the user's pre-rendered
// group still showed Papa-at-FRONT but the prompt redescribed Papa "in
// front of the tower" with full character details, and Kling rendered a
// confused mash-up with extra characters and wrong staging.
//
// Detection heuristic: if any boundElement tag matches *-group/*-still AND
// the prompt contains 3+ POSITION_TOKENS (CENTER-LEFT, CENTER-RIGHT, FAR-
// RIGHT, etc) describing characters, flag a WARNING — recommend stripping
// the position re-description down to motion-only.
const PROMPT_OVERDESCRIBE_RISK = (prompt, tags) => {
  const hasGroupStill = tags.some(t => /-(group|still)$/i.test(t));
  if (!hasGroupStill) return false;
  // Count position-anchor labels in the prompt (CENTER-LEFT etc)
  const POSITION_LABELS = /\b(CENTER-LEFT|CENTER-RIGHT|FAR-LEFT|FAR-RIGHT|FOREGROUND-LEFT|FOREGROUND-RIGHT|LEFT WINDOW|RIGHT WINDOW)\b/g;
  const matches = prompt.match(POSITION_LABELS) || [];
  return matches.length >= 3 ? matches.length : false;
};

// Post-ep13 — SISTER-PAIR SIMILAR-POSE RISK. When Sara + Eva are co-bound
// AND both are described with structurally-similar pose phrases ("both hands
// X at her Y") AND no distinct color-anchored objects (helmet/scooter/ball),
// Kling can't reliably differentiate the two blonde sisters — sometimes
// renders 2 Evas instead of 1 Sara + 1 Eva, or vice versa. ep13 clips 1, 12,
// 16 all hit this. Mitigation: Nano Banana group-shot pre-render to lock
// the composition before Kling animation. Recommendation level WARNING (not
// hard-error) since some clips ship clean with subtle differentiators.
// Post-ep11 (lesson_kids_show_comedy_intensity.md) + post-ep13 Kling-community
// guide synthesis — INTENSITY-OVERSHOOT TRAP. Aggressive intensity language
// in a kids-show prompt makes Kling render horror lighting / morphing / scary
// faces regardless of context. ep11 clip 14 (Mama-rage frustration scene)
// burned 180 cr re-rendering after "thundering shout" + "leaves tremble" got
// rendered as actual horror. Use restrained verbs ("subtle", "slow", "micro",
// "calm sigh", "comic gasp", "soft tone") instead.
//
// Distinct from FORBIDDEN_PHRASES (which targets motion-toward verbs that
// duplicate the character) — this is about EMOTIONAL INTENSITY language
// causing morph/horror rendering.
//
// Patterns are tuned to require a body-context anchor where ambiguous
// (e.g. "snap" alone is fine for finger-snapping but "snaps his head"
// is the head-snap motion that morphs).
const INTENSITY_OVERSHOOT_PATTERNS = [
  { name: "thundering",                 re: /\bthundering\b/i },
  { name: "apoplectic",                 re: /\bapoplectic\b/i },
  { name: "rage face / raging",         re: /\brage\s+face\b|\braging\b/i },
  { name: "fury / furious",             re: /\bfur(?:ious|y)\b/i },
  { name: "violent / violently",        re: /\bviolent(?:ly)?\b/i },
  { name: "explosive / explosively",    re: /\bexplosive(?:ly)?\b/i },
  { name: "snap [head|body|neck]",      re: /\bsnap(?:s|ping|ped)?\s+(?:his|her|their)\s+(?:head|body|neck)\b/i },
  { name: "lunge [at|toward|forward]",  re: /\blunges?\s+(?:at|toward|forward)\b/i },
  { name: "slam [into|onto|down]",      re: /\bslams?\s+(?:into|onto|down)\b/i },
  { name: "abrupt[ly] [body verb]",     re: /\babrupt(?:ly)?\s+(?:jump|stop|turn|run|push|throw|spin)\b/i },
  { name: "thunderous [voice|shout]",   re: /\bthunderous\s+(?:voice|shout|tone|roar)\b/i },
  { name: "shriek / shrieking",         re: /\bshriek(?:s|ing|ed)?\b/i },
];
const INTENSITY_OVERSHOOT_TRAP = (prompt) =>
  INTENSITY_OVERSHOOT_PATTERNS.filter(({ re }) => re.test(prompt)).map(p => p.name);

const SISTER_PAIR_SIMILAR_POSE_RISK = (prompt, tags) => {
  const hasSara = tags.some(t => /^sara$/i.test(t));
  const hasEva = tags.some(t => /^eva$/i.test(t));
  if (!hasSara || !hasEva) return false;
  // Look for matching gesture verbs applied to BOTH girls
  const saraGesture = (prompt.match(/Sara has[^.]*?both hands? (\w+)/i) || prompt.match(/@?Sara[^.]*?both hands? (\w+)/i) || [])[1];
  const evaGesture = (prompt.match(/Eva has[^.]*?both hands? (\w+)/i) || prompt.match(/@?Eva[^.]*?both hands? (\w+)/i) || [])[1];
  if (!saraGesture || !evaGesture) return false;
  // If both gestures share a stem (clasped/raised/cupped/held/at), or are
  // identical, that's the risky pattern. Distinct gestures with a held-object
  // anchor (scooter, ball, bucket) are safer.
  const distinctObjectAnchored = /\b(scooter|helmet on|tennis ball|bucket|book|toy|microphone)\b/i.test(prompt);
  if (distinctObjectAnchored) return false;
  if (saraGesture.toLowerCase() === evaGesture.toLowerCase()) return { saraGesture, evaGesture };
  // Same root verb (e.g. "clasped" + "clasped" or "raised" + "raised")
  const rootMatch = saraGesture.replace(/(ed|ing|s)$/, "") === evaGesture.replace(/(ed|ing|s)$/, "");
  if (rootMatch) return { saraGesture, evaGesture };
  return false;
};

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

  // 8b. Red-liquid-near-face trap (post-ep11 clip 15 — Kling renders red splatter as blood
  //     regardless of intent. Memory: lesson_no_red_splatter_kids_show.md). HARD ERROR
  //     because gore in a kids show is a publish-blocker.
  if (TRAP_RED_LIQUID_NEAR_FACE(prompt)) {
    issues.push(`red-liquid splatter co-occurs with face/apron/chest mention — Kling renders red splatter as BLOOD in a kids show, regardless of what the prompt calls it. Use sealed-intact packets, recolor to non-red (purple/blue/yellow), or remove face/apron-front from the splatter zone. memory: lesson_no_red_splatter_kids_show.md`);
  }

  // 8c. Position-lock trap (post-ep11 v7 clip 15 — Lesson #11). Describing the
  //     same @Char in TWO different physical positions across beats causes Kling
  //     to render BOTH states simultaneously → duplicate character + ghost
  //     extras. ep11 clip 15 burned 135 cr on a "two-Evas + ghost-girl" render.
  //     Memory: lesson_kling_position_lock.md. HARD ERROR — cost is non-trivial.
  const lockTrapChar = POSITION_LOCK_TRAP(prompt);
  if (lockTrapChar) {
    issues.push(`@${lockTrapChar} described in TWO different distance-positions across beats (FAR-language + CLOSE-language) — Kling will render BOTH states simultaneously, spawning a duplicate ${lockTrapChar} and ghost extras. Lock @${lockTrapChar} to ONE physical position from second 0 to second N; only ONE character per clip may transition pose. Add a "POSITION LOCK" paragraph to the prompt explicitly. memory: lesson_kling_position_lock.md`);
  }

  // 8d. Multi-position-path trap (post-ep13 music-video A — Lesson #11
  //     extension). Describing the same @Char at 3+ NAMED POSITIONS across
  //     beats (LEFT, BACK, RIGHT, FRONT) causes Kling to render multiple
  //     instances of that character — one at each named position. ep13 MV-A
  //     burned 135 cr ("Papa paces around tower" → multiple Papas at each
  //     side). HARD ERROR. Fix: lock the moving character to ONE named
  //     position; show beat-by-beat motion only as in-place gesture changes.
  const pathTrap = MULTI_POSITION_PATH_TRAP(prompt);
  if (pathTrap) {
    issues.push(`@${pathTrap.char} described at ${pathTrap.positions.length} named positions (${pathTrap.positions.join(", ")}) — Kling will spawn one instance per named position even with "smooth continuous walk" disclaimer. Lock @${pathTrap.char} to ONE named position; show beat changes as in-place gesture/expression only. memory: lesson_kling_position_lock.md`);
  }

  // 8e. Sister-pair similar-pose risk (post-ep13 clips 1, 12, 16). When Sara
  //     + Eva are co-bound AND both have structurally-similar pose phrases
  //     AND no distinct held-object anchor, Kling sometimes renders 2 Evas
  //     instead of 1 Sara + 1 Eva. WARNING level — recommends Nano Banana
  //     group-shot pre-render. Memory: lesson_kling_position_lock.md
  //     (extended for sister-similarity).
  const sisterRisk = SISTER_PAIR_SIMILAR_POSE_RISK(prompt, tags);
  if (sisterRisk) {
    warns.push(`Sara + Eva both described with similar pose ("${sisterRisk.saraGesture}" / "${sisterRisk.evaGesture}") and no distinct color-anchored object — recommend Nano Banana group-shot pre-render via generateGroupShot.py. Sister-pair Kling render risk (post-ep13). memory: lesson_kling_position_lock.md`);
  }

  // 8f. Prompt-over-description trap (post-ep13 v2 clips 16 + A). When a
  //     Nano Banana group still is the primary anchor, the prompt should be
  //     motion-only — re-describing the composition fights the still and
  //     spawns duplicates / wrong staging. HARD ERROR (this burned 225 cr
  //     on top of the v1 dup bug).
  const overdescribeCount = PROMPT_OVERDESCRIBE_RISK(prompt, tags);
  if (overdescribeCount) {
    issues.push(`group-still anchor + ${overdescribeCount} POSITION_LABELS (CENTER-LEFT / FAR-RIGHT / LEFT WINDOW / etc.) in prompt — when a *-group or *-still PNG is the bound anchor, the prompt MUST be motion-only. Re-describing the composition fights the still and spawns duplicates. Strip position labels from the prompt; describe only beat-by-beat motion + dialogue. memory: lesson_kling_position_lock.md (post-ep13 v2)`);
  }

  // 8g. Universal anti-morph negative-prompt completeness (post-ep13 synthesis
  //     from Kling community prompt-anatomy guides). Adding these costs zero
  //     credits and addresses frame-to-frame inconsistency / anatomy warping
  //     that don't fit the duplicate-character bucket. WARNING.
  const missingMorph = REQUIRED_ANTI_MORPH_NEG_TERMS.filter(t => !negPrompt.includes(t.toLowerCase()));
  if (missingMorph.length > 0) {
    warns.push(`negativePrompt missing ${missingMorph.length} anti-morph term(s): ${missingMorph.join(", ")}. Recommended addition (zero cost, frame-consistency benefit). memory: lesson_kling_continuity_locks.md`);
  }

  // 8h. Intensity-overshoot trap (post-ep11 lesson_kids_show_comedy_intensity.md
  //     + post-ep13 Kling-community-guide synthesis). Aggressive intensity
  //     vocabulary in a kids-show prompt → Kling renders horror lighting /
  //     scary face / morphing. ep11 clip 14 burned 180 cr on this. WARNING
  //     so author can re-phrase before submitting.
  const overshootHits = INTENSITY_OVERSHOOT_TRAP(prompt);
  if (overshootHits.length > 0) {
    warns.push(`intensity-overshoot vocabulary detected (${overshootHits.length}): ${overshootHits.join(", ")} — kids-show Kling renders these as horror lighting / scary face / body-morph. Use restrained alternatives ("subtle", "slow", "micro", "calm sigh", "comic gasp", "soft tone"). memory: lesson_kids_show_comedy_intensity.md + lesson_kling_continuity_locks.md`);
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

// ─── Episode-level check: fourth-wall camera-asks ──────────────────────────
// Memory: lesson_fourth_wall_audience_engagement.md — every ep needs 2-4
// direct-to-camera "ask the kid" beats; final cliffhanger MUST be a camera-ask.
// Scan all clip prompts for camera-ask phrases. ep11 retro flagged this as an
// open follow-up; landing it now.
const cameraAskRe = /(?:to camera|at the camera|directly (?:to|at|into|toward) the camera|toward the lens|directly into the lens|hold(?:s)?[^.]*up to (?:the )?camera|asks? the (?:viewer|audience|kids?))/i;
const cameraAskFiles = clips
  .filter(({ spec }) => cameraAskRe.test(spec.prompt || ""))
  .map(({ file }) => file);
const numericClipFiles = clips.map(({ file }) => file).filter(f => /^\d+(\.\d+)?\.json$/.test(f));
if (numericClipFiles.length > 0) {
  if (cameraAskFiles.length < 2) {
    console.log("");
    console.log(`⚠ Episode-level: only ${cameraAskFiles.length} fourth-wall camera-ask beat(s) detected. Need 2-4 per episode.`);
    console.log(`   memory: lesson_fourth_wall_audience_engagement.md — direct-to-camera "ask the kid" beats are a top retention driver.`);
    warnings++;
  }
  const lastClip = numericClipFiles.sort((a, b) => Number(a.replace(/\.json$/, "")) - Number(b.replace(/\.json$/, ""))).pop();
  if (!cameraAskFiles.includes(lastClip)) {
    console.log("");
    console.log(`⚠ Episode-level: final clip ${lastClip} appears to lack a camera-ask cliffhanger. Final beat MUST address the audience.`);
    console.log(`   memory: lesson_fourth_wall_audience_engagement.md — closing camera-ask is non-negotiable.`);
    warnings++;
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
