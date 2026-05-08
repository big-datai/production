#!/usr/bin/env python3
"""
Generate a YouTube thumbnail for a Sara & Eva episode.

Recipe:
  1. Extract a hero frame from chosen clip at chosen timestamp
  2. Apply title text (Impact, yellow #FFD60A, black stroke + Gaussian blur shadow) — top center
  3. Apply handle "Sara & Eva" (white, black stroke) — bottom right
  4. Save as ep<NN>_thumbnail.jpg

Faithful Python port of generateThumbnail.mjs.

Usage:
  python3 generateThumbnail.py --episode=10 --title "MAGIC FOREST!"
  python3 generateThumbnail.py --episode=10 --title "..." --hero=14 --time=3.0
  python3 generateThumbnail.py <ep_dir> --title "..." [--subtitle "Sara & Eva"]
"""
import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ep_dir_pos", nargs="?", default=None)
    ap.add_argument("--episode", type=int, default=None)
    ap.add_argument("--title", required=True)
    ap.add_argument("--subtitle", default="Sara & Eva")
    ap.add_argument("--hero", default="14")
    ap.add_argument("--time", type=float, default=3.0)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    if args.ep_dir_pos:
        ep_dir = Path(args.ep_dir_pos).resolve()
        m = re.search(r"episode_(\d+)", ep_dir.name)
        ep_num = int(m.group(1)) if m else None
    elif args.episode is not None:
        ep_num = args.episode
        ep_dir = PROJECT_ROOT / "season_01" / f"episode_{ep_num:02d}"
    else:
        print("Usage: generateThumbnail.py <ep_dir> | --episode=NN --title \"...\" "
              "[--hero=14] [--time=3.0] [--subtitle \"Sara & Eva\"] [--out path.jpg]",
              file=sys.stderr)
        sys.exit(1)

    if not ep_dir.is_dir():
        print(f"❌ episode dir not found: {ep_dir}", file=sys.stderr); sys.exit(1)
    clips_dir = ep_dir / "clips"
    if not clips_dir.is_dir():
        print(f"❌ clips dir not found: {clips_dir}", file=sys.stderr); sys.exit(1)

    out_path = Path(args.out).resolve() if args.out else ep_dir / f"ep{ep_num:02d}_thumbnail.jpg"
    hero_path = clips_dir / f"{args.hero}.mp4"
    if not hero_path.is_file():
        print(f"❌ hero clip not found: {hero_path}", file=sys.stderr)
        avail = ", ".join(sorted(p.name for p in clips_dir.glob("*.mp4")))
        print(f"   Available: {avail}", file=sys.stderr)
        sys.exit(1)

    print("🖼  Thumbnail recipe")
    print(f"   hero clip:   {args.hero}.mp4 @ {args.time}s")
    print(f"   title:       \"{args.title}\"")
    print(f"   subtitle:    \"{args.subtitle}\"")
    print(f"   out:         {out_path}")

    # 1) Extract hero frame at 1280×720
    hero_frame = Path(f"/tmp/ep{ep_num}_hero_{int(time.time()*1000)}.jpg")
    rc = subprocess.call([
        "ffmpeg", "-y", "-ss", str(args.time), "-i", str(hero_path),
        "-frames:v", "1", "-vf", "scale=1280:720", str(hero_frame)
    ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    if rc != 0:
        print("❌ ffmpeg frame extract failed", file=sys.stderr); sys.exit(1)

    # 2) Pillow overlay
    title_lit = repr(args.title)
    sub_lit = repr(args.subtitle)
    out_lit = repr(str(out_path))
    src_lit = repr(str(hero_frame))
    py_code = f'''
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
src = {src_lit}
out = {out_lit}
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
title = {title_lit}
sub = {sub_lit}
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
print(f"saved {{out}} ({{os.path.getsize(out)/1024:.1f}} KB)")
'''
    rc = subprocess.call(["python3", "-c", py_code])
    hero_frame.unlink(missing_ok=True)
    if rc != 0:
        print("❌ Pillow overlay failed", file=sys.stderr); sys.exit(1)
    print(f"\n✅ {out_path}")


if __name__ == "__main__":
    main()
