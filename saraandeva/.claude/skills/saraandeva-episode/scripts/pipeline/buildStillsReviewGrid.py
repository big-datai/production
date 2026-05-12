#!/usr/bin/env python3
"""
Composite every per-clip nano still into a single labeled master grid for
human eyeball review BEFORE paying Kling for video renders.

Inserts as pipeline phase 4.7 between automated validation (phase 8) and
Kling submit (phase 10). Per 2026-05-12 user directive — "after all
validations and stills created i will eye check them for next episode".

Output: /tmp/stills_review_ep<NN>.jpg  + auto-opens in default app.

Usage:
    python3 buildStillsReviewGrid.py --episode 16
    python3 buildStillsReviewGrid.py --episode 16 --cols 5 --cell-w 480
    python3 buildStillsReviewGrid.py --episode 16 --no-open
"""
from __future__ import annotations
import argparse
import io
import json
import re
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")


def find_still(ep_dir: Path, n: int) -> Path | None:
    stills = ep_dir / "stills"
    if not stills.is_dir(): return None
    for pat in (f"clip_{n:02d}_*.png", f"clip_{n}_*.png"):
        m = sorted(p for p in stills.glob(pat) if p.is_file() and "old" not in p.parts)
        if m: return m[0]
    return None


def collect_clips(ep_dir: Path) -> list[dict]:
    out = []
    for fp in sorted(ep_dir.iterdir()):
        if not re.fullmatch(r"\d+\.json", fp.name): continue
        try: d = json.loads(fp.read_text())
        except Exception: continue
        n = int(fp.stem)
        still = find_still(ep_dir, n)
        if not still: continue
        out.append({
            "n": n, "still": still,
            "subjects": d.get("subjects") or [],
            "scene": d.get("scene") or "?",
            "duration": d.get("durationSec", 5),
            "nativeAudio": d.get("nativeAudio", False),
        })
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--cell-w", type=int, default=560)
    ap.add_argument("--cell-h", type=int, default=315)
    ap.add_argument("--no-open", action="store_true")
    args = ap.parse_args()

    from PIL import Image, ImageDraw, ImageFont

    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
    if not ep_dir.is_dir():
        print(f"!! {ep_dir} missing", file=sys.stderr); sys.exit(2)

    clips = collect_clips(ep_dir)
    if not clips:
        print("!! no stills found", file=sys.stderr); sys.exit(2)

    rows = (len(clips) + args.cols - 1) // args.cols
    cell_w, cell_h = args.cell_w, args.cell_h
    label_h = 72  # space for clip info below image
    grid = Image.new("RGB",
                     (args.cols * cell_w, rows * (cell_h + label_h)),
                     color=(28, 28, 32))
    try:
        font_big = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 28)
        font_sm  = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
    except OSError:
        font_big = font_sm = ImageFont.load_default()

    draw = ImageDraw.Draw(grid)
    for i, c in enumerate(clips):
        col, row = i % args.cols, i // args.cols
        x0 = col * cell_w
        y0 = row * (cell_h + label_h)
        # Image
        try:
            img = Image.open(c["still"]).convert("RGB")
            img.thumbnail((cell_w, cell_h), Image.LANCZOS)
            grid.paste(img, (x0 + (cell_w - img.width) // 2,
                             y0 + (cell_h - img.height) // 2))
        except Exception as e:
            print(f"  ⚠ clip {c['n']}: {e}", file=sys.stderr)
        # Label box below image
        label_y = y0 + cell_h
        sound_tag = "🔊" if c["nativeAudio"] else "🔇"
        line1 = f"clip_{c['n']:<3} {c['duration']}s {sound_tag}"
        line2 = f"{','.join(c['subjects'])}  ·  {c['scene']}"
        draw.text((x0 + 12, label_y + 6),  line1, fill=(255, 255, 100), font=font_big)
        draw.text((x0 + 12, label_y + 40), line2[:65], fill=(220, 220, 220), font=font_sm)

    out_path = Path(f"/tmp/stills_review_ep{args.episode:02d}.jpg")
    grid.save(out_path, "JPEG", quality=88)
    sz_mb = out_path.stat().st_size / 1024 / 1024
    print(f"✓ {len(clips)} stills composited → {out_path}  ({sz_mb:.1f} MB, "
          f"{args.cols}×{rows})")

    if not args.no_open:
        subprocess.Popen(["open", str(out_path)])
        print(f"  ↪ opened in default viewer (Preview)")
    print()
    print("Review each cell. If a still looks wrong:")
    print(f"  1. Re-render: python3 _render_ep{args.episode:02d}_nano_stills.py --only <N>")
    print(f"  2. Re-run validation: python3 preSubmitValidation.py --episode {args.episode}")
    print(f"  3. Re-run this grid: python3 buildStillsReviewGrid.py --episode {args.episode}")
    print()
    print(f"When ALL stills look correct:")
    print(f"  python3 runEpisodePipeline.py --episode {args.episode} --start-from 10")


if __name__ == "__main__":
    main()
