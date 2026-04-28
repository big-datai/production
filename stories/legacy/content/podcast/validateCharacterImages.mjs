#!/usr/bin/env node

/**
 * Validate character images using Gemini Vision (text model — cheap).
 *
 * Checks each character reference image for anatomical correctness:
 *   - Correct number of limbs (arms, legs, hands, fingers, tails, wings)
 *   - Species accuracy (a wolf should look like a wolf, not a dog)
 *   - Clothing present (no nudity / bare skin for humans)
 *   - Single character only (no extra characters in the image)
 *   - Full body visible
 *
 * Usage:
 *   node content/podcast/validateCharacterImages.mjs                    # validate all stories
 *   node content/podcast/validateCharacterImages.mjs "Pinocchio"        # single story by title
 *   node content/podcast/validateCharacterImages.mjs --fix              # delete failed images so they regenerate
 *   node content/podcast/validateCharacterImages.mjs "Marina" --fix     # validate + delete failures for one story
 *
 * Cost: Uses gemini-2.5-flash (text/vision) — ~100x cheaper than image generation.
 */

import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const API_KEY = process.env.GEMINI_API_KEY?.replace(/"/g, "");
if (!API_KEY) {
  console.error("❌ No GEMINI_API_KEY found in .env.local");
  process.exit(1);
}

const STORIES_DIR = "exports/stories";
const LEGACY_OUTPUT_DIR = "exports/youtube";
const VISION_MODEL = "gemini-2.5-flash";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CLI args ──
const args = process.argv.slice(2);
const fixFlag = args.includes("--fix");
const selectionArg = args.find((a) => !a.startsWith("--"));

// ══════════════════════════════════════════════════════════════════
// ANATOMY RULES — the source of truth for every species
// ══════════════════════════════════════════════════════════════════
export const ANATOMY_RULES = {
  // ── Humans & humanoids ──
  human: {
    species: "human",
    arms: 2, hands: 2, fingers_per_hand: 5,
    legs: 2, feet: 2, toes_per_foot: 5,
    eyes: 2, ears: 2,
    tail: false, wings: false, hooves: false,
    notes: "Upright bipedal. Must be fully clothed. No fur, no snout, no animal ears.",
  },
  mermaid: {
    species: "mermaid/merman",
    arms: 2, hands: 2, fingers_per_hand: 5,
    legs: 0, feet: 0,
    eyes: 2, ears: 2,
    tail: "fish tail (single)", fins: true,
    wings: false, hooves: false,
    notes: "Human upper body + single fish tail. Torso must be fully covered (tunic/blouse/top). No bare chests.",
  },
  puppet: {
    species: "wooden puppet",
    arms: 2, hands: 2, fingers_per_hand: 5,
    legs: 2, feet: 2,
    eyes: 2, ears: 2,
    tail: false, wings: false, hooves: false,
    notes: "Looks like a wooden child. Visible joints at elbows/knees. Painted features. Must be clothed.",
  },

  // ── Quadrupeds (4 legs) ──
  cat: {
    species: "cat",
    legs: 4, paws: 4,
    eyes: 2, ears: 2,
    tail: "1 tail",
    wings: false, hooves: false,
    notes: "Real cat anatomy. 4 legs, 4 paws, pointed ears, whiskers, fur. NOT humanoid.",
  },
  dog: {
    species: "dog",
    legs: 4, paws: 4,
    eyes: 2, ears: 2,
    tail: "1 tail",
    wings: false, hooves: false,
    notes: "Real dog anatomy. 4 legs, snout, fur, floppy or pointed ears depending on breed.",
  },
  wolf: {
    species: "wolf",
    legs: 4, paws: 4,
    eyes: 2, ears: 2,
    tail: "1 bushy tail",
    wings: false, hooves: false,
    notes: "Real wolf anatomy. 4 legs, 4 paws, pointed ears, long snout, thick fur. Larger and wilder than a dog. NOT humanoid.",
  },
  bear: {
    species: "bear",
    legs: 4, paws: 4,
    eyes: 2, ears: 2,
    tail: "1 short tail (may be hidden)",
    wings: false, hooves: false,
    notes: "Real bear anatomy. 4 legs (may stand on hind legs briefly), large paws, round ears, thick fur. NOT humanoid.",
  },
  fox: {
    species: "fox",
    legs: 4, paws: 4,
    eyes: 2, ears: 2,
    tail: "1 bushy tail",
    wings: false, hooves: false,
    notes: "Real fox anatomy. 4 legs, pointed snout, large pointed ears, bushy tail.",
  },
  rabbit: {
    species: "rabbit",
    legs: 4, paws: 4,
    eyes: 2, ears: 2,
    tail: "1 small fluffy tail",
    wings: false, hooves: false,
    notes: "Real rabbit anatomy. 4 legs (long hind legs), long ears, small fluffy tail, fur.",
  },
  mouse: {
    species: "mouse",
    legs: 4, paws: 4,
    eyes: 2, ears: 2,
    tail: "1 long thin tail",
    wings: false, hooves: false,
    notes: "Real mouse anatomy. Tiny, 4 legs, round ears, thin tail.",
  },
  frog: {
    species: "frog",
    legs: 4, feet: 4,
    eyes: 2,
    tail: false,
    wings: false, hooves: false,
    notes: "Real frog anatomy. 4 legs (powerful hind legs), webbed feet, smooth skin, large eyes. No tail.",
  },
  pig: {
    species: "pig",
    legs: 4, hooves: 4,
    eyes: 2, ears: 2,
    tail: "1 curly tail",
    wings: false,
    notes: "Real pig anatomy. 4 legs, hooves, snout, floppy ears, curly tail.",
  },

  // ── Hoofed animals ──
  horse: {
    species: "horse",
    legs: 4, hooves: 4,
    eyes: 2, ears: 2,
    tail: "1 long tail",
    wings: false,
    notes: "Real horse anatomy. 4 legs, 4 hooves, long mane and tail.",
  },
  donkey: {
    species: "donkey",
    legs: 4, hooves: 4,
    eyes: 2, ears: 2,
    tail: "1 tufted tail",
    wings: false,
    notes: "Real donkey anatomy. 4 legs, 4 hooves, long ears, tufted tail.",
  },
  cow: {
    species: "cow",
    legs: 4, hooves: 4,
    eyes: 2, ears: 2,
    tail: "1 long tail with tuft",
    wings: false,
    notes: "Real cow anatomy. 4 legs, 4 hooves, udder (if female), long tail.",
  },

  // ── Birds ──
  bird: {
    species: "bird",
    legs: 2, feet: 2,
    eyes: 2,
    tail: "tail feathers",
    wings: 2,
    notes: "Real bird anatomy. 2 legs, 2 wings, beak, feathers. No arms.",
  },
  duck: {
    species: "duck",
    legs: 2, feet: "2 webbed feet",
    eyes: 2,
    tail: "short tail feathers",
    wings: 2,
    notes: "Real duck anatomy. 2 legs, 2 wings, flat bill, webbed feet. Duckling = same but smaller and fluffy.",
  },
  swan: {
    species: "swan",
    legs: 2, feet: "2 webbed feet",
    eyes: 2,
    tail: "short tail feathers",
    wings: 2,
    notes: "Real swan anatomy. Long curved neck, 2 legs, 2 wings, webbed feet.",
  },
  hen: {
    species: "hen/chicken",
    legs: 2, feet: 2,
    eyes: 2,
    tail: "tail feathers",
    wings: 2,
    notes: "Real chicken anatomy. 2 legs with scaly feet, 2 wings, beak, comb on head.",
  },
  robin: {
    species: "robin",
    legs: 2, feet: 2,
    eyes: 2,
    tail: "tail feathers",
    wings: 2,
    notes: "Small bird. 2 legs, 2 wings, beak, red breast.",
  },

  // ── Insects ──
  cricket: {
    species: "cricket",
    legs: 6,
    eyes: 2,
    tail: false,
    wings: 2,
    antennae: 2,
    notes: "Insect. 6 legs (powerful jumping hind legs), 2 antennae, small body, 2 wing covers.",
  },

  // ── Magical/Other ──
  enchantress: {
    species: "enchantress / magical human",
    arms: 2, hands: 2, fingers_per_hand: 5,
    legs: 2, feet: 2,
    eyes: 2, ears: 2,
    tail: false, wings: false,
    notes: "Human-like. Must be fully clothed. May have magical aura/glow but human anatomy.",
  },

  // ── Reptiles ──
  tortoise: {
    species: "tortoise",
    legs: 4, feet: 4,
    eyes: 2,
    tail: "1 small tail",
    wings: false,
    notes: "Real tortoise anatomy. 4 stubby legs, hard shell on back, small head, no ears visible. NOT a turtle (no flippers).",
  },

  // ── Rodents ──
  squirrel: {
    species: "squirrel",
    legs: 4, paws: 4,
    eyes: 2, ears: 2,
    tail: "1 large bushy tail",
    wings: false,
    notes: "Real squirrel anatomy. 4 legs, bushy tail, small rounded ears, fur.",
  },
};

// ── Map species text from character_desc.json → anatomy rule key ──
function resolveAnatomyKey(speciesText) {
  const s = speciesText.toLowerCase();
  if (/mermaid|merman/i.test(s)) return "mermaid";
  if (/puppet|wooden/i.test(s)) return "puppet";
  if (/enchant|witch|sorcer/i.test(s)) return "enchantress";
  if (/wolf/i.test(s)) return "wolf";
  if (/bear\s*cub|brown\s*bear|bear/i.test(s)) return "bear";
  if (/cat/i.test(s)) return "cat";
  if (/dog|sheepdog/i.test(s)) return "dog";
  if (/fox/i.test(s)) return "fox";
  if (/rabbit|bunny|hare\b/i.test(s)) return "rabbit";
  if (/mouse|field\s*mouse/i.test(s)) return "mouse";
  if (/frog|toad/i.test(s)) return "frog";
  if (/pig|boar/i.test(s)) return "pig";
  if (/horse/i.test(s)) return "horse";
  if (/donkey/i.test(s)) return "donkey";
  if (/cow/i.test(s)) return "cow";
  if (/duck|duckling/i.test(s)) return "duck";
  if (/swan/i.test(s)) return "swan";
  if (/hen|chicken|rooster|cockerel/i.test(s)) return "hen";
  if (/robin/i.test(s)) return "robin";
  if (/bird|bluebird|parrot|sparrow|crow|raven|owl|eagle|hawk/i.test(s)) return "bird";
  if (/cricket|insect/i.test(s)) return "cricket";
  if (/tortoise|turtle/i.test(s)) return "tortoise";
  if (/squirrel/i.test(s)) return "squirrel";
  if (/human/i.test(s)) return "human";
  return "human"; // default to human rules for safety
}

// ── Build a validation prompt for Gemini Vision ──
function buildValidationPrompt(charName, speciesText, anatomyKey) {
  const rules = ANATOMY_RULES[anatomyKey];
  if (!rules) return null;

  const ruleLines = [];
  if (rules.arms !== undefined) ruleLines.push(`- ARMS: exactly ${rules.arms}`);
  if (rules.hands !== undefined) ruleLines.push(`- HANDS: exactly ${rules.hands}`);
  if (rules.fingers_per_hand) ruleLines.push(`- FINGERS per hand: exactly ${rules.fingers_per_hand}`);
  if (rules.legs !== undefined) ruleLines.push(`- LEGS: exactly ${rules.legs}`);
  if (rules.feet !== undefined) ruleLines.push(`- FEET: exactly ${rules.feet}`);
  if (rules.paws !== undefined) ruleLines.push(`- PAWS: exactly ${rules.paws}`);
  if (rules.hooves !== undefined) ruleLines.push(`- HOOVES: exactly ${rules.hooves}`);
  if (rules.toes_per_foot) ruleLines.push(`- TOES per foot: ${rules.toes_per_foot}`);
  if (rules.eyes !== undefined) ruleLines.push(`- EYES: exactly ${rules.eyes}`);
  if (rules.ears !== undefined) ruleLines.push(`- EARS: exactly ${rules.ears}`);
  if (rules.tail !== undefined) ruleLines.push(`- TAIL: ${rules.tail === false ? "NONE (no tail)" : rules.tail}`);
  if (rules.wings !== undefined) ruleLines.push(`- WINGS: ${rules.wings === false ? "NONE" : rules.wings}`);
  if (rules.antennae) ruleLines.push(`- ANTENNAE: ${rules.antennae}`);
  if (rules.fins) ruleLines.push(`- FINS: yes (fish tail fins)`);
  ruleLines.push(`- NOTES: ${rules.notes}`);

  return `You are an anatomy quality-checker for children's book illustrations.

Examine this character image of "${charName}" (species: ${speciesText}).

EXPECTED ANATOMY for a ${rules.species}:
${ruleLines.join("\n")}

CHECK EACH of the following and report PASS or FAIL:
1. LIMB COUNT: Does the character have the correct number of arms/legs/paws/hooves? Count carefully. Look for hidden or extra limbs.
2. HAND/PAW CHECK: Correct number of hands/paws? Each hand has ${rules.fingers_per_hand || "N/A"} fingers?
3. SPECIES ACCURACY: Does this actually look like a ${rules.species}? (e.g., a wolf must look like a wolf, not a dog or human in costume)
4. SINGLE CHARACTER: Is there exactly ONE character in the image? No extra faces, bodies, or ghost limbs.
5. FULL BODY: Is the full body visible from head to toe/paws/tail?
6. CLOTHING: Is the character appropriately dressed? (humans/humanoids must be fully clothed, animals can be unclothed)
7. EXTRA FEATURES: Any extra/missing body parts? Wrong number of tails, wings, ears, eyes?

RESPOND IN EXACTLY THIS JSON FORMAT:
{
  "character": "${charName}",
  "species": "${speciesText}",
  "overall": "PASS" or "FAIL",
  "checks": {
    "limb_count": {"status": "PASS/FAIL", "detail": "counted X arms, Y legs — expected A arms, B legs"},
    "hands_paws": {"status": "PASS/FAIL", "detail": "..."},
    "species_accuracy": {"status": "PASS/FAIL", "detail": "..."},
    "single_character": {"status": "PASS/FAIL", "detail": "..."},
    "full_body": {"status": "PASS/FAIL", "detail": "..."},
    "clothing": {"status": "PASS/FAIL", "detail": "..."},
    "extra_features": {"status": "PASS/FAIL", "detail": "..."}
  },
  "issues": ["list of specific issues found, empty if all pass"],
  "severity": "none" or "minor" or "major"
}

Be STRICT. If you see 3 legs on a 4-legged animal, that is a MAJOR FAIL.
If a human has 6 fingers, that is a MAJOR FAIL.
If a fish tail appears where legs should be (for a non-mermaid), MAJOR FAIL.
If clothes are missing for a human character, MAJOR FAIL.
Respond ONLY with the JSON, nothing else.`;
}

// ── Call Gemini Vision to validate an image ──
async function validateImage(imagePath, charName, speciesText, anatomyKey) {
  const prompt = buildValidationPrompt(charName, speciesText, anatomyKey);
  if (!prompt) return { overall: "SKIP", issues: ["No anatomy rules for this species"] };

  const imgBytes = fs.readFileSync(imagePath);
  const base64 = imgBytes.toString("base64");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: "image/png", data: base64 } },
        { text: prompt },
      ],
    }],
    generationConfig: { temperature: 0.1 },
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.log(`      ⏳ Rate limited, waiting 30s...`);
          await sleep(30000);
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");
      return JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.log(`      ⚠️ Validation attempt ${attempt + 1}/3 failed: ${err.message}`);
      if (attempt < 2) await sleep(5000);
    }
  }

  return { overall: "ERROR", issues: ["Failed to validate after 3 attempts"] };
}

// ── Parse character descriptions into name→species map ──
function parseCharacters(storyDir) {
  // Try JSON first (new format)
  const jsonPath = path.join(storyDir, "character_desc.json");
  if (fs.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      if (Array.isArray(data) && data.length > 0) {
        return data.map(c => ({ name: c.name, species: c.species || "Human" }));
      }
    } catch { /* fall through to txt */ }
  }

  // Fallback: old .txt format
  const descPath = path.join(storyDir, "character_desc.txt");
  if (!fs.existsSync(descPath)) return [];
  const text = fs.readFileSync(descPath, "utf8");

  const characters = [];
  const blocks = text.split(/(?=###\s*\*?\*?Character Sheet|###\s*\d+\.|\*\*\d+\.\s*NAME:|\d+\.\s+\*\*NAME:|^\*\*\d+\.\s*[^*:]+\*\*)/im);

  for (const block of blocks) {
    let nameMatch = block.match(/(?:Character Sheet:\s*\*?\*?\s*|NAME:?\*?\*?:?\s*)([^*\n]+)/i);
    if (!nameMatch) nameMatch = block.match(/###\s*\d+\.\s*(.+)/i);
    if (!nameMatch) nameMatch = block.match(/^\*\*\d+\.\s*([^*:]+)\*\*/im);
    if (!nameMatch) continue;
    if (nameMatch[1].trim() === 'NAME') continue;
    const name = nameMatch[1].trim();
    const speciesMatch = block.match(/SPECIES[^:]*:\*?\*?\s*([^\n]+)/i);
    const species = speciesMatch ? speciesMatch[1].trim().replace(/\*+/g, "") : "Human";
    characters.push({ name, species });
  }

  return characters;
}

// ══════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════
async function main() {
  console.log("🔍 Character Image Validator — GoReadling YouTube\n");
  console.log("   Uses Gemini Vision (text model) — ~100x cheaper than image generation.\n");

  // Find all story directories with character images — scan exports/stories/*/youtube/*/
  const youtubeDirs = [];
  if (fs.existsSync(STORIES_DIR)) {
    for (const d of fs.readdirSync(STORIES_DIR)) {
      const storyRoot = path.join(STORIES_DIR, d);
      if (!fs.statSync(storyRoot).isDirectory()) continue;
      const ytDir = path.join(storyRoot, "youtube");
      if (!fs.existsSync(ytDir)) continue;
      for (const sub of fs.readdirSync(ytDir)) {
        if (fs.statSync(path.join(ytDir, sub)).isDirectory()) {
          youtubeDirs.push({ name: sub, path: path.join(ytDir, sub) });
        }
      }
    }
  }
  // Also scan legacy dir
  if (fs.existsSync(LEGACY_OUTPUT_DIR)) {
    for (const d of fs.readdirSync(LEGACY_OUTPUT_DIR)) {
      const full = path.join(LEGACY_OUTPUT_DIR, d);
      if (fs.statSync(full).isDirectory() && !youtubeDirs.find(v => v.name === d)) {
        youtubeDirs.push({ name: d, path: full });
      }
    }
  }
  const storyDirs = youtubeDirs
    .filter(d => !selectionArg || d.name.toLowerCase().includes(selectionArg.toLowerCase()));

  let totalChecked = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const allFailures = [];

  for (const { name: storyDir, path: storyPath } of storyDirs) {
    const charsDir = path.join(storyPath, "illustrations", "characters");
    const descDir = storyPath;

    if (!fs.existsSync(charsDir)) continue;
    // Need either .json or .txt character descriptions
    if (!fs.existsSync(path.join(descDir, "character_desc.json")) && !fs.existsSync(path.join(descDir, "character_desc.txt"))) continue;

    const charFiles = fs.readdirSync(charsDir).filter(f => f.endsWith(".png"));
    if (charFiles.length === 0) continue;

    const characters = parseCharacters(descDir);
    if (characters.length === 0) continue;

    console.log(`\n📖 ${storyDir.replace(/_/g, " ")} (${charFiles.length} character images)`);
    console.log("─".repeat(60));

    for (const charFile of charFiles) {
      const imgPath = path.join(charsDir, charFile);
      const baseName = charFile.replace(".png", "").replace(/_/g, " ");

      // Find matching character from character descriptions
      const match = characters.find(c =>
        c.name.toLowerCase().replace(/[^a-z0-9]/g, " ").includes(baseName.replace(/[^a-z0-9]/g, " ")) ||
        baseName.replace(/[^a-z0-9]/g, " ").includes(c.name.toLowerCase().replace(/[^a-z0-9]/g, " "))
      );

      if (!match) {
        console.log(`   ⚠️ ${charFile} — no matching character description, skipping`);
        totalSkipped++;
        continue;
      }

      const anatomyKey = resolveAnatomyKey(match.species);
      process.stdout.write(`   🔎 ${match.name} (${match.species} → ${anatomyKey})...`);

      const result = await validateImage(imgPath, match.name, match.species, anatomyKey);
      totalChecked++;

      if (result.overall === "PASS") {
        console.log(` ✅ PASS`);
        totalPassed++;
      } else if (result.overall === "SKIP" || result.overall === "ERROR") {
        console.log(` ⚠️ ${result.overall}: ${result.issues?.join(", ")}`);
        totalSkipped++;
      } else {
        console.log(` ❌ FAIL (${result.severity || "unknown"})`);
        for (const issue of (result.issues || [])) {
          console.log(`      → ${issue}`);
        }
        totalFailed++;
        allFailures.push({
          story: storyDir,
          character: match.name,
          species: match.species,
          file: imgPath,
          issues: result.issues || [],
          severity: result.severity,
          checks: result.checks,
        });

        // --fix: delete failed image so it regenerates on next run
        if (fixFlag && result.severity === "major") {
          fs.unlinkSync(imgPath);
          console.log(`      🗑️ Deleted ${charFile} (will regenerate on next run)`);
        }
      }

      // Small delay between API calls
      await sleep(1500);
    }
  }

  // ── Summary ──
  console.log("\n" + "═".repeat(60));
  console.log("📊 VALIDATION SUMMARY");
  console.log("═".repeat(60));
  console.log(`   Checked:  ${totalChecked}`);
  console.log(`   ✅ Passed: ${totalPassed}`);
  console.log(`   ❌ Failed: ${totalFailed}`);
  console.log(`   ⚠️ Skipped: ${totalSkipped}`);

  if (allFailures.length > 0) {
    console.log(`\n🚨 FAILURES:`);
    for (const f of allFailures) {
      console.log(`   ${f.story}/${f.character} (${f.species}) — ${f.severity}`);
      for (const issue of f.issues) {
        console.log(`      → ${issue}`);
      }
    }

    // Write failures to JSON for pipeline integration
    const reportPath = path.join(STORIES_DIR, "validation_report.json");
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      total: totalChecked,
      passed: totalPassed,
      failed: totalFailed,
      failures: allFailures,
    }, null, 2));
    console.log(`\n📄 Report saved to ${reportPath}`);
  }

  if (fixFlag && allFailures.some(f => f.severity === "major")) {
    console.log(`\n♻️ Major failures deleted. Re-run generateYoutubeVideos.mjs to regenerate.`);
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

// Only run main() when executed directly, not when imported
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/.*\//, ""));
if (isMainModule) {
  main().catch(console.error);
}
