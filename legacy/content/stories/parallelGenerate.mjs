#!/usr/bin/env node
/**
 * Run podcast generation with 5 workers, each processing ONE story at a time.
 * Each worker has its own dedicated API key. When a story finishes, the worker
 * picks the next story from the queue.
 *
 * Usage: node scripts/parallelGenerate.mjs [startStory] [endStory]
 *   Default: stories 8-18
 */
import { execFile } from "node:child_process";
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean);

console.log(`🔑 ${API_KEYS.length} API keys available`);

const startStory = Number(process.argv[2]) || 8;
const endStory   = Number(process.argv[3]) || 18;

// Build work queue: each item is a single story number
const queue = [];
for (let i = startStory; i <= endStory; i++) queue.push(i);
console.log(`📋 Queue: stories ${queue.join(", ")} (${queue.length} total)`);
console.log(`👷 Workers: ${Math.min(API_KEYS.length, queue.length)}\n`);

const results = [];

function runStory(storyNum, workerIdx) {
  return new Promise((resolve) => {
    const key = API_KEYS[workerIdx];
    console.log(`🚀 Worker ${workerIdx + 1} → Story ${storyNum}`);

    const env = {
      ...process.env,
      GEMINI_API_KEY: key,
      GEMINI_API_KEY_2: key,
      GEMINI_API_KEY_3: key,
      GEMINI_API_KEY_4: key,
      GEMINI_API_KEY_5: key,
      VITE_GEMINI_API_KEY: key,
    };

    const child = execFile(
      "node",
      ["content/podcast/generatePodcast.mjs", String(storyNum)],
      { env, cwd: process.cwd(), maxBuffer: 50 * 1024 * 1024 },
      (error) => {
        if (error) {
          console.error(`❌ Worker ${workerIdx + 1} Story ${storyNum} FAILED: ${error.message}`);
          resolve({ story: storyNum, ok: false, error: error.message });
        } else {
          console.log(`✅ Worker ${workerIdx + 1} Story ${storyNum} DONE`);
          resolve({ story: storyNum, ok: true });
        }
      }
    );

    child.stdout.on("data", (data) => {
      data.toString().split("\n").forEach((line) => {
        if (line.trim()) console.log(`[W${workerIdx + 1}·S${storyNum}] ${line}`);
      });
    });
    child.stderr.on("data", (data) => {
      data.toString().split("\n").forEach((line) => {
        if (line.trim()) console.error(`[W${workerIdx + 1}·S${storyNum}] ${line}`);
      });
    });
  });
}

console.log("\n════════════════════════════════════════════");
console.log("🎙️  PARALLEL PODCAST GENERATION — 1 story per worker");
console.log("════════════════════════════════════════════\n");

const startTime = Date.now();
let queueIdx = 0;

async function worker(workerIdx) {
  while (true) {
    const storyNum = queue[queueIdx];
    if (storyNum === undefined) break; // queue empty
    queueIdx++;
    const result = await runStory(storyNum, workerIdx);
    results.push(result);
  }
}

const numWorkers = Math.min(API_KEYS.length, queue.length);
Promise.all(
  Array.from({ length: numWorkers }, (_, i) => worker(i))
).then(() => {
  const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log("\n════════════════════════════════════════════");
  console.log("📊 RESULTS");
  console.log("════════════════════════════════════════════");
  results.sort((a, b) => a.story - b.story).forEach((r) => {
    console.log(`  Story ${r.story}: ${r.ok ? "✅" : "❌ " + r.error}`);
  });
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n  ${ok}/${results.length} succeeded`);
  console.log(`⏱️  Total time: ${elapsed} minutes`);
  console.log("════════════════════════════════════════════\n");
});

