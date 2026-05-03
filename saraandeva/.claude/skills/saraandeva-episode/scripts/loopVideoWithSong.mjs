#!/usr/bin/env node
/**
 * Merge a (short) dance video looped to fill a target duration with a song
 * (trimmed if longer than the duration).
 *
 *   video → looped infinitely on input, capped by -t
 *   audio → trimmed to duration if longer; if shorter, output ends with silence
 *
 * Source video's own audio track is dropped — only the provided song is used.
 *
 * Usage:
 *   node loopVideoWithSong.mjs <video> <audio> <output> [--duration=60] [--audio-start=0]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const positional = argv.filter(a => !a.startsWith("--"));
const flags = Object.fromEntries(
  argv.filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);

const [videoArg, audioArg, outputArg] = positional;
const duration = Number(flags.duration ?? 60);
const audioStart = Number(flags["audio-start"] ?? 0);

if (!videoArg || !audioArg || !outputArg) {
  console.error("Usage: node loopVideoWithSong.mjs <video> <audio> <output> [--duration=60] [--audio-start=0]");
  process.exit(1);
}

const video = path.resolve(videoArg);
const audio = path.resolve(audioArg);
const output = path.resolve(outputArg);

for (const p of [video, audio]) {
  if (!fs.existsSync(p)) {
    console.error(`❌ Not found: ${p}`);
    process.exit(1);
  }
}
if (!Number.isFinite(duration) || duration <= 0) {
  console.error(`❌ Invalid --duration: ${flags.duration}`);
  process.exit(1);
}

const args = [
  "-y", "-loglevel", "error", "-stats",
  "-stream_loop", "-1", "-i", video,
  ...(audioStart > 0 ? ["-ss", String(audioStart)] : []),
  "-i", audio,
  "-t", String(duration),
  "-map", "0:v:0", "-map", "1:a:0",
  "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k",
  "-movflags", "+faststart",
  output,
];

console.log(`🎬 video:    ${video}`);
console.log(`🎵 audio:    ${audio}`);
console.log(`⏱  duration: ${duration}s`);
console.log(`💾 output:   ${output}`);

const ff = spawnSync("ffmpeg", args, { stdio: "inherit" });
if (ff.status !== 0) {
  console.error(`\n❌ ffmpeg exited ${ff.status}`);
  process.exit(ff.status ?? 1);
}
console.log(`\n✅ ${output}`);
