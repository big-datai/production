#!/usr/bin/env node
/**
 * Create a Kling element via the official AK/SK API and append its
 * element_id to content/elements_registry.json. Replaces /tmp/kling_create_element.py.
 *
 * Usage:
 *   node createElementViaApi.mjs \
 *     --name Mama \
 *     --description "Adult woman, blonde hair, family-show character" \
 *     --frontal https://storage.googleapis.com/saraandeva-kling-elements/characters/mama_front.png \
 *     --refer https://.../mama_3q.png \
 *     --refer https://.../mama_profile.png \
 *     [--tag o_102]            # default Character
 *     [--external-id mama-1]
 *
 * Tag IDs: o_101 Hottest, o_102 Character, o_103 Animal, o_104 Item,
 *          o_105 Costume, o_106 Scene, o_107 Effect, o_108 Others.
 *
 * Note: Suno requires 1-3 refer images (NOT 0). When you have only one image,
 * pass it as both --frontal and --refer (same URL twice).
 */
import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const ENV_FILE = "/Volumes/Samsung500/goreadling-production/.env.local";
const REGISTRY_FILE = path.join(PROJECT_ROOT, "content", "elements_registry.json");
const BASE = "https://api-singapore.klingai.com";
const GENRE_CAP_NAME = 20, CAP_DESC = 100;

for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z_0-9]*)=["']?(.+?)["']?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const AK = process.env.KLING_ACCESS_KEY, SK = process.env.KLING_SECRET_KEY;
if (!AK || !SK) { console.error("missing KLING keys in .env.local"); process.exit(1); }

const argv = process.argv.slice(2);
const argFlag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const argMulti = (n) => argv.reduce((acc, a, i) => (a === `--${n}` ? [...acc, argv[i + 1]] : acc), []);
const name = argFlag("name"), description = argFlag("description"), frontal = argFlag("frontal");
const refers = argMulti("refer");
const tag = argFlag("tag") || "o_102";
const externalId = argFlag("external-id") || `${(name || "").toLowerCase().replace(/\s+/g, "_")}-1`;
if (!name || !description || !frontal) {
  console.error("required: --name, --description, --frontal. Optional: --refer (1-3 times), --tag, --external-id");
  process.exit(1);
}
if (name.length > GENRE_CAP_NAME) { console.error(`name > ${GENRE_CAP_NAME} chars`); process.exit(1); }
if (description.length > CAP_DESC) { console.error(`description > ${CAP_DESC} chars`); process.exit(1); }

// Kling rejects refer_images with 0 entries — duplicate frontal if no refers given
const referList = refers.length ? refers : [frontal];
if (referList.length > 3) { console.error("max 3 refers"); process.exit(1); }

const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function token() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify({ iss: AK, exp: now + 1800, nbf: now - 5 }));
  const s = b64url(createHmac("sha256", SK).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}
async function http(method, p, body = null) {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { return { status: r.status, body: { code: -1, raw: text } }; }
  return { status: r.status, body: json };
}

const payload = {
  element_name: name,
  element_description: description,
  reference_type: "image_refer",
  element_image_list: { frontal_image: frontal, refer_images: referList.map(u => ({ image_url: u })) },
  tag_list: [{ tag_id: tag }],
  external_task_id: externalId,
};

console.log(`▶ POST /v1/general/advanced-custom-elements  (name="${name}")`);
const submit = await http("POST", "/v1/general/advanced-custom-elements", payload);
if (submit.body.code !== 0) {
  console.error(`!! create failed: ${JSON.stringify(submit.body, null, 2)}`);
  process.exit(1);
}
const taskId = submit.body.data.task_id;
console.log(`>> task_id=${taskId}, polling...`);

const deadline = Date.now() + 5 * 60_000;
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 5_000));
  const poll = await http("GET", `/v1/general/advanced-custom-elements/${taskId}`);
  const d = poll.body.data || {};
  if (d.task_status === "succeed") {
    const el = ((d.task_result || {}).elements || [])[0];
    if (!el?.element_id) { console.error("succeed but no element"); process.exit(1); }
    const elementId = el.element_id;
    console.log(`\n✓ element_id=${elementId}  deduction=${d.final_unit_deduction}u`);

    // Append to registry
    const reg = fs.existsSync(REGISTRY_FILE) ? JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8")) : {};
    reg[name] = elementId;
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2) + "\n");
    console.log(`✓ registry updated: ${path.relative(PROJECT_ROOT, REGISTRY_FILE)}`);
    process.exit(0);
  }
  if (d.task_status === "failed") {
    console.error(`!! create failed: ${JSON.stringify(d, null, 2)}`);
    process.exit(1);
  }
}
console.error("!! polling timeout"); process.exit(1);
