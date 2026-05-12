#!/usr/bin/env python3
"""
Build a music-video block: take N short visual clips, concat them into one
unique segment, loop the segment to fill a target duration, lay a Suno
song over the entire output.

Replaces the inline ffmpeg dance from this session's ep15 build (clips
19+20+21first4s × 4 loops = 96s with Hiding By Candy.mp3). Reusable for
every episode's music block.

Each input clip can be specified with optional time slicing:
    19              full clip (default)
    19:0-4          first 4 seconds only (e.g. before dialog starts)
    19:2-8          seconds 2 through 8

The script:
  1. Re-encodes each input to 1280×720@30fps h264 with consistent params
     (concat without re-encode often loses frames if codec params differ)
  2. Concats them into one "unique segment"
  3. Loops the segment N times (computed from --duration)
  4. Mixes the Suno song mp3 (also looped if needed) over full output
  5. Saves to output path

Usage:
  python3 buildMusicBlock.py --episode 14 \\
      --clips 19,20,21:0-4 \\
      --song content/episodes/ep14/anniversary_song.mp3 \\
      --duration 120 \\
      --out content/episodes/ep14/clips/19.5.mp4

Defaults:
  --episode required (used to resolve clip paths if relative)
  --clips required
  --song required (path)
  --duration 96 (seconds, ~1:36)
  --out content/episodes/ep<NN>/clips/<first-clip>.5.mp4
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")


def parse_clip_spec(spec: str, episode: int) -> tuple[Path, float | None, float | None]:
    """
    19            → (path, None, None)         — full clip
    19:0-4        → (path, 0.0, 4.0)            — slice
    19:2-8        → (path, 2.0, 8.0)
    /abs/path.mp4 → (path, None, None)
    """
    if "/" in spec or spec.endswith(".mp4"):
        # absolute path
        m = re.match(r"^(.+?\.mp4)(?::(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?))?$", spec)
        if not m: raise ValueError(f"can't parse clip spec: {spec}")
        return Path(m.group(1)), (float(m.group(2)) if m.group(2) else None), (float(m.group(3)) if m.group(3) else None)
    # Match: numeric ('19'), decimal ('7.5'), letter clip ('A', 'B'), optional :start-end slice
    m = re.match(r"^([A-Z]|\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?))?$", spec)
    if not m: raise ValueError(
        f"can't parse clip spec: {spec!r}. Accepted: '19' / '7.5' / 'A' / '/abs/path.mp4' "
        f"(any with optional ':start-end' slice)"
    )
    n, st, et = m.group(1), m.group(2), m.group(3)
    p = PROJECT_ROOT / "content" / "episodes" / f"ep{episode:02d}" / "clips" / f"{n}.mp4"
    return p, (float(st) if st else None), (float(et) if et else None)


def normalize(input_path: Path, start: float | None, end: float | None,
              output_path: Path, width: int = 1280, height: int = 720, fps: int = 30):
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    if start is not None:
        cmd += ["-ss", f"{start:.2f}"]
    if end is not None:
        dur = (end - (start or 0))
        cmd += ["-t", f"{dur:.2f}"]
    cmd += ["-i", str(input_path),
            "-vf", f"scale={width}:{height},fps={fps}",
            "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "19",
            "-pix_fmt", "yuv420p",
            str(output_path)]
    rc = subprocess.call(cmd)
    if rc != 0: raise RuntimeError(f"normalize failed for {input_path}")


def probe_duration(mp4: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                        "-of", "csv=p=0", str(mp4)], capture_output=True, text=True, timeout=20)
    try: return float(r.stdout.strip())
    except ValueError: return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--clips", required=True,
                    help="comma-list of clip specs, e.g. '19,20,21:0-4'")
    ap.add_argument("--song", required=True, help="path to Suno mp3")
    ap.add_argument("--duration", "-d", type=float, default=96.0,
                    help="target duration in seconds (default 96 = 1:36)")
    ap.add_argument("--out", default=None,
                    help="output mp4 path. Default: <ep_dir>/clips/<first>.5.mp4")
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=720)
    ap.add_argument("--fps", type=int, default=30)
    args = ap.parse_args()

    song_path = Path(args.song)
    if not song_path.is_file():
        print(f"!! song not found: {song_path}", file=sys.stderr); sys.exit(1)

    # Parse clip specs
    specs = [parse_clip_spec(s.strip(), args.episode) for s in args.clips.split(",")]
    for p, _, _ in specs:
        if not p.is_file():
            print(f"!! clip not found: {p}", file=sys.stderr); sys.exit(1)

    work = Path(f"/tmp/musicblock_{args.episode}_{int(__import__('time').time())}")
    work.mkdir(parents=True, exist_ok=True)

    # 1. Normalize each input clip (so concat works without frame loss)
    print(f"normalizing {len(specs)} input clip(s)...")
    norm_paths = []
    for i, (src, start, end) in enumerate(specs):
        np = work / f"{i:02d}_{src.stem}_norm.mp4"
        normalize(src, start, end, np, args.width, args.height, args.fps)
        d = probe_duration(np)
        print(f"  ✓ [{i}] {src.name} → {d:.2f}s")
        norm_paths.append(np)

    # 2. Concat into one unique segment
    concat_list = work / "concat.txt"
    concat_list.write_text("\n".join(f"file '{p}'" for p in norm_paths))
    unique_seg = work / "unique.mp4"
    rc = subprocess.call(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                          "-i", str(concat_list), "-c:v", "copy", str(unique_seg)])
    if rc != 0: print("!! concat failed", file=sys.stderr); sys.exit(1)
    seg_dur = probe_duration(unique_seg)
    print(f"unique segment: {seg_dur:.2f}s")

    # 3. Compute loop count + final visual duration
    if seg_dur <= 0:
        print("!! unique segment duration is 0", file=sys.stderr); sys.exit(1)
    loops_needed = max(1, int(round(args.duration / seg_dur)))
    final_visual_dur = loops_needed * seg_dur
    print(f"looping × {loops_needed} → {final_visual_dur:.2f}s (target {args.duration}s)")

    looped_visual = work / "looped.mp4"
    rc = subprocess.call(["ffmpeg", "-y", "-loglevel", "error",
                          "-stream_loop", str(loops_needed - 1), "-i", str(unique_seg),
                          "-t", str(args.duration), "-c:v", "copy", str(looped_visual)])
    if rc != 0: print("!! loop failed", file=sys.stderr); sys.exit(1)

    # 4. Resolve output path
    if args.out:
        out = Path(args.out)
    else:
        first = specs[0][0].stem
        out = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}" / "clips" / f"{first}.5.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)

    # 5. Mix song over visual
    rc = subprocess.call(["ffmpeg", "-y", "-loglevel", "error",
                          "-i", str(looped_visual),
                          "-stream_loop", "-1", "-i", str(song_path),
                          "-t", str(args.duration),
                          "-map", "0:v:0", "-map", "1:a:0",
                          "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
                          str(out)])
    if rc != 0: print("!! song mix failed", file=sys.stderr); sys.exit(1)

    final_dur = probe_duration(out)
    size_mb = out.stat().st_size / 1024 / 1024
    print(f"\n✅ {out}")
    print(f"   {final_dur:.2f}s · {size_mb:.1f} MB · {loops_needed}× loop of {seg_dur:.2f}s segment")


if __name__ == "__main__":
    main()
