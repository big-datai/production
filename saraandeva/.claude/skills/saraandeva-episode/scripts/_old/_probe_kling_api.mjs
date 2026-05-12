#!/usr/bin/env node
/** Probe several Kling API endpoints to find which work for our account. */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const envText = readFileSync("/Volumes/Samsung500/goreadling-production/.env.local", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=["']?([^"']+)["']?$/);
  if (m) process.env[m[1]] = m[2];
}
const ACCESS = process.env.KLING_ACCESS_KEY;
const SECRET = process.env.KLING_SECRET_KEY;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify({ iss: ACCESS, exp: now + 1800, nbf: now - 5 }));
  const s = b64url(createHmac("sha256", SECRET).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}
const token = jwt();

// Try multiple base URLs and paths
const probes = [
  // Base URLs to try
  ["https://api-singapore.klingai.com",  "/v1/videos/text2video?pageNum=1&pageSize=5"],
  ["https://api-singapore.klingai.com",  "/v1/videos/image2video?pageNum=1&pageSize=5"],
  ["https://api-singapore.klingai.com",  "/v1/videos/multi-image2video?pageNum=1&pageSize=5"],
  ["https://api-singapore.klingai.com",  "/v1/account/costs"],
  ["https://api-singapore.klingai.com",  "/v1/account/balance"],
  ["https://api-singapore.klingai.com",  "/v1/videos/effects?pageNum=1&pageSize=5"],
  ["https://api.klingai.com",            "/v1/videos/text2video?pageNum=1&pageSize=5"],
  ["https://api.klingai.com",            "/v1/account/costs"],
];

for (const [base, path] of probes) {
  try {
    const r = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
    const body = await r.text();
    const isJson = body.startsWith("{");
    const summary = isJson ? body.slice(0, 180).replace(/\n/g, " ") : `(non-JSON, ${body.length} bytes)`;
    console.log(`${r.status} ${base}${path}`);
    console.log(`     ${summary}`);
  } catch (e) {
    console.log(`ERR  ${base}${path}: ${e.message}`);
  }
}
