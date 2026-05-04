#!/usr/bin/env node
/**
 * Generate a YouTube thumbnail for a Sara & Eva episode.
 *
 * Codifies the recipe used ad-hoc through ep08-ep10:
 *   1. Extract a hero frame from a chosen clip at a chosen timestamp
 *   2. Apply title text (Impact font, yellow #FFD60A, black stroke + Gaussian
 *      blur shadow) — top-center
 *   3. Apply handle "Sara & Eva" text (white, black stroke) — bottom-right
 *   4. Save as ep<NN>_thumbnail.jpg in season_01/episode_<NN>/
 *
 * Auto-picks a hero clip (default: clip 14 — typically a dynamic 2-char beat)
 * and a timestamp (default: 3.0s into the clip — past the 0.15s scene-pop
 * preprocessing).
 *
 * Usage:
 *   node generateThumbnail.mjs --episode=10 --title "MAGIC FOREST!"
 *   node generateThumbnail.mjs --episode=10 --title "MAGIC FOREST!" --hero=14 --time=3.0
 *   node generateThumbnail.mjs <ep_dir> --title "..." [--subtitle "Sara & Eva"]
 */
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

// Parse args: support both --key=value AND --key value forms
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const eq = a.indexOf("=");
    if (eq > 0) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[k] = next;
        i++;
      } else {
        flags[k] = "true";
      }
    }
  } else {
    positional.push(a);
  }
}
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");

let epDir, epNum;
if (positional[0]) {
  epDir = path.resolve(positional[0]);
  const m = epDir.match(/episode_(\d+)/);
  epNum = m ? Number(m[1]) : null;
} else if (flags.episode) {
  epNum = Number(flags.episode);
  epDir = path.join(PROJECT_ROOT, "season_01", `episode_${String(epNum).padStart(2, "0")}`);
} else {
  console.error("Usage: generateThumbnail.mjs <episode_dir> | --episode=NN  --title \"TITLE!\"  [--hero=14] [--time=3.0] [--subtitle \"Sara & Eva\"] [--out path.jpg]");
  process.exit(1);
}
if (!fs.existsSync(epDir)) {
  console.error(`❌ episode dir not found: ${epDir}`);
  process.exit(1);
}
const clipsDir = path.join(epDir, "clips");
if (!fs.existsSync(clipsDir)) {
  console.error(`❌ clips dir not found: ${clipsDir}`);
  process.exit(1);
}

const title = flags.title;
if (!title) {
  console.error(`❌ --title is required (e.g. --title "MAGIC FOREST!")`);
  process.exit(1);
}
const subtitle = flags.subtitle ?? "Sara & Eva";
const heroClip = flags.hero ?? "14";
const heroTime = Number(flags.time ?? 3.0);
const outPath = flags.out
  ? path.resolve(flags.out)
  : path.join(epDir, `ep${String(epNum).padStart(2, "0")}_thumbnail.jpg`);

const heroPath = path.join(clipsDir, `${heroClip}.mp4`);
if (!fs.existsSync(heroPath)) {
  console.error(`❌ hero clip not found: ${heroPath}`);
  console.error(`   Available: ${fs.readdirSync(clipsDir).filter(f => f.endsWith(".mp4")).join(", ")}`);
  process.exit(1);
}

console.log(`🖼  Thumbnail recipe`);
console.log(`   hero clip:   ${heroClip}.mp4 @ ${heroTime}s`);
console.log(`   title:       "${title}"`);
console.log(`   subtitle:    "${subtitle}"`);
console.log(`   out:         ${outPath}`);

// 1) Extract hero frame at 1280x720
const heroFrame = `/tmp/ep${epNum}_hero_${Date.now()}.jpg`;
const ff = spawnSync("ffmpeg", ["-y", "-ss", String(heroTime), "-i", heroPath, "-frames:v", "1", "-vf", "scale=1280:720", heroFrame], {
  stdio: ["ignore", "ignore", "pipe"],
});
if (ff.status !== 0) {
  console.error(`❌ ffmpeg frame extract failed:\n${ff.stderr}`);
  process.exit(1);
}

// 2) Pillow text overlay (call inline Python)
const py = `
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
src = "${heroFrame}"
out = "${outPath}"
img = Image.open(src).convert("RGB")
W, H = img.size
draw = ImageDraw.Draw(img)
candidates = [
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "/Library/Fonts/Impact.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]
font_path = next((p for p in candidates if os.path.exists(p)), None)
font_main = ImageFont.truetype(font_path, 110)
font_sub = ImageFont.truetype(font_path, 60)
title = ${JSON.stringify(title)}
sub = ${JSON.stringify(subtitle)}
YELLOW = (255, 214, 10); WHITE = (255, 255, 255); BLACK = (0, 0, 0)

def draw_with_stroke(text, font, fill, pos, stroke_w=8):
    x, y = pos
    sh = Image.new("RGBA", img.size, (0,0,0,0))
    sd = ImageDraw.Draw(sh)
    sd.text((x+6, y+6), text, font=font, fill=(0,0,0,180), stroke_width=stroke_w, stroke_fill=(0,0,0,180))
    sh2 = sh.filter(ImageFilter.GaussianBlur(radius=8))
    img.paste(sh2, (0,0), sh2)
    draw.text((x, y), text, font=font, fill=fill, stroke_width=stroke_w, stroke_fill=BLACK)

bbox = draw.textbbox((0,0), title, font=font_main, stroke_width=8)
tw = bbox[2] - bbox[0]
draw_with_stroke(title, font_main, YELLOW, ((W - tw) // 2, 25))

bbox2 = draw.textbbox((0,0), sub, font=font_sub, stroke_width=6)
sw = bbox2[2] - bbox2[0]
draw_with_stroke(sub, font_sub, WHITE, (W - sw - 30, H - 90), stroke_w=6)

img.save(out, quality=95)
print(f"saved {out} ({os.path.getsize(out)/1024:.1f} KB)")
`;
const result = spawnSync("python3", ["-c", py], { stdio: "inherit" });
fs.unlinkSync(heroFrame);

if (result.status !== 0) {
  console.error(`❌ Pillow overlay failed`);
  process.exit(1);
}
console.log(`\n✅ ${outPath}`);
