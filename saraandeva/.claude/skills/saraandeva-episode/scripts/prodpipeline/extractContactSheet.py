#!/usr/bin/env python3
"""
Extract a 2×2 contact sheet (4 frames at 10/35/65/90% timestamps) from an
mp4 for fast visual QA. Used by the agent + manually after each render to
spot-check character consistency, ghost characters, costume drift before
spending more.

Per `lesson_claude_visual_audit_before_ready.md` — agent must visually
audit clip frames before declaring "ready". This script makes that one
command instead of inline bash.

Usage:
  python3 extractContactSheet.py path/to/clip.mp4
  python3 extractContactSheet.py clip.mp4 --out /tmp/sheet.jpg
  python3 extractContactSheet.py clip.mp4 --timestamps 0.1,0.35,0.65,0.9
  python3 extractContactSheet.py --episode 15 --clip 17     # convenience
"""
import argparse, subprocess, sys
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")


def probe_duration(mp4: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(mp4)],
        capture_output=True, text=True, timeout=20)
    try: return float(r.stdout.strip())
    except ValueError: return 0.0


def extract_sheet(mp4: Path, out: Path, fractions: list[float], width: int = 480):
    duration = probe_duration(mp4)
    if duration <= 0:
        print(f"!! cannot probe duration of {mp4}", file=sys.stderr); sys.exit(1)
    timestamps = [duration * f for f in fractions]

    # Build ffmpeg command — N -ss/-i pairs + filter_complex
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    for t in timestamps:
        cmd += ["-ss", f"{t:.2f}", "-i", str(mp4)]

    n = len(timestamps)
    if n == 4:
        # 2×2 grid: hstack two pairs, then vstack
        fc = (
            f"[0:v]scale={width}:-1[a];"
            f"[1:v]scale={width}:-1[b];"
            f"[2:v]scale={width}:-1[c];"
            f"[3:v]scale={width}:-1[d];"
            f"[a][b]hstack[ab];[c][d]hstack[cd];[ab][cd]vstack"
        )
    elif n == 2:
        fc = f"[0:v]scale={width}:-1[a];[1:v]scale={width}:-1[b];[a][b]hstack"
    else:
        # generic 1×N hstack
        labels = "".join(f"[{i}:v]scale={width}:-1[v{i}];" for i in range(n))
        chain = "".join(f"[v{i}]" for i in range(n))
        fc = f"{labels}{chain}hstack=inputs={n}"

    cmd += ["-filter_complex", fc, "-frames:v", "1", str(out)]
    rc = subprocess.call(cmd)
    if rc != 0:
        print(f"!! ffmpeg failed (rc={rc})", file=sys.stderr); sys.exit(rc)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mp4_or_first", nargs="?", default=None,
                    help="path to mp4 (positional)")
    ap.add_argument("--episode", "-e", type=int, default=None)
    ap.add_argument("--clip", "-c", type=int, default=None,
                    help="clip number (with --episode); reads content/episodes/ep<NN>/clips/<N>.mp4")
    ap.add_argument("--out", default=None, help="output jpg (default: /tmp/<stem>_sheet.jpg)")
    ap.add_argument("--timestamps", default="0.1,0.35,0.65,0.9",
                    help="comma-list of fractions of clip duration (default 4-frame)")
    ap.add_argument("--width", type=int, default=480)
    args = ap.parse_args()

    if args.episode is not None and args.clip is not None:
        mp4 = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}" / "clips" / f"{args.clip}.mp4"
    elif args.mp4_or_first:
        mp4 = Path(args.mp4_or_first).resolve()
    else:
        print("Usage: extractContactSheet.py <mp4> | --episode N --clip M", file=sys.stderr); sys.exit(1)

    if not mp4.is_file():
        print(f"!! {mp4} not found", file=sys.stderr); sys.exit(1)

    out = Path(args.out) if args.out else Path(f"/tmp/{mp4.stem}_sheet.jpg")
    fractions = [float(x.strip()) for x in args.timestamps.split(",")]

    out_path = extract_sheet(mp4, out, fractions, args.width)
    print(f"✓ {out_path}")


if __name__ == "__main__":
    main()
