#!/usr/bin/env node
/**
 * TEST: submit clip 1 with the CORRECTED Kling Omni API schema:
 *   - inline `elements` array (each: frontal_image_url + reference_image_urls)
 *   - prompt uses @Element1, @Element2, @Element3, @Element4, @Element5 (by index)
 *   - single-shot prompt (multi_prompt is for ep15-resubmit batch later)
 *   - aspect_ratio 16:9, duration 10
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

const BUCKET = "https://storage.googleapis.com/saraandeva-kling-elements/ep15";

// Clip 1: costume reveal in living room
// 5 elements bound (Sara, Eva, Mama, Joe, Ginger), each with 3-angle refs
const body = {
  model_name: "kling-v3-omni",
  mode: "std",
  aspect_ratio: "16:9",
  duration: 10,
  external_task_id: `ep15-clip1-test-${Date.now()}`,

  elements: [
    // @Element1 — Sara (canonical avatar, will wear princess costume per prompt)
    {
      frontal_image_url: `${BUCKET}/Sara.png`,
      reference_image_urls: [`${BUCKET}/sara_3q.png`, `${BUCKET}/sara_profile.png`],
    },
    // @Element2 — Eva
    {
      frontal_image_url: `${BUCKET}/Eva.png`,
      reference_image_urls: [`${BUCKET}/eva_3q.png`, `${BUCKET}/eva_profile.png`],
    },
    // @Element3 — Mama
    {
      frontal_image_url: `${BUCKET}/Mama.png`,
      reference_image_urls: [`${BUCKET}/mama_3q.png`, `${BUCKET}/mama_profile.png`],
    },
    // @Element4 — Joe (Pomeranian)
    {
      frontal_image_url: `${BUCKET}/Joe.png`,
      reference_image_urls: [`${BUCKET}/joe_3q.png`, `${BUCKET}/joe_profile.png`],
    },
    // @Element5 — Ginger (Jack Russell)
    {
      frontal_image_url: `${BUCKET}/Ginger.png`,
      reference_image_urls: [`${BUCKET}/ginger_3q.png`, `${BUCKET}/ginger_profile.png`],
    },
  ],

  // Style refs — costume previews ensure Kling sees the costume look
  image_urls: [
    `${BUCKET}/Sara_Halloween_Princess.png`,
    `${BUCKET}/Eva_Halloween_Pumpkin.png`,
    `${BUCKET}/Joe_Bug_Costume.png`,
    `${BUCKET}/Ginger_Pumpkin_Cape.png`,
  ],

  prompt: `Camera: slow dolly push, eye-level, opening medium-wide on family fanned across the living-room rug. Establishing shot — first frame of episode.

Scene: cozy autumn-decorated living-room — soft beige couch with autumn-orange throw, warm orange floor-lamp glow, paper jack-o-lanterns on side table, candy bowl on coffee table.

0:0-0:2 — Slow dolly push, medium-wide. @Element1 (Sara, in pink-and-white sparkly fairy-princess tutu with silver tiara on her wavy dark-blonde hair, translucent pink fairy wings, holding magic-wand and small pumpkin candy bucket — costume locked from style ref @Image1) on the left of frame; @Element2 (Eva, in orange pumpkin onesie with smiling jack-o-lantern face on tummy and green stem-hat — costume locked from style ref @Image2) center; @Element3 (Mama, straight blonde hair under pumpkin-orange knit beanie, fair skin, rust-orange chunky knit sweater) softly behind-center; @Element4 (Joe the Pomeranian in red-with-black-spots ladybug body costume — costume locked from @Image3) right-foreground at Eva's feet; @Element5 (Ginger the Jack Russell in pumpkin-orange cape — costume locked from @Image4) left-foreground at Sara's feet. Tails wag.

0:2-0:4 — Slow dolly push, settling to medium. @Element3 (Mama): "Are my pumpkins ready to trick-or-treat?" @Element1 (Sara) lifts her magic-wand. @Element2 (Eva) grins.

0:4-0:6 — Slow tilt down to floor level — soft rack focus to @Element4 (Joe-bug) and @Element5 (Ginger-cape). Both dogs looking up at the family with tails wagging.

0:6-0:8 — Slow tilt back up to eye-level medium. @Element2 (Eva): "PUNK-INS!" Whole family laughs warmly.

0:8-1:0 — HOLD on the family portrait composition. Warm orange lamp glow throughout. Smash to next clip.

Lighting: warm autumn evening interior — soft orange floor lamp + practical jack-o-lantern candle glow.
Style: Pixar 3D feature-render quality, cinematic kid-show, NOT scary.`,

  negative_prompt: "duplicate character, twin, clone, mirrored figure, second father, two Mama, third child, ghost figure, ghost kid, three arms, extra arm, scary face, horror lighting, scary monster, blood, red liquid, motion blur, papa with hair, eva with brown hair, eva brunette, sara in ponytail, mama with dark hair, mama with brunette hair, dark-skinned mama, dark-skinned eva, generic family, off-model characters",

  cfg_scale: 0.5,
};

console.log("\n📤 Submitting clip 1 TEST with corrected schema...");
console.log(`   model: ${body.model_name}, mode: ${body.mode}, duration: ${body.duration}s`);
console.log(`   elements: ${body.elements.length} (each with frontal + 2 ref views)`);
console.log(`   image_urls (style refs): ${body.image_urls.length}`);
console.log(`   prompt length: ${body.prompt.length} chars`);

const r = await fetch("https://api-singapore.klingai.com/v1/videos/omni-video", {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt()}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await r.text();
let json = null; try { json = JSON.parse(text); } catch {}

console.log(`\n   status=${r.status} code=${json?.code}`);
console.log(`   message: ${json?.message}`);
if (json?.code === 0) {
  console.log(`\n✅ TASK SUBMITTED: ${json.data?.task_id}`);
  console.log(`   external_task_id: ${body.external_task_id}`);
  console.log(`\n   Run this to check status:`);
  console.log(`   curl -H "Authorization: Bearer <jwt>" https://api-singapore.klingai.com/v1/videos/omni-video/${json.data?.task_id}`);
} else {
  console.log(`\n❌ FAILED. Body sent:`);
  console.log(JSON.stringify(body, null, 2).slice(0, 1500));
}
