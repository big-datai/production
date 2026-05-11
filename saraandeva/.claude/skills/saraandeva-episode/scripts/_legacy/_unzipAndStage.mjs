#!/usr/bin/env node
/**
 * Unzip any clip_*_raw.zip in the staging dir, dedupe by Kling job ID,
 * extract a t=2s identifying frame for each unstaged clip, save them
 * to /tmp/audit-frames/ for review.
 *
 * Usage: node .../_unzipAndStage.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const STAGING = "/Volumes/Samsung500/goreadling-production/saraandeva/season_01/episode_01/clips";
const FRAMES = "/tmp/audit-frames";
fs.mkdirSync(FRAMES, { recursive: true });

const zips = fs.readdirSync(STAGING).filter(f => f.endsWith(".zip"));
console.log(`📦 Zips: ${zips.length}`);

const tmpExtract = "/tmp/kling-extract";
fs.rmSync(tmpExtract, { recursive: true, force: true });
fs.mkdirSync(tmpExtract);

for (const z of zips) {
  console.log(`  → unzip ${z}`);
  execSync(`unzip -o -q "${path.join(STAGING, z)}" -d "${tmpExtract}"`);
}

const seen = new Set();
for (const f of fs.readdirSync(tmpExtract)) {
  if (!f.endsWith(".mp4")) continue;
  const m = f.match(/_(\d{4})_\d/);
  const jobId = m?.[1];
  if (!jobId) continue;
  if (seen.has(jobId)) continue;
  seen.add(jobId);

  const src = path.join(tmpExtract, f);
  const dest = path.join(STAGING, `kling_job_${jobId}.mp4`);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
    console.log(`  + ${path.basename(dest)}  (${(fs.statSync(dest).size/1024/1024).toFixed(1)} MB)`);
  }
}

// Remove zips after extraction
for (const z of zips) fs.unlinkSync(path.join(STAGING, z));

// Extract identifying frames for any kling_job_*.mp4 not yet renamed to clip_NNX.mp4
const allMp4s = fs.readdirSync(STAGING).filter(f => f.startsWith("kling_job_") && f.endsWith(".mp4"));
console.log(`\n🎞 Extracting ID frames for ${allMp4s.length} unstaged clips`);
for (const f of allMp4s) {
  const id = f.match(/kling_job_(\d+)/)?.[1];
  const out = `${FRAMES}/job_${id}_t2.png`;
  if (fs.existsSync(out)) continue;
  try {
    execSync(`ffmpeg -hide_banner -loglevel error -y -ss 2 -i "${path.join(STAGING, f)}" -frames:v 1 -vf scale=320:-1 "${out}"`);
    console.log(`  → job_${id}_t2.png`);
  } catch (e) {
    console.log(`  ⚠ frame extract failed for ${f}`);
  }
}

console.log(`\n✓ Done. Stage clips: ls ${STAGING}`);
console.log(`✓ ID frames in ${FRAMES} — ready for visual ID + arc rename`);
