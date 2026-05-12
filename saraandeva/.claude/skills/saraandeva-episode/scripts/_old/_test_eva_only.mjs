#!/usr/bin/env node
/**
 * MINIMAL TEST: Eva-only, 3 seconds, simple prompt.
 * Goal: see if a single-character omni-video locks identity tightly.
 * If Eva renders on-model alone → multi-char crowding is the problem.
 * If Eva still drifts alone → element ref binding is fundamentally weak.
 */
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const env = readFileSync("/Volumes/Samsung500/goreadling-production/.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_]+)=["']?([^"']+)["']?$/); if (m) process.env[m[1]] = m[2]; }
const A = process.env.KLING_ACCESS_KEY, S = process.env.KLING_SECRET_KEY;
const b64 = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function jwt() {
  const n = Math.floor(Date.now()/1000);
  const h = b64(JSON.stringify({alg:"HS256",typ:"JWT"}));
  const p = b64(JSON.stringify({iss:A,exp:n+1800,nbf:n-5}));
  const s = b64(createHmac("sha256",S).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}

const BUCKET = "https://storage.googleapis.com/saraandeva-kling-elements/ep15";

const body = {
  model_name: "kling-v3-omni",
  mode: "std",
  aspect_ratio: "16:9",
  duration: 5,  // 5s minimum supported
  external_task_id: `ep15-eva-only-test-${Date.now()}`,

  elements: [
    {
      frontal_image_url: `${BUCKET}/Eva.png`,
      reference_image_urls: [
        `${BUCKET}/eva_3q.png`,
        `${BUCKET}/eva_profile.png`,
        `${BUCKET}/Eva_Halloween_Pumpkin.png`,
      ],
    },
  ],

  prompt: `Static medium close-up. @Element1 is a 3-year-old toddler with FAIR PORCELAIN SKIN and voluminous CURLY BRIGHT-BLONDE hair (NOT brown, NOT olive skin), brown eyes. She is wearing an orange pumpkin onesie with a smiling jack-o-lantern face on the tummy and a green stem-hat, holding a small orange candy bucket. She stands on a leaf-strewn front lawn at warm dusk, smiles at the camera, then waves with her free hand for one beat. Lighting: warm golden-hour. Style: Pixar 3D feature-render, cinematic kid-show. NOT scary.`,

  negative_prompt: "duplicate character, twin, ghost figure, brown skin, olive skin, dark skin, brunette hair, dark hair, generic toddler, off-model, motion blur, scary",

  cfg_scale: 0.5,
};

console.log("📤 Submitting EVA-ONLY 5s test...");
console.log(`   1 element, no image_urls, simple prompt (${body.prompt.length} chars)`);
console.log(`   Refs sent: ${body.elements[0].reference_image_urls.length + 1} (front + 3q + profile + costume)`);

const r = await fetch("https://api-singapore.klingai.com/v1/videos/omni-video", {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await r.text();
let json = null; try { json = JSON.parse(text); } catch {}
console.log(`status=${r.status} code=${json?.code} msg=${json?.message}`);
if (json?.code !== 0) { console.log(text.slice(0, 500)); process.exit(1); }

const taskId = json.data?.task_id;
console.log(`✅ task_id=${taskId}\n`);
writeFileSync("/tmp/eva_test_taskid.txt", taskId);
console.log(`Submitted. Poll with: node -e 'fetch task ${taskId}' or wait for download script.`);
