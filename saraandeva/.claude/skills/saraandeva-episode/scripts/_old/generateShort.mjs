#!/usr/bin/env node
/**
 * Generate a vertical YouTube Short for a Sara & Eva episode.
 *
 * Codifies the recipe used ad-hoc through ep08-ep10:
 *   1. 1080×1920 designed background (pastel pink → lavender gradient)
 *   2. Burned-in title (top, yellow Impact) + handle (bottom, white)
 *   3. Source video scaled to fill 1080 width (~1.78× zoom from 1280×720)
 *      and center-cropped to 1080×1280, overlaid centered y=320
 *   4. Source's audio preserved
 *
 * Default source: the C music-video segment (18.5.mp4) which is already
 * loop-built and song-paired. Can override.
 *
 * Usage:
 *   node generateShort.mjs --episode=10 --title "Magic Forest!"
 *   node generateShort.mjs --episode=10 --title "..." --source 12.5.mp4 --duration 60
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
  console.error("Usage: generateShort.mjs <episode_dir> | --episode=NN  --title \"TITLE\"  [--source 18.5.mp4] [--duration 60] [--handle @SaraAndEva]");
  process.exit(1);
}

const title = flags.title;
if (!title) {
  console.error(`❌ --title required (e.g. --title "Sara & Eva: Magic Forest!")`);
  process.exit(1);
}
const handle = flags.handle ?? "@SaraAndEva";
const duration = Number(flags.duration ?? 60);
const sourceFilename = flags.source ?? "18.5.mp4";
const sourcePath = path.join(epDir, "clips", sourceFilename);
if (!fs.existsSync(sourcePath)) {
  console.error(`❌ source clip not found: ${sourcePath}`);
  console.error(`   Common defaults: 4.5.mp4 (MV-A), 12.5.mp4 (MV-B), 18.5.mp4 (MV-C)`);
  process.exit(1);
}
const outPath = flags.out ?? path.join(epDir, `ep${String(epNum).padStart(2, "0")}_short.mp4`);

console.log(`📱 Vertical short recipe`);
console.log(`   source:    ${sourceFilename}`);
console.log(`   duration:  ${duration}s`);
console.log(`   title:     "${title}"`);
console.log(`   handle:    "${handle}"`);
console.log(`   out:       ${outPath}`);

// 1) Generate gradient BG with burned-in text via Pillow
const bgPath = `/tmp/ep${epNum}_short_bg_${Date.now()}.png`;
const py = `
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W, H = 1080, 1920
img = Image.new("RGB", (W, H))
top = (255, 200, 220); bot = (200, 180, 255)
px = img.load()
for y in range(H):
    t = y / (H - 1)
    r = int(top[0]*(1-t) + bot[0]*t)
    g = int(top[1]*(1-t) + bot[1]*t)
    b = int(top[2]*(1-t) + bot[2]*t)
    for x in range(W):
        px[x, y] = (r, g, b)
font_path = "/System/Library/Fonts/Supplemental/Impact.ttf"
title_font = ImageFont.truetype(font_path, 80)
handle_font = ImageFont.truetype(font_path, 54)
draw = ImageDraw.Draw(img)
def text_centered(t, font, y, fill=(255,255,255), stroke=6):
    bbox = draw.textbbox((0,0), t, font=font, stroke_width=stroke)
    w = bbox[2] - bbox[0]
    x = (W - w) // 2
    draw.text((x, y), t, font=font, fill=fill, stroke_width=stroke, stroke_fill=(0,0,0))
text_centered(${JSON.stringify(title)}, title_font, 110, fill=(255,214,10), stroke=8)
text_centered(${JSON.stringify(handle)}, handle_font, 1730, fill=(255,255,255), stroke=4)
img.save("${bgPath}")
print("bg saved")
`;
const pyRes = spawnSync("python3", ["-c", py], { stdio: ["ignore", "pipe", "inherit"] });
if (pyRes.status !== 0) {
  console.error(`❌ Pillow BG generation failed`);
  process.exit(1);
}

// 2) ffmpeg overlay video onto bg
const ff = spawnSync("ffmpeg", [
  "-y",
  "-loop", "1", "-t", String(duration), "-i", bgPath,
  "-i", sourcePath,
  "-filter_complex",
  "[1:v]scale=-1:1280,crop=1080:1280:(iw-1080)/2:0[vid];[0:v][vid]overlay=0:320[vout]",
  "-map", "[vout]", "-map", "1:a", "-t", String(duration),
  "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k",
  "-shortest",
  outPath,
], { stdio: ["ignore", "ignore", "inherit"] });
fs.unlinkSync(bgPath);
if (ff.status !== 0) {
  console.error(`❌ ffmpeg short composition failed`);
  process.exit(1);
}
const stat = fs.statSync(outPath);
console.log(`\n✅ ${outPath} (${(stat.size/1024/1024).toFixed(1)} MB)`);
