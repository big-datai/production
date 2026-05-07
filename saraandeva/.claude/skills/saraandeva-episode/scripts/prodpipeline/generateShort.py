#!/usr/bin/env python3
"""
Generate a vertical YouTube Short for a Sara & Eva episode.

Recipe:
  1. 1080×1920 designed background (pastel pink → lavender gradient)
  2. Burned-in title (top, yellow Impact) + handle (bottom, white)
  3. Source video scaled to fill 1080 width (~1.78× zoom from 1280×720)
     and center-cropped to 1080×1280, overlaid centered y=320
  4. Source's audio preserved

Faithful Python port of generateShort.mjs.

Usage:
  python3 generateShort.py --episode=10 --title "Magic Forest!"
  python3 generateShort.py --episode=10 --title "..." --source 12.5.mp4 --duration 60
"""
import argparse, subprocess, sys, time
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ep_dir_pos", nargs="?", default=None,
                    help="positional: explicit episode dir; otherwise --episode")
    ap.add_argument("--episode", type=int, default=None)
    ap.add_argument("--title", required=True)
    ap.add_argument("--handle", default="@SaraAndEva")
    ap.add_argument("--duration", type=float, default=60)
    ap.add_argument("--source", default="18.5.mp4")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    if args.ep_dir_pos:
        ep_dir = Path(args.ep_dir_pos).resolve()
        m = __import__("re").search(r"episode_(\d+)", ep_dir.name)
        ep_num = int(m.group(1)) if m else None
    elif args.episode is not None:
        ep_num = args.episode
        ep_dir = PROJECT_ROOT / "season_01" / f"episode_{ep_num:02d}"
    else:
        print("Usage: generateShort.py <episode_dir> | --episode=NN --title \"TITLE\" "
              "[--source 18.5.mp4] [--duration 60] [--handle @SaraAndEva]", file=sys.stderr)
        sys.exit(1)

    source_path = ep_dir / "clips" / args.source
    if not source_path.is_file():
        print(f"❌ source clip not found: {source_path}", file=sys.stderr)
        print(f"   Common defaults: 4.5.mp4 (MV-A), 12.5.mp4 (MV-B), 18.5.mp4 (MV-C)", file=sys.stderr)
        sys.exit(1)
    out_path = Path(args.out) if args.out else ep_dir / f"ep{ep_num:02d}_short.mp4"

    print(f"📱 Vertical short recipe")
    print(f"   source:    {args.source}")
    print(f"   duration:  {args.duration}s")
    print(f"   title:     \"{args.title}\"")
    print(f"   handle:    \"{args.handle}\"")
    print(f"   out:       {out_path}")

    # 1) Pillow background with burned-in text
    bg_path = Path(f"/tmp/ep{ep_num}_short_bg_{int(time.time()*1000)}.png")
    title_lit = repr(args.title)
    handle_lit = repr(args.handle)
    py_code = f'''
from PIL import Image, ImageDraw, ImageFont
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
text_centered({title_lit}, title_font, 110, fill=(255,214,10), stroke=8)
text_centered({handle_lit}, handle_font, 1730, fill=(255,255,255), stroke=4)
img.save("{bg_path}")
'''
    rc = subprocess.call(["python3", "-c", py_code])
    if rc != 0:
        print("❌ Pillow BG generation failed", file=sys.stderr); sys.exit(1)

    # 2) ffmpeg compose
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rc = subprocess.call([
        "ffmpeg", "-y",
        "-loop", "1", "-t", str(args.duration), "-i", str(bg_path),
        "-i", str(source_path),
        "-filter_complex",
        "[1:v]scale=-1:1280,crop=1080:1280:(iw-1080)/2:0[vid];[0:v][vid]overlay=0:320[vout]",
        "-map", "[vout]", "-map", "1:a", "-t", str(args.duration),
        "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(out_path),
    ])
    bg_path.unlink(missing_ok=True)
    if rc != 0:
        print("❌ ffmpeg short composition failed", file=sys.stderr); sys.exit(1)

    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"\n✅ {out_path} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
