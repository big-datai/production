#!/usr/bin/env node
/**
 * Gemini 3 Pro Preview second-opinion review for a Kling Omni v3 prompt
 * BEFORE submitting to Kling. Catches static-render verbs, ambiguous action,
 * duplicate-character risk, horror tone, and cross-character collisions.
 *
 * Per `lesson_kling_papa_active_prompt_template.md` — body-part verbs in CAPS
 * + Papa-passive negative bans + duplicate-char negatives are the load-bearing
 * levers. This reviewer enforces them.
 *
 * Usage:
 *   echo "$PROMPT" | node reviewPromptWithGemini.mjs
 *   node reviewPromptWithGemini.mjs --prompt-file path/to/prompt.txt
 *   node reviewPromptWithGemini.mjs --prompt-file path --negative-file path
 *
 * Exit codes:
 *   0 = PASS
 *   1 = FAIL (review surfaces required fixes — printed to stdout)
 */
import fs from "node:fs";
import path from "node:path";

const ENV_CANDIDATES = [
  "/Volumes/Samsung500/goreadling-production/.env.local",
  path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../.env.local"),
];
function loadEnv(p) {
  if (!fs.existsSync(p)) return false;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z_0-9]*)=["']?(.+?)["']?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  return true;
}
for (const p of ENV_CANDIDATES) if (loadEnv(p)) break;

const KEYS = ["GEMINI_API_KEY","GEMINI_API_KEY_2","GEMINI_API_KEY_3","GEMINI_API_KEY_4","GEMINI_API_KEY_5","GEMINI_API_KEY_6"]
  .map(n => process.env[n]).filter(Boolean).map(k => k.replace(/"/g, "").trim());
if (!KEYS.length) { console.error("No GEMINI_API_KEY* in env"); process.exit(2); }

const argv = process.argv.slice(2);
const argFlag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };

let prompt = "";
const promptFile = argFlag("prompt-file");
if (promptFile) prompt = fs.readFileSync(promptFile, "utf8");
else prompt = fs.readFileSync(0, "utf8"); // stdin
prompt = prompt.trim();
if (!prompt) { console.error("Empty prompt"); process.exit(2); }

let negativePrompt = "";
const negFile = argFlag("negative-file");
if (negFile) negativePrompt = fs.readFileSync(negFile, "utf8").trim();

const REVIEWER = `You are a video-prompt reviewer for the Kling Omni v3 ("kling-v3-omni") image-to-video model used to produce the "Sara and Eva" Pixar-style children's animated series.

You will be given a prompt the user is about to submit. Identify any of these specific failure modes:

(1) STATIC-RENDER RISK: prompt uses gentle/soft/dreamy/subtle motion verbs without anchoring them to specific body parts. Kling tends to render "gentle sway" as nearly motionless. Required: every action beat must name a specific body part with the verb in CAPS (examples: "Papa's right FIST KNOCKS", "cheeks SWELL", "chest EXPANDS", "hips SWAY left-then-right", "right LEG STEPS forward").

(2) AMBIGUOUS ACTION: a character is named in the scene but the prompt doesn't specify what body part of theirs is moving. Either delete the mention or add a specific body-part-locked verb beat for them.

(3) DUPLICATE-CHARACTER RISK: any motion-toward verbs (walks toward, approaches, runs to, heads to) without a static-placement counter, OR any generic group nouns (the family, the kids, everyone, the people) — these are known triggers per memory.

(4) HORROR TONE for kid show: any words like fangs, sharp teeth, scary, predatory, growl, snarl, blood, gore, real wolf snout, dark shadows, threatening — these don't belong in a Pixar-style kid show.

(5) ANATOMY AMBIGUITY: any beat where a character's hands/arms aren't explicitly anchored. Per template, every character should have hand position locked at all times ("Sara's both hands grip the window frame").

(6) SISTER VISUAL COLLISION: when both Sara AND Eva are in the same shot, the prompt MUST explicitly distinguish them — Sara has ponytail with bow, Eva has curly blonde with rainbow bow. If only generic "two girls" is used, Kling may render them as identical twins.

(7) NEGATIVE PROMPT GAPS: if the action is Papa-active or kids-active, the negative prompt MUST include passive-state bans (papa standing still, papa motionless, papa observing without acting, kids frozen, etc).

If the prompt is fine, reply with EXACTLY:
PASS

Otherwise reply with:
FAIL
1. <specific issue>: <suggested exact substitution>
2. ...

Be terse. Only flag real problems.`;

async function callGemini(apiKey, payload) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

const userMsg = `=== PROMPT ===
${prompt}

${negativePrompt ? `=== NEGATIVE PROMPT ===
${negativePrompt}` : ""}`;

const payload = {
  contents: [
    { role: "user", parts: [{ text: REVIEWER + "\n\n" + userMsg }] },
  ],
  generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
};

let res = null, lastErr = null;
for (const k of KEYS) {
  try { res = await callGemini(k, payload); break; }
  catch (e) { lastErr = e; }
}
if (!res) { console.error(`All keys failed: ${lastErr?.message}`); process.exit(2); }

const text = (res.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
console.log(text);
const verdict = text.split("\n")[0].trim().toUpperCase();
process.exit(verdict.startsWith("PASS") ? 0 : 1);
