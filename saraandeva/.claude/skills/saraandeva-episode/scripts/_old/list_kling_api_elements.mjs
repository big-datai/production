#!/usr/bin/env node
/**
 * List ALL existing Kling API-account elements (paginated).
 * Output: a table of element_name → element_id + a summary of what needs creating for ep15.
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

function b64url(b) { return Buffer.from(b).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function jwt() {
  const now = Math.floor(Date.now()/1000);
  const h = b64url(JSON.stringify({alg:"HS256",typ:"JWT"}));
  const p = b64url(JSON.stringify({iss:ACCESS,exp:now+1800,nbf:now-5}));
  const s = b64url(createHmac("sha256",SECRET).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}

const base = "https://api-singapore.klingai.com";
const all = [];
let pageNum = 1;
while (true) {
  const url = `${base}/v1/general/advanced-custom-elements?pageNum=${pageNum}&pageSize=50`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${jwt()}` } });
  const json = await r.json();
  if (json.code !== 0) {
    console.error("API error:", json.code, json.message);
    process.exit(1);
  }
  const tasks = json.data || [];
  if (tasks.length === 0) break;
  all.push(...tasks);
  if (tasks.length < 50) break;
  pageNum++;
}

console.log(`\nTotal element-creation tasks in account: ${all.length}\n`);

const elements = [];
for (const task of all) {
  const els = task.task_result?.elements || [];
  for (const e of els) {
    elements.push({
      element_id: e.element_id,
      element_name: e.element_name,
      element_description: e.element_description?.slice(0, 80) || "",
      element_type: e.element_type,
      task_id: task.task_id,
      task_status: task.task_status,
      external_task_id: task.task_info?.external_task_id || "",
      created_at: new Date(task.created_at).toISOString().slice(0, 19),
    });
  }
}
console.log(`Total elements: ${elements.length}\n`);
console.log("name".padEnd(40) + "id".padEnd(20) + "type".padEnd(20) + "desc");
console.log("-".repeat(120));
for (const e of elements) {
  console.log(
    String(e.element_name||"").padEnd(40).slice(0,40) +
    String(e.element_id||"").padEnd(20) +
    String(e.element_type||"").padEnd(20) +
    String(e.element_description||"").slice(0, 60)
  );
}

// Compare against ep15 needs
const ep15Needs = [
  "Sara", "Eva", "Papa", "Mama", "Joe", "Ginger", "Isabel", "Leo", "Lisa", "Mrs. Patel",
  "ep15-house1-witch-cauldron", "ep15-house2-pirate-ship", "ep15-house3-skeleton-lawn",
  "ep15-house4-isabel-cottage", "ep15-house5-candy-house",
  "front_house_fall", "front_fence_sidewalk",
  "ep15-clip13-group-still", "ep15-clip17-group-still"
];

console.log("\n\n=== ep15 element coverage ===");
const have = new Set(elements.map(e => e.element_name?.toLowerCase()));
for (const need of ep15Needs) {
  const hasIt = have.has(need.toLowerCase());
  console.log(`${hasIt ? "✓" : "✗"} ${need}`);
}
