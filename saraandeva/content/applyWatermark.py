#!/usr/bin/env python3
"""
Overlay the Sara and Eva channel watermark on a video (or batch).

Default: top-right corner, watermark scaled to 10% of frame width,
75% opacity, 24px padding from the edges. Stream-copies audio.

Usage:
    python3 content/applyWatermark.py input.mp4
    python3 content/applyWatermark.py input.mp4 -o branded.mp4
    python3 content/applyWatermark.py season_01/episode_07/*.mp4
    python3 content/applyWatermark.py --pos bl --scale 0.08 --opacity 0.6 in.mp4
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WATERMARK = ROOT / "saraandeva" / "assets" / "branding" / "video_watermark.png"

POSITIONS = {
    "tr": ("main_w-overlay_w-{p}", "{p}"),                  # top-right
    "tl": ("{p}",                  "{p}"),                  # top-left
    "br": ("main_w-overlay_w-{p}", "main_h-overlay_h-{p}"), # bottom-right
    "bl": ("{p}",                  "main_h-overlay_h-{p}"), # bottom-left
}


def apply(src: Path, dst: Path, pos: str, scale: float, opacity: float, pad: int) -> None:
    if not WATERMARK.exists():
        sys.exit(f"watermark not found: {WATERMARK}")
    x_expr, y_expr = (e.format(p=pad) for e in POSITIONS[pos])
    fc = (
        f"[1:v]format=rgba,colorchannelmixer=aa={opacity}[wma];"
        f"[wma][0:v]scale2ref=w='iw*{scale}':h='ow/mdar'[wms][bg];"
        f"[bg][wms]overlay={x_expr}:{y_expr}:format=auto"
    )
    cmd = [
        "ffmpeg", "-y", "-i", str(src), "-i", str(WATERMARK),
        "-filter_complex", fc,
        "-c:a", "copy",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(dst),
    ]
    print(f"🎬 {src.name} → {dst.name}  ({pos}, scale={scale}, opacity={opacity})")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-1500:])
        sys.exit(f"ffmpeg failed for {src}")
    print(f"  ✅ {dst}  ({dst.stat().st_size/1024/1024:.1f} MB)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+", help="Input video file(s)")
    ap.add_argument("-o", "--output", help="Explicit output path (only for single input)")
    ap.add_argument("--pos", choices=POSITIONS, default="tr", help="Watermark corner")
    ap.add_argument("--scale", type=float, default=0.10, help="Width as fraction of frame width")
    ap.add_argument("--opacity", type=float, default=0.75, help="0-1")
    ap.add_argument("--pad", type=int, default=24, help="Pixel padding from edges")
    ap.add_argument("--suffix", default="_wm", help="Filename suffix when -o not given")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found in PATH")

    inputs = [Path(p) for p in args.inputs]
    if args.output and len(inputs) != 1:
        sys.exit("-o only valid with a single input")

    for src in inputs:
        if not src.exists():
            print(f"⚠️  skip (missing): {src}", file=sys.stderr)
            continue
        dst = Path(args.output) if args.output else src.with_name(f"{src.stem}{args.suffix}{src.suffix}")
        apply(src, dst, args.pos, args.scale, args.opacity, args.pad)


if __name__ == "__main__":
    main()
