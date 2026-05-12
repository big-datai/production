#!/usr/bin/env node
/**
 * Gemini 2.5 Flash visual audit for an episode's rendered clips.
 *
 * For each <clips_dir>/*.mp4 (numeric/decimal filenames only), uploads the
 * file to Gemini Files API, asks gemini-2.5-flash to describe the video and
 * list visible defects, then writes a per-clip JSON report.
 *
 * Why this exists: the prompt-similarity downloader picks renders by score,
 * not visual quality. Score=200 takes can still ship ghost clones, Papa-
 * passive frames, or fox renders when the prompt mentioned "fox". This
 * script catches them BEFORE we declare the assembled episode ready.
 *
 * Per `lesson_claude_visual_audit_before_ready.md`.
 *
 * Usage:
 *   node auditClipsWithGemini.mjs <clips_dir> [--out <path>] [--concurrency N]
 *
 * Example:
 *   node auditClipsWithGemini.mjs season_01/episode_12/clips \
 *     --out /tmp/ep12_audit_report.json
 *
 * Exits 0 if no critical defects found, 1 if any critical defects.
 */
import fs from "node:fs";
import path from "node:path";

// .env.local lives at the goreadling-production root (one level above saraandeva)
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

function getKeys() {
  const keys = [];
  for (const name of ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
                      "GEMINI_API_KEY_4", "GEMINI_API_KEY_5", "GEMINI_API_KEY_6"]) {
    const v = process.env[name];
    if (v) keys.push(v.replace(/"/g, "").trim());
  }
  return keys;
}
const KEYS = getKeys();
if (!KEYS.length) { console.error("No GEMINI_API_KEY* in env"); process.exit(1); }

// --- args ---
const argv = process.argv.slice(2);
const positional = argv.filter(a => !a.startsWith("--") && argv[argv.indexOf(a) - 1]?.startsWith("--") !== true);
const clipsDir = path.resolve(positional[0] || "");
const argFlag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const outPath = argFlag("out") || `/tmp/audit_${path.basename(clipsDir)}.json`;
const concurrency = Number(argFlag("concurrency") ?? 3);

if (!clipsDir || !fs.existsSync(clipsDir)) {
  console.error("Usage: auditClipsWithGemini.mjs <clips_dir> [--out path] [--concurrency N]");
  process.exit(1);
}

// --- gather clips ---
const clipFiles = fs.readdirSync(clipsDir)
  .filter(f => /^\d+(\.\d+)?\.mp4$/.test(f))
  .map(f => ({ name: f, full: path.join(clipsDir, f), n: parseFloat(f) }))
  .sort((a, b) => a.n - b.n);

console.log(`Auditing ${clipFiles.length} clips from ${clipsDir}`);
console.log(`Output: ${outPath}\n`);

// --- Gemini Files API: upload via resumable protocol ---
async function uploadFile(filePath, apiKey) {
  const buf = fs.readFileSync(filePath);
  const mimeType = "video/mp4";
  const fname = path.basename(filePath);

  // Step 1: start resumable upload
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(buf.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: fname } }),
    }
  );
  if (!startRes.ok) throw new Error(`upload start ${startRes.status}: ${await startRes.text()}`);
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("upload start: no x-goog-upload-url");

  // Step 2: upload bytes + finalize
  const finRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(buf.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: buf,
  });
  if (!finRes.ok) throw new Error(`upload finalize ${finRes.status}: ${await finRes.text()}`);
  const meta = await finRes.json();
  const file = meta.file;

  // Step 3: poll until ACTIVE
  let attempts = 0;
  while (file.state !== "ACTIVE" && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000));
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${apiKey}`);
    if (r.ok) {
      const j = await r.json();
      Object.assign(file, j);
    }
    attempts++;
  }
  if (file.state !== "ACTIVE") throw new Error(`file did not become ACTIVE: ${file.state}`);
  return file;
}

async function deleteFile(fileName, apiKey) {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
                { method: "DELETE" });
  } catch (_) { /* best effort */ }
}

const AUDIT_PROMPT = `You are a video QA auditor for the "Sara and Eva" Pixar-style children's animated series.

Watch this video clip and produce a structured report. Be CONCISE and SPECIFIC.

Format your reply EXACTLY like this (no preamble):

DESCRIPTION: <2 sentences describing what happens in the clip>

VISIBLE_ANIMALS: <comma-list of any visible animals with species, or "NONE">

VISIBLE_HUMANS_COUNT: <number>
VISIBLE_HUMANS: <comma-list. Per character try to identify if recognizable: Mama (adult woman, often hat), Papa (adult man, beard), Sara (older girl, ponytail with bow), Eva (younger girl, curly blonde with rainbow bow), Joe (Costco employee, red apron), or "unknown_child"/"unknown_adult". Note distinct visual features.>

ACTIONS:
- <character>: <what they DO in the clip — verbs only, body parts moving, e.g. "Papa: walks forward, raises arm">

DEFECTS: (list any of these, or "NONE")
- ghost_or_duplicate_character: <which char appears duplicated or as a ghost figure>
- anatomy_error: <e.g. 3 arms, missing limbs, floating hand>
- character_passive: <character named in scene but not visibly moving for most of the clip>
- wrong_or_extra_character: <e.g. an animal that shouldn't be there, an unnamed person>
- prop_missing: <expected prop not visible>
- scene_mismatch: <wrong setting>
- horror_tone: <scary atmosphere unsuitable for kid show>
- visual_clone: <e.g. two sisters look identical and indistinguishable>
- other: <free description>

OVERALL: <one of: CLEAN | MINOR_ISSUES | CRITICAL_DEFECT>`;

async function auditOne(clip, apiKey) {
  const file = await uploadFile(clip.full, apiKey);
  const genRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { fileData: { mimeType: "video/mp4", fileUri: file.uri } },
            { text: AUDIT_PROMPT },
          ],
        }],
        generationConfig: { temperature: 0.1 },
      }),
    }
  );
  // best-effort cleanup regardless of generation result
  deleteFile(file.name, apiKey);

  if (!genRes.ok) throw new Error(`generate ${genRes.status}: ${await genRes.text()}`);
  const j = await genRes.json();
  const text = (j.candidates?.[0]?.content?.parts?.[0]?.text) || "";
  return text;
}

function parseReport(text) {
  const out = { description: "", animals: "NONE", humansCount: null, humans: "",
                actions: [], defects: [], overall: "UNKNOWN", raw: text };
  const m = (re) => (text.match(re) || [, ""])[1].trim();
  out.description = m(/DESCRIPTION:\s*(.+)/);
  out.animals = m(/VISIBLE_ANIMALS:\s*(.+)/) || "NONE";
  const hc = m(/VISIBLE_HUMANS_COUNT:\s*(\d+)/);
  out.humansCount = hc ? Number(hc) : null;
  out.humans = m(/VISIBLE_HUMANS:\s*(.+)/);
  // actions block
  const actRaw = (text.match(/ACTIONS:\s*([\s\S]*?)(?:DEFECTS:|OVERALL:|$)/) || [, ""])[1];
  out.actions = actRaw.split("\n").map(l => l.trim()).filter(l => l.startsWith("- "));
  // defects block
  const defRaw = (text.match(/DEFECTS:[^\n]*\n([\s\S]*?)(?:OVERALL:|$)/) || [, ""])[1];
  out.defects = defRaw.split("\n").map(l => l.trim()).filter(l => l.startsWith("- ") && !l.toLowerCase().endsWith(": none"));
  out.overall = m(/OVERALL:\s*(\w+)/) || "UNKNOWN";
  return out;
}

// --- run ---
const results = {};
let processed = 0;

async function processOne(clip) {
  const apiKey = KEYS[processed % KEYS.length];
  const t0 = Date.now();
  try {
    const text = await auditOne(clip, apiKey);
    const parsed = parseReport(text);
    results[clip.name] = { ...parsed, file: clip.name, durationMs: Date.now() - t0 };
    const flag = parsed.overall === "CLEAN" ? "✅" :
                 parsed.overall === "CRITICAL_DEFECT" ? "🔴" :
                 parsed.overall === "MINOR_ISSUES" ? "🟡" : "❓";
    const animalBlurb = (parsed.animals && parsed.animals !== "NONE") ? `  animals=[${parsed.animals}]` : "";
    console.log(`${flag} ${clip.name.padEnd(12)} ${parsed.humansCount ?? "?"}p ${parsed.overall.padEnd(16)} ${parsed.description.slice(0, 80)}${animalBlurb}`);
    if (parsed.defects.length) {
      for (const d of parsed.defects) console.log(`     ${d}`);
    }
  } catch (e) {
    results[clip.name] = { error: e.message, file: clip.name };
    console.log(`❌ ${clip.name.padEnd(12)} error: ${e.message.slice(0, 80)}`);
  }
  processed++;
}

// concurrency-limited execution
async function runWithLimit(items, fn, limit) {
  const queue = [...items];
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item) await fn(item);
    }
  });
  await Promise.all(workers);
}

await runWithLimit(clipFiles, processOne, concurrency);

// --- summary ---
const flagged = {
  fox: [], critical: [], minor: [], errors: [],
};
for (const [name, r] of Object.entries(results)) {
  if (r.error) flagged.errors.push(name);
  else {
    if (r.animals && /fox/i.test(r.animals)) flagged.fox.push(name);
    if (r.overall === "CRITICAL_DEFECT") flagged.critical.push(name);
    if (r.overall === "MINOR_ISSUES") flagged.minor.push(name);
  }
}

const report = {
  clipsDir,
  generatedAt: new Date().toISOString(),
  clipCount: clipFiles.length,
  flagged,
  results,
};
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(`\n=== Summary ===`);
console.log(`Total clips: ${clipFiles.length}`);
console.log(`🔴 critical: ${flagged.critical.length}  ${flagged.critical.join(", ")}`);
console.log(`🟡 minor:    ${flagged.minor.length}  ${flagged.minor.join(", ")}`);
console.log(`🦊 fox-flag: ${flagged.fox.length}  ${flagged.fox.join(", ")}`);
console.log(`❌ errors:   ${flagged.errors.length}  ${flagged.errors.join(", ")}`);
console.log(`\nFull report → ${outPath}`);

// exit non-zero only on critical defects (informational; CI may want this)
process.exit(flagged.critical.length > 0 ? 1 : 0);
