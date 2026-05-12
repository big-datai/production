// Test multi-shot Omni — 2 shots, 3s each = 6s total. Ginger running on beach + camera reverses.
import fs from "node:fs";
import { createHmac } from "node:crypto";

for (const line of fs.readFileSync("/Volumes/Samsung500/goreadling-production/.env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z_0-9]*)=["']?(.+?)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const AK = process.env.KLING_ACCESS_KEY, SK = process.env.KLING_SECRET_KEY;
const BASE = "https://api-singapore.klingai.com";
const b64 = b => Buffer.from(b).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
function tok() {
  const n = Math.floor(Date.now()/1000);
  const h = b64(JSON.stringify({alg:"HS256",typ:"JWT"}));
  const p = b64(JSON.stringify({iss:AK,exp:n+1800,nbf:n-5}));
  const s = b64(createHmac("sha256",SK).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}
async function http(m,p,body=null){const r=await fetch(`${BASE}${p}`,{method:m,headers:{Authorization:`Bearer ${tok()}`,"Content-Type":"application/json"},body:body?JSON.stringify(body):null});const t=await r.text();try{return{status:r.status,body:JSON.parse(t)}}catch{return{status:r.status,body:{raw:t}}}}

const REG = JSON.parse(fs.readFileSync("/Volumes/Samsung500/goreadling-production/saraandeva/content/elements_registry.json","utf8"));
const SARA = REG.ep15_Sara, EVA = REG.ep15_Eva, GINGER = REG.ep15_Ginger;

const payload = {
  model_name: "kling-v3-omni",
  multi_shot: true,
  shot_type: "customize",
  prompt: "",  // invalid when multi_shot=true
  multi_prompt: [
    {
      index: 1,
      duration: "3",
      prompt: "Sunny sandy beach, surf rolling in the background. <<<element_3>>> Ginger the small white-and-tan Jack Russell runs forward TOWARD the camera, ears flapping, paws kicking up sand, tongue out happily. <<<element_1>>> Sara and <<<element_2>>> Eva run a few steps behind her, both laughing, arms reaching forward playfully. Camera at low ground angle facing the dog directly — we see her face and the kids chasing behind her."
    },
    {
      index: 2,
      duration: "3",
      prompt: "Camera reverses to a tracking shot from BEHIND. <<<element_3>>> Ginger continues running forward AWAY from camera, tail wagging, ears bouncing. <<<element_1>>> Sara and <<<element_2>>> Eva run after her, backs to camera, hair flying, arms pumping. Sandy beach stretches ahead, surf in distance. Same sunny daylight."
    }
  ],
  image_list: [
    { image_url: "https://storage.googleapis.com/saraandeva-kling-elements/scenes/beach_shore.png" }
  ],
  element_list: [
    { element_id: SARA },
    { element_id: EVA },
    { element_id: GINGER }
  ],
  duration: "6",  // sum of shots
  mode: "std",
  aspect_ratio: "16:9",
  external_task_id: "test-multi-shot-ginger-beach-1"
};

console.log("=== POST /v1/videos/omni-video (multi_shot=true, 2 shots × 3s) ===");
console.log(`  elements: Sara=${SARA}, Eva=${EVA}, Ginger=${GINGER}`);
const submit = await http("POST", "/v1/videos/omni-video", payload);
console.log(`  HTTP ${submit.status}  code=${submit.body.code}  msg=${submit.body.message}`);
if (submit.body.code !== 0) { console.error(JSON.stringify(submit.body, null, 2)); process.exit(1); }
const taskId = submit.body.data.task_id;
console.log(`  task_id=${taskId}\n=== Polling (20 min cap, but multi_prompt has been observed to hang per memory) ===`);

const deadline = Date.now() + 20 * 60_000;
let last = null;
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 8_000));
  const poll = await http("GET", `/v1/videos/omni-video/${taskId}`);
  const d = poll.body.data || {};
  const s = d.task_status;
  const elapsed = Math.round((20*60_000 - (deadline - Date.now()))/1_000);
  if (s !== last) { console.log(`  [${String(elapsed).padStart(3)}s] status=${s} ${d.task_status_msg||""}`); last = s; }
  if (s === "succeed") {
    const v = ((d.task_result||{}).videos||[])[0];
    console.log(`\n✓ SUCCESS dur=${v.duration}s deduction=${d.final_unit_deduction}u`);
    console.log(`  url=${v.url}`);
    const r = await fetch(v.url);
    const buf = Buffer.from(await r.arrayBuffer());
    const out = "/tmp/test_multi_shot_ginger.mp4";
    fs.writeFileSync(out, buf);
    console.log(`  saved → ${out} (${(buf.length/1024).toFixed(1)} KB)`);
    process.exit(0);
  }
  if (s === "failed") {
    console.error(`!! failed: ${JSON.stringify(d, null, 2)}`);
    process.exit(1);
  }
}
console.error("!! 20 min timeout — multi_prompt hang per memory");
process.exit(1);
