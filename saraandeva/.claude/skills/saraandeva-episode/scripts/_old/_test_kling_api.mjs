#!/usr/bin/env node
/**
 * Smoke-test the Kling API:
 * 1. Confirm AK/SK JWT auth works
 * 2. List recent omni-mode tasks
 * 3. Verify UI-submitted tasks ARE visible to the API key
 *    (critical — if not, hybrid approach is broken)
 */
import { createHmac, createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Load env from .env.local
const envText = readFileSync("/Volumes/Samsung500/goreadling-production/.env.local", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=["']?([^"']+)["']?$/);
  if (m) process.env[m[1]] = m[2];
}

const ACCESS = process.env.KLING_ACCESS_KEY;
const SECRET = process.env.KLING_SECRET_KEY;
if (!ACCESS || !SECRET) {
  console.error("missing KLING_ACCESS_KEY or KLING_SECRET_KEY in .env.local");
  process.exit(1);
}

// Build JWT manually (no deps)
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const now = Math.floor(Date.now() / 1000);
const header  = { alg: "HS256", typ: "JWT" };
const payload = { iss: ACCESS, exp: now + 1800, nbf: now - 5 };
const headB64 = b64url(JSON.stringify(header));
const payB64  = b64url(JSON.stringify(payload));
const sig     = b64url(createHmac("sha256", SECRET).update(`${headB64}.${payB64}`).digest());
const token   = `${headB64}.${payB64}.${sig}`;

console.log("JWT generated (first 60 chars):", token.slice(0, 60) + "...");

// Test 1: list recent omni tasks
const url = "https://api-singapore.klingai.com/v1/videos/omni?pageNum=1&pageSize=10";
console.log("\nGET", url);
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` },
});
console.log("Status:", res.status);
const body = await res.text();
let json;
try { json = JSON.parse(body); } catch { console.log("Body:", body.slice(0, 500)); process.exit(1); }

console.log("API code:", json.code, "message:", json.message);

if (json.code !== 0) {
  console.log("Full response:", JSON.stringify(json, null, 2).slice(0, 1000));
  process.exit(1);
}

const tasks = json.data || [];
console.log(`\n✓ ${tasks.length} omni task(s) returned\n`);

for (const t of tasks.slice(0, 8)) {
  const created = new Date(t.created_at).toISOString().slice(0, 19);
  const status = (t.task_status || "").padEnd(10);
  const prompt = (t.task_info?.parameter?.prompt || "").slice(0, 60).replace(/\n/g, " ");
  const id = t.task_id || "";
  const ext = t.external_task_id ? ` ext=${t.external_task_id}` : "";
  console.log(`  ${created} ${status} ${id}${ext}`);
  console.log(`    "${prompt}..."`);
}

console.log("\n=== Verdict ===");
if (tasks.length === 0) {
  console.log("⚠ No tasks returned. Either no omni tasks have been submitted, or the API account is empty.");
  console.log("  If you DID submit via UI recently, this means UI tasks are NOT visible to the API — hybrid broken.");
} else {
  console.log("✓ API can see tasks. Hybrid approach viable for download/list.");
  console.log("  (UI-submitted tasks should appear here if account is shared.)");
}
