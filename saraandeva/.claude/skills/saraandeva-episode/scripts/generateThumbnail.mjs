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
 * Branding: overlays the channel watermark badge (assets/branding/video_watermark.png)
 * in the bottom-right by default. Pass --no-watermark to fall back to plain
 * "Sara & Eva" text, or --watermark <path.png> to use a different badge.
 *
 * Usage:
 *   node generateThumbnail.mjs --episode=10 --title "MAGIC FOREST!"
 *   node generateThumbnail.mjs --episode=10 --title "MAGIC FOREST!" --hero=14 --time=3.0
 *   node generateThumbnail.mjs <ep_dir> --title "..." [--no-watermark | --watermark path.png] [--watermark-size 180]
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

const title = flags.title;
if (!title) {
  console.error(`❌ --title is required (e.g. --title "MAGIC FOREST!")`);
  process.exit(1);
}

// Pre-render lint — catches the ep11/ep12/ep13 bug where the full episode
// title overflowed the 1280px canvas at 110pt Impact and shipped cut off on
// both edges. See memory/lesson_episode_thumbnail_recipe.md.
if (title !== title.toUpperCase()) {
  console.warn(`⚠️  title "${title}" is not ALL-CAPS — recipe expects an all-caps hook (e.g. "BEACH MAGIC!")`);
}
if (!title.endsWith("!")) {
  console.warn(`⚠️  title "${title}" doesn't end with "!" — recipe expects an exclamation hook`);
}
{
  const pyMeasure = `
from PIL import ImageFont, ImageDraw, Image
import os, sys
candidates = [
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "/Library/Fonts/Impact.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]
font_path = next((p for p in candidates if os.path.exists(p)), None)
if not font_path:
    sys.stderr.write("no font found\\n"); sys.exit(2)
font = ImageFont.truetype(font_path, 110)
draw = ImageDraw.Draw(Image.new("RGB", (1280, 720)))
bbox = draw.textbbox((0, 0), ${JSON.stringify(title)}, font=font, stroke_width=8)
print(bbox[2] - bbox[0])
`;
  const measure = spawnSync("python3", ["-c", pyMeasure], { encoding: "utf8" });
  if (measure.status !== 0) {
    console.error(`❌ title measurement failed:\n${measure.stderr}`);
    process.exit(1);
  }
  const tw = Number(measure.stdout.trim());
  if (!Number.isFinite(tw)) {
    console.error(`❌ could not parse title width from python output: "${measure.stdout.trim()}"`);
    process.exit(1);
  }
  if (tw + 60 > 1280) {
    console.error(`❌ title "${title}" overflows the 1280px thumbnail canvas (${tw}px text + 60px padding = ${tw + 60}px).`);
    console.error(``);
    console.error(`   Per memory/lesson_episode_thumbnail_recipe.md:`);
    console.error(`   title must be a SHORT all-caps hook like "DENTIST DAY!" or "BEACH MAGIC!" — not the full episode title.`);
    console.error(`   Try shortening to 2-3 words.`);
    process.exit(1);
  }
}

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

const subtitle = flags.subtitle ?? "Sara & Eva";
const heroClip = flags.hero ?? "14";
const heroTime = Number(flags.time ?? 3.0);
const outPath = flags.out
  ? path.resolve(flags.out)
  : path.join(epDir, `ep${String(epNum).padStart(2, "0")}_thumbnail.jpg`);

// Watermark badge — defaults to the canonical brand badge. --no-watermark falls
// back to the plain "Sara & Eva" subtitle text (legacy behavior).
const DEFAULT_WATERMARK = path.join(PROJECT_ROOT, "assets", "branding", "video_watermark.png");
const watermarkDisabled = flags["no-watermark"] === "true";
const watermarkPath = watermarkDisabled
  ? null
  : (flags.watermark ? path.resolve(flags.watermark) : DEFAULT_WATERMARK);
const watermarkSize = Number(flags["watermark-size"] ?? 180);
if (watermarkPath && !fs.existsSync(watermarkPath)) {
  console.error(`❌ watermark file not found: ${watermarkPath}`);
  process.exit(1);
}

const heroPath = path.join(clipsDir, `${heroClip}.mp4`);
if (!fs.existsSync(heroPath)) {
  console.error(`❌ hero clip not found: ${heroPath}`);
  console.error(`   Available: ${fs.readdirSync(clipsDir).filter(f => f.endsWith(".mp4")).join(", ")}`);
  process.exit(1);
}

console.log(`🖼  Thumbnail recipe`);
console.log(`   hero clip:   ${heroClip}.mp4 @ ${heroTime}s`);
console.log(`   title:       "${title}"`);
if (watermarkPath) {
  console.log(`   watermark:   ${path.basename(watermarkPath)} @ ${watermarkSize}px (bottom-right)`);
} else {
  console.log(`   subtitle:    "${subtitle}" (text fallback — --no-watermark)`);
}
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

// 2) Pillow text + watermark overlay (call inline Python)
const py = `
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
src = "${heroFrame}"
out = "${outPath}"
watermark_path = ${watermarkPath ? JSON.stringify(watermarkPath) : "None"}
watermark_size = ${watermarkSize}
img = Image.open(src).convert("RGBA")
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

# Title — yellow Impact, top-center, black stroke + soft drop shadow
bbox = draw.textbbox((0,0), title, font=font_main, stroke_width=8)
tw = bbox[2] - bbox[0]
draw_with_stroke(title, font_main, YELLOW, ((W - tw) // 2, 25))

# Bottom-right brand mark — either the watermark badge OR the subtitle text
if watermark_path:
    wm = Image.open(watermark_path).convert("RGBA")
    # Scale to width=watermark_size while preserving aspect
    scale = watermark_size / wm.width
    new_h = int(round(wm.height * scale))
    wm = wm.resize((watermark_size, new_h), Image.LANCZOS)
    # 24px padding from bottom-right edge — matches applyWatermark.py default
    pad = 24
    pos = (W - wm.width - pad, H - wm.height - pad)
    img.alpha_composite(wm, dest=pos)
else:
    bbox2 = draw.textbbox((0,0), sub, font=font_sub, stroke_width=6)
    sw = bbox2[2] - bbox2[0]
    draw_with_stroke(sub, font_sub, WHITE, (W - sw - 30, H - 90), stroke_w=6)

img.convert("RGB").save(out, quality=95)
print(f"saved {out} ({os.path.getsize(out)/1024:.1f} KB)")
`;
const result = spawnSync("python3", ["-c", py], { stdio: "inherit" });
fs.unlinkSync(heroFrame);

if (result.status !== 0) {
  console.error(`❌ Pillow overlay failed`);
  process.exit(1);
}
console.log(`\n✅ ${outPath}`);
