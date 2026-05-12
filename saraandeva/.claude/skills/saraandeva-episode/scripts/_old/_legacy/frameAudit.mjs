#!/usr/bin/env node
/**
 * Frame-audit a directory of Kling MP4 clips and produce per-clip sidecar JSONs.
 *
 * Why this exists (Ep 2 lesson):
 *   Judging clips from 3 sample frames missed Ginger appearances, caused us
 *   to drop good clips and keep bad ones. Now every clip gets a 5-frame strip
 *   + a sidecar JSON capturing the audit decision permanently. Future episodes
 *   can never accidentally re-include a "reject" clip — assembleEpisode.mjs
 *   only reads sidecars with status="keep".
 *
 * Sidecar schema (kling_job_NNN.json next to each MP4):
 *   {
 *     "klingId": 525,
 *     "status": "keep" | "reject" | "review-needed",
 *     "mappedTo": "clip_03h" | null,
 *     "spec": "Joe sniffs a tasty crumb",
 *     "rendered": "Sara+Eva on bunk bed with Pomeranian Joe — looks like stuffed doll",
 *     "rejectReason": "doll-not-ginger-fake-resolution" | null,
 *     "reviewedBy": "dave",
 *     "reviewedAt": "2026-04-27T15:45:00",
 *     "usedIn": ["ep02_v3"]
 *   }
 *
 * Usage:
 *   node frameAudit.mjs <clips_dir> [--strip-only]   # build 5-frame strips + open contact sheet
 *   node frameAudit.mjs <clips_dir> --interactive    # walk through each clip with prompts
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { execSync, spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const dir = path.resolve(argv.find(a => !a.startsWith("--")) || ".");
const stripOnly = argv.includes("--strip-only");
const interactive = argv.includes("--interactive");

if (!fs.existsSync(dir)) {
  console.error(`❌ Directory not found: ${dir}`);
  process.exit(1);
}

const clips = fs.readdirSync(dir)
  .filter(f => /^kling_job_\d+\.mp4$/.test(f))
  .map(f => ({
    file: path.join(dir, f),
    id: f.match(/^kling_job_(\d+)\.mp4$/)[1],
    sidecar: path.join(dir, f.replace(".mp4", ".json")),
  }));

console.log(`📂 ${dir}`);
console.log(`🎬 Found ${clips.length} clips`);

// 1. Generate per-clip 5-frame strip (0.5, 1.5, 2.5, 3.5, 4.5 seconds)
const stripDir = path.join(dir, "_strips");
fs.mkdirSync(stripDir, { recursive: true });

for (const c of clips) {
  const stripPath = path.join(stripDir, `${c.id}.jpg`);
  if (fs.existsSync(stripPath)) continue;
  const tmps = [];
  for (const sec of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    const t = path.join(stripDir, `_${c.id}_${sec}.jpg`);
    execSync(`ffmpeg -y -loglevel error -ss ${sec} -i "${c.file}" -frames:v 1 -vf "scale=350:-1" "${t}"`);
    tmps.push(t);
  }
  // hstack the 5 frames + drawtext id label via separate filter
  const inputs = tmps.map(t => `-i "${t}"`).join(" ");
  execSync(`ffmpeg -y -loglevel error ${inputs} -filter_complex "[0:v][1:v][2:v][3:v][4:v]hstack=inputs=5[out]" -map "[out]" -frames:v 1 "${stripPath}"`);
  for (const t of tmps) fs.unlinkSync(t);
}
console.log(`📸 ${clips.length} strips → ${stripDir}/`);

// 2. Build a single contact sheet of all strips
const sheetPath = path.join(dir, "_contact_sheet.jpg");
const stripFiles = clips.map(c => path.join(stripDir, `${c.id}.jpg`));
const stripInputs = stripFiles.map(f => `-i "${f}"`).join(" ");
const vstackChain = stripFiles.map((_, i) => `[${i}:v]`).join("") + `vstack=inputs=${stripFiles.length}[out]`;
execSync(`ffmpeg -y -loglevel error ${stripInputs} -filter_complex "${vstackChain}" -map "[out]" -frames:v 1 "${sheetPath}"`);
console.log(`🖼  Contact sheet → ${sheetPath}`);

if (!interactive) {
  console.log(`\nNext: open the contact sheet, decide keep/reject per clip, then run with --interactive`);
  console.log(`  open "${sheetPath}"`);
  process.exit(0);
}

// 3. Interactive walkthrough
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

console.log(`\n🎯 Interactive audit — ${clips.length} clips. q to abort.`);
for (const c of clips) {
  // Open the strip in Preview (macOS)
  spawnSync("open", [path.join(stripDir, `${c.id}.jpg`)]);

  const existing = fs.existsSync(c.sidecar) ? JSON.parse(fs.readFileSync(c.sidecar, "utf8")) : null;
  if (existing) {
    console.log(`\n${c.id} — existing: ${existing.status}, mapped=${existing.mappedTo}, ${existing.rendered?.slice(0,60)}`);
    const skip = await ask("  press <enter> to skip, 'r' to re-review: ");
    if (!skip.toLowerCase().startsWith("r")) continue;
  }

  console.log(`\n--- clip kling_job_${c.id}.mp4 ---`);
  const status = (await ask("  status [k]eep / [r]eject / [?]review-needed / [q]uit: ")).trim().toLowerCase();
  if (status === "q") break;
  const statusMap = { k: "keep", r: "reject", "?": "review-needed" };
  const s = statusMap[status] || "review-needed";

  const mappedTo = (await ask("  mappedTo (e.g. clip_03h, blank if none): ")).trim() || null;
  const rendered = (await ask("  rendered description (1 line): ")).trim();
  const rejectReason = s === "reject" ? (await ask("  rejectReason: ")).trim() : null;

  const sidecar = {
    klingId: Number(c.id),
    status: s,
    mappedTo,
    rendered,
    rejectReason,
    reviewedBy: process.env.USER || "unknown",
    reviewedAt: new Date().toISOString(),
    usedIn: existing?.usedIn || [],
  };
  fs.writeFileSync(c.sidecar, JSON.stringify(sidecar, null, 2));
  console.log(`  ✓ saved ${path.basename(c.sidecar)}`);
}
rl.close();
console.log(`\n✅ Audit complete. Sidecars in ${dir}/kling_job_*.json`);
