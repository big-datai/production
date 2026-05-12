#!/usr/bin/env node
// Prepends a tight Halloween-costume cast identity lock block to each ep15 clip
// JSON's prompt — only includes the costume lines for the subjects that appear
// in that clip. Idempotent (skips clips that already have a "Cast (Halloween" header).
// Hard-fails on any clip where the new prompt exceeds 2500 chars.
import fs from "node:fs";
import path from "node:path";

const EP_DIR = "/Volumes/Samsung500/goreadling-production/saraandeva/content/episodes/ep15";

// Tight locks: each char ≤ ~85 chars so a 6-subject clip fits in ~510-char block
const COSTUME_LOCKS = {
  Sara:   "- @Sara: fairy princess — silver tiara, pink-white tutu, wings, wand, jack-o-lantern bucket. Wavy dark-blonde hair.",
  Eva:    "- @Eva: pumpkin onesie — orange body w/ jack-o-lantern face on tummy, green leaf hat, pumpkin bucket. Curly blonde.",
  Mama:   "- @Mama: cozy chaperone — burnt-orange beanie + sweater, mustard pants, kid-flashlight. Blonde hair.",
  Papa:   "- @Papa: bat — black bat hood w/ red ears + fang print, bat-wing face paint. Bearded.",
  Joe:    "- @Joe: cream-gold Pomeranian dog in red-and-black-spotted ladybug body costume.",
  Ginger: "- @Ginger: Jack Russell dog (white + tan ginger patches), tiny pumpkin-orange cape.",
  Isabel: "- @Isabel: friend in unicorn costume — pastel rainbow-mane hood, white onesie, gold horn.",
  Leo:    "- @Leo: toddler friend in green dinosaur onesie w/ spiky back ridge.",
  Lisa:   "- @Lisa: neighbor lady in cozy fall sweater + pumpkin-spice apron, candy bowl in hand.",
};

const HEADER = "Cast (Halloween night):";

let updated = 0, skipped = 0, failed = 0;
const tooLong = [];
for (const f of fs.readdirSync(EP_DIR)) {
  if (!/^\d+\.json$/.test(f)) continue;
  const fullPath = path.join(EP_DIR, f);
  const spec = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  if (!spec.prompt) { console.log(`  ✗ ${f}: no prompt`); continue; }

  // Idempotent: skip if already has the header
  if (spec.prompt.startsWith(HEADER)) { skipped++; continue; }

  const subjects = spec.subjects || [];
  if (!subjects.length) { console.log(`  ⊘ ${f}: no subjects`); continue; }
  const locks = subjects.map(s => COSTUME_LOCKS[s] || `- @${s}: <no costume lock defined>`).filter(Boolean);
  const block = `${HEADER}\n${locks.join("\n")}\n\n`;
  const newPrompt = block + spec.prompt;

  if (newPrompt.length > 2500) {
    tooLong.push({ f, len: newPrompt.length, original: spec.prompt.length });
    failed++;
    continue;
  }

  spec.prompt = newPrompt;
  fs.writeFileSync(fullPath, JSON.stringify(spec, null, 2) + "\n");
  console.log(`  ✓ ${f}: ${spec.prompt.length} chars  [${subjects.join(",")}]`);
  updated++;
}

console.log(`\n${updated} updated, ${skipped} already had locks, ${failed} too long.`);
if (tooLong.length) {
  console.log(`Over 2500-char cap (need manual trimming):`);
  for (const t of tooLong) console.log(`  ${t.f}: ${t.len} chars (original ${t.original})`);
  process.exit(1);
}
