#!/usr/bin/env node
// Rename `clip_<N>.mp4` → `<N>.mp4` (and `clip_<N>_v<M>.mp4` → `<N>.mp4`,
// keeping the highest version) so assembleEpisode.mjs's `^\d+(\.\d+)?\.mp4$`
// regex picks them up. Per user preference (integer-only filenames per ep13).
//
// Usage:
//   node normalizeClipFilenames.mjs <clips_dir>
//
// Backs up displaced files to .gitkept_orig/ before overwriting.
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] || "");
if (!dir || !fs.existsSync(dir)) {
  console.error("Usage: normalizeClipFilenames.mjs <clips_dir>");
  process.exit(1);
}

const files = fs.readdirSync(dir);
// Group all clip_<N>[_vM].mp4 files by clip number
const groups = {};
for (const f of files) {
  const m = f.match(/^clip_(\d+(?:\.\d+)?)(?:_v(\d+))?\.mp4$/);
  if (!m) continue;
  const n = m[1];
  const v = m[2] ? Number(m[2]) : 0;
  if (!groups[n]) groups[n] = [];
  groups[n].push({ name: f, version: v });
}

const backupDir = path.join(dir, ".originals");
fs.mkdirSync(backupDir, { recursive: true });

let renamed = 0;
for (const [n, list] of Object.entries(groups)) {
  // Pick highest version
  list.sort((a, b) => b.version - a.version);
  const winner = list[0];
  const target = path.join(dir, `${n}.mp4`);

  // Backup any existing target
  if (fs.existsSync(target)) {
    fs.renameSync(target, path.join(backupDir, `${n}.mp4.was`));
  }
  fs.renameSync(path.join(dir, winner.name), target);
  console.log(`  ${winner.name}  →  ${n}.mp4`);
  renamed++;

  // Move non-winning versions to backup
  for (const loser of list.slice(1)) {
    fs.renameSync(path.join(dir, loser.name), path.join(backupDir, loser.name));
    console.log(`    (archived ${loser.name})`);
  }
}

console.log(`\n${renamed} clip(s) normalized. Backups in ${path.relative(dir, backupDir)}/`);
