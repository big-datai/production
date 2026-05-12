#!/usr/bin/env node
/**
 * Probe /v1/general/advanced-custom-elements to verify the API schema
 * for element CRUD before committing to the full ep15 API pipeline.
 *
 * Tests:
 *  1. GET .../advanced-custom-elements?pageNum=1&pageSize=5 — list existing elements
 *  2. GET .../advanced-custom-elements (no params)
 *  3. Try alternate paths if (1) and (2) 404
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const envText = readFileSync("/Volumes/Samsung500/goreadling-production/.env.local", "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=["']?([^"']+)["']?$/);
  if (m) process.env[m[1]] = m[2];
}
const ACCESS = process.env.KLING_ACCESS_KEY;
const SECRET = process.env.KLING_SECRET_KEY;
if (!ACCESS || !SECRET) {
  console.error("missing KLING_ACCESS_KEY or KLING_SECRET_KEY");
  process.exit(1);
}

function b64url(b) { return Buffer.from(b).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function jwt() {
  const now = Math.floor(Date.now()/1000);
  const h = b64url(JSON.stringify({alg:"HS256",typ:"JWT"}));
  const p = b64url(JSON.stringify({iss:ACCESS,exp:now+1800,nbf:now-5}));
  const s = b64url(createHmac("sha256",SECRET).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}
const token = jwt();

const base = "https://api-singapore.klingai.com";
const probes = [
  // Element CRUD candidates
  "/v1/general/advanced-custom-elements?pageNum=1&pageSize=5",
  "/v1/general/advanced-custom-elements",
  "/v1/elements/advanced-custom?pageNum=1&pageSize=5",
  "/v1/general/custom-elements?pageNum=1&pageSize=5",
  "/v1/custom-elements?pageNum=1&pageSize=5",
  // Omni-video endpoint
  "/v1/videos/omni-video?pageNum=1&pageSize=3",
  "/v1/videos/omni?pageNum=1&pageSize=3",
];

console.log(`Probing Kling API endpoints (token=${token.slice(0,20)}...)\n`);

for (const path of probes) {
  try {
    const r = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
    const body = await r.text();
    const isJson = body.startsWith("{") || body.startsWith("[");
    let parsed = null;
    if (isJson) { try { parsed = JSON.parse(body); } catch {} }
    const summary = parsed
      ? `code=${parsed.code} msg="${(parsed.message||"").slice(0,80)}" data_keys=[${Object.keys(parsed.data||{}).join(",")}]`
      : `non-JSON ${body.length}b "${body.slice(0,100)}"`;
    console.log(`${r.status} ${path}`);
    console.log(`     ${summary}`);
    if (parsed?.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
      console.log(`     first item keys: ${Object.keys(parsed.data[0]).join(", ")}`);
      console.log(`     first item sample: ${JSON.stringify(parsed.data[0]).slice(0, 300)}`);
    }
  } catch (e) {
    console.log(`ERR  ${path}: ${e.message}`);
  }
  console.log("");
}
