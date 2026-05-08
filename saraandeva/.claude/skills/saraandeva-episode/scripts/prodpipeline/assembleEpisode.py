#!/usr/bin/env python3
"""
Assemble a Sara & Eva episode MP4: prepend reusable intro clips, concat
the episode's numbered unique clips in order, append reusable outro clips.

Each clip preprocessing:
  - 0.15s start trim (suppress Kling scene-pop)
  - scale + center-crop to 1280×720
  - 30fps, libx264 crf 19, AAC 44.1k stereo

Numbered clips sorted numerically (1.mp4..N.mp4 + decimal music inserts
like 8.5.mp4). Gaps in sequence skipped silently.

Outro sort note: "0_song.mp4" sorts LAST due to int parsing fallback to
infinity (JS quirk preserved here): subscribe-wave (17) → button-point (18)
→ 0_song (final flourish).

Faithful Python port of assembleEpisode.mjs.

Usage:
  python3 assembleEpisode.py <output.mp4> --clips-dir <dir> [--intro-dir <dir>] [--outro-dir <dir>]
"""
import argparse
import re
import subprocess
import sys
import time
from pathlib import Path


TRIM_START = 0.15


def normalize(input_path: Path, output_path: Path, trim: float = TRIM_START):
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-ss", str(trim), "-i", str(input_path),
        "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,fps=30",
        "-af", "aresample=44100",
        "-c:v", "libx264", "-preset", "fast", "-crf", "19", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        str(output_path),
    ]
    rc = subprocess.call(cmd)
    if rc != 0: raise RuntimeError(f"ffmpeg normalize failed for {input_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("output", help="output mp4 path")
    ap.add_argument("--clips-dir", required=True)
    ap.add_argument("--intro-dir", default=None)
    ap.add_argument("--outro-dir", default=None)
    args = ap.parse_args()

    out_path = Path(args.output).resolve()
    clips_dir = Path(args.clips_dir).resolve()
    intro_dir = Path(args.intro_dir).resolve() if args.intro_dir else None
    outro_dir = Path(args.outro_dir).resolve() if args.outro_dir else None

    if not clips_dir.is_dir():
        print(f"❌ clips dir not found: {clips_dir}", file=sys.stderr); sys.exit(1)

    work = Path(f"/tmp/assemble-{int(time.time()*1000)}")
    work.mkdir(parents=True, exist_ok=True)

    parts: list[Path] = []
    idx = 1

    # ─── INTRO ────────────────────────────────────────────────────────
    if intro_dir and intro_dir.is_dir():
        intro_files = sorted([p.name for p in intro_dir.iterdir()
                              if p.suffix.lower() == ".mp4" and not p.name.startswith(".")])
        ordered = []
        for nm in ["intro_song.mp4", "intro_sara.mp4", "intro_eva.mp4", "intro_mama.mp4"]:
            if nm in intro_files: ordered.append(nm)
        for f in intro_files:
            if f not in ordered: ordered.append(f)
        print(f"📼 Intro ({len(ordered)} clips from {intro_dir}):")
        for f in ordered:
            out = work / f"{idx:03d}_intro_{Path(f).stem}.mp4"
            normalize(intro_dir / f, out)
            parts.append(out)
            print(f"  ✓ {f}")
            idx += 1

    # ─── BODY ─────────────────────────────────────────────────────────
    body_files = []
    for p in clips_dir.iterdir():
        if not p.is_file(): continue
        m = re.fullmatch(r"(\d+(?:\.\d+)?)\.mp4", p.name)
        if m: body_files.append((float(m.group(1)), p.name))
    body_files.sort(key=lambda x: x[0])

    print(f"\n📺 Body ({len(body_files)} numbered clips from {clips_dir}):")
    prev = 0
    for n, f in body_files:
        if n - prev > 1:
            for g in range(int(prev) + 1, int(n)):
                print(f"  ⊘ {g}.mp4 (missing — skipped)")
        prev = n
        out = work / f"{idx:03d}_body_{n}.mp4"
        normalize(clips_dir / f, out)
        parts.append(out)
        print(f"  ✓ {f}")
        idx += 1

    # ─── OUTRO ────────────────────────────────────────────────────────
    if outro_dir and outro_dir.is_dir():
        outro_files_raw = [p.name for p in outro_dir.iterdir()
                           if p.suffix.lower() == ".mp4" and not p.name.startswith(".")]
        # int parse fallback to infinity → "0_song" sorts last
        def sort_key(f):
            try: return int(f.split("_")[0].split(".")[0]) or float("inf")
            except ValueError: return float("inf")
        outro_files = sorted(outro_files_raw, key=sort_key)
        print(f"\n📼 Outro ({len(outro_files)} clips from {outro_dir}):")
        for f in outro_files:
            out = work / f"{idx:03d}_outro_{Path(f).stem}.mp4"
            normalize(outro_dir / f, out)
            parts.append(out)
            print(f"  ✓ {f}")
            idx += 1

    if not parts:
        print("❌ Nothing to assemble. Check --clips-dir.", file=sys.stderr); sys.exit(1)

    # ─── concat ──────────────────────────────────────────────────────
    concat_list = work / "concat.txt"
    concat_list.write_text("\n".join(f"file '{p}'" for p in parts))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"\n🎬 Concatenating {len(parts)} parts → {out_path}")
    rc = subprocess.call([
        "ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
        "-i", str(concat_list), "-c", "copy", str(out_path)
    ])
    if rc != 0:
        print("❌ ffmpeg concat failed", file=sys.stderr); sys.exit(1)

    dur_str = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(out_path)
    ]).decode().strip()
    try: dur = float(dur_str)
    except ValueError: dur = 0
    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"\n✅ {out_path}")
    print(f"   {len(parts)} clips · {int(dur//60)}:{int(round(dur))%60:02d} · {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
