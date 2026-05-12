#!/usr/bin/env python3
"""
Bubble Guppies-style multiple-choice overlay — adds 3 option boxes + highlight
ring to a rendered Kling clip in post-production.

Reads `questionBeat` field from clip JSON:
  {
    "question": "How many stars do you see?",
    "options": ["3 stars", "5 stars", "7 stars"],
    "correctIndex": 1,
    "displayHighlightAtSec": 5.0
  }

Output: clip with 3 option boxes appearing at 2s, highlight ring on correct
at displayHighlightAtSec.

Usage:
  python3 addQuestionOverlay.py --episode 14 --clip 18
  python3 addQuestionOverlay.py path/to/clip.mp4 --question-json path/to/q.json --out out.mp4
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("!! PIL/Pillow required. Install: pip install Pillow", file=sys.stderr); sys.exit(2)

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
W, H = 1280, 720
BOX_W, BOX_H = 280, 110
BOX_Y = H - 200  # bottom area
BOX_GAP = 30
BOX_BG = (255, 245, 220, 230)   # warm cream
BOX_BORDER = (240, 165, 80, 255)  # peachy orange
TEXT_COLOR = (60, 40, 30, 255)
HIGHLIGHT_RING = (50, 200, 100, 255)  # green
RING_THICKNESS = 8


def find_font(size: int) -> ImageFont.ImageFont:
    for candidate in [
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
    ]:
        if Path(candidate).is_file():
            try: return ImageFont.truetype(candidate, size)
            except Exception: pass
    return ImageFont.load_default()


def render_options_png(options: list[str], highlight_idx: int = -1, out_path: Path = None) -> Path:
    """Render the 3 option boxes as a transparent PNG. highlight_idx=-1 means no ring."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    total_w = 3 * BOX_W + 2 * BOX_GAP
    start_x = (W - total_w) // 2
    font = find_font(40)
    for i, opt in enumerate(options[:3]):
        x = start_x + i * (BOX_W + BOX_GAP)
        d.rounded_rectangle((x, BOX_Y, x + BOX_W, BOX_Y + BOX_H), radius=20, fill=BOX_BG, outline=BOX_BORDER, width=4)
        # Center text
        bbox = d.textbbox((0, 0), opt, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        d.text((x + (BOX_W - tw) // 2, BOX_Y + (BOX_H - th) // 2 - 4), opt, fill=TEXT_COLOR, font=font)
        # Highlight ring on correct option
        if i == highlight_idx:
            d.rounded_rectangle(
                (x - 6, BOX_Y - 6, x + BOX_W + 6, BOX_Y + BOX_H + 6),
                radius=24, outline=HIGHLIGHT_RING, width=RING_THICKNESS,
            )
    if out_path is None:
        tf = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        out_path = Path(tf.name)
        tf.close()
    img.save(out_path, "PNG")
    return out_path


def build_overlay(clip_mp4: Path, qb: dict, out_mp4: Path):
    """ffmpeg overlay: options appear at 2s, highlight at displayHighlightAtSec."""
    options = qb["options"]
    correct = qb["correctIndex"]
    highlight_at = float(qb.get("displayHighlightAtSec", 5.0))

    options_png = render_options_png(options, highlight_idx=-1)
    highlight_png = render_options_png(options, highlight_idx=correct)

    # ffmpeg filter: overlay options PNG from t=2s to t=highlight_at, then highlight PNG from highlight_at onward
    # Use enable= expressions to gate visibility per timestamp window
    filter_complex = (
        f"[0:v][1:v]overlay=enable='between(t,2,{highlight_at})'[v1];"
        f"[v1][2:v]overlay=enable='gte(t,{highlight_at})'[v2]"
    )
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(clip_mp4),
        "-i", str(options_png),
        "-i", str(highlight_png),
        "-filter_complex", filter_complex,
        "-map", "[v2]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "fast", "-crf", "19",
        "-c:a", "copy",
        str(out_mp4),
    ]
    rc = subprocess.call(cmd)
    options_png.unlink(missing_ok=True)
    highlight_png.unlink(missing_ok=True)
    if rc != 0:
        print(f"!! ffmpeg failed (rc={rc})", file=sys.stderr); sys.exit(rc)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, default=None)
    ap.add_argument("--clip", "-c", default=None)
    ap.add_argument("--in", dest="in_path", default=None, help="input mp4 path (alternative to --episode/--clip)")
    ap.add_argument("--question-json", default=None, help="JSON file with question/options/correctIndex/displayHighlightAtSec")
    ap.add_argument("--out", default=None, help="output mp4 path; default: <in>.with_overlay.mp4")
    args = ap.parse_args()

    if args.episode and args.clip:
        ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
        clip_mp4 = ep_dir / "clips" / f"{args.clip}.mp4"
        spec = json.loads((ep_dir / f"{args.clip}.json").read_text())
        qb = spec.get("questionBeat")
        if not qb:
            print(f"!! clip {args.clip} has no questionBeat field in spec", file=sys.stderr); sys.exit(2)
        out_mp4 = Path(args.out) if args.out else (ep_dir / "clips" / f"{args.clip}_overlay.mp4")
    elif args.in_path and args.question_json:
        clip_mp4 = Path(args.in_path)
        qb = json.loads(Path(args.question_json).read_text())
        out_mp4 = Path(args.out) if args.out else clip_mp4.with_name(clip_mp4.stem + "_overlay.mp4")
    else:
        print("Usage: addQuestionOverlay.py --episode N --clip C  OR  --in clip.mp4 --question-json q.json", file=sys.stderr)
        sys.exit(1)

    if not clip_mp4.is_file():
        print(f"!! input mp4 not found: {clip_mp4}", file=sys.stderr); sys.exit(2)

    print(f"Overlaying question on {clip_mp4.name}:")
    print(f"  Q: {qb['question']}")
    print(f"  options: {qb['options']}  (correct={qb['correctIndex']})")
    print(f"  highlight at: {qb.get('displayHighlightAtSec', 5.0)}s")
    build_overlay(clip_mp4, qb, out_mp4)
    print(f"  ✓ {out_mp4}")


if __name__ == "__main__":
    main()
