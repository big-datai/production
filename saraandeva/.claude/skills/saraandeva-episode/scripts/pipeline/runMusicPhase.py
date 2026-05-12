#!/usr/bin/env python3
"""
Music-block phase helper. For each letter clip in episode.json's musicBlock,
resolve the matching Suno mp3, call loopVideoWithSong.mjs to produce
<LETTER>_with_audio.mp4. Skip-with-warning per-clip if the source mp4 or
mp3 is missing — never fails the pipeline.

Called by runEpisodePipeline.py phase 9 as a single subprocess so the
runtime mp3/mp4 checks happen at exec time, not at orchestrator startup.

Usage:
  python3 runMusicPhase.py --episode 15 [--duration 30]

Exit codes:
  0  all letter clips processed (or none expected)
  2  hard failure (ffmpeg/loopVideoWithSong returned error)
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
SCRIPTS = PROJECT_ROOT / ".claude" / "skills" / "saraandeva-episode" / "scripts"
# loopVideoWithSong.py lives in pipeline/ alongside this script
LOOP_SCRIPT = PROJECT_ROOT / ".claude" / "skills" / "saraandeva-episode" / "scripts" / "pipeline" / "loopVideoWithSong.py"


def find_mp3(ep_dir: Path, song_lyric_path: str):
    if not song_lyric_path: return None
    name = Path(song_lyric_path).stem.replace("lyrics_", "")
    candidates = [
        ep_dir / f"{name}.mp3",
        ep_dir / f"{name.replace('_', ' ')}.mp3",
        PROJECT_ROOT / "assets" / "music" / f"{name}.mp3",
        PROJECT_ROOT / "assets" / "music" / f"{name.replace('_', ' ').title()}.mp3",
    ]
    for c in candidates:
        if c.is_file(): return c
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--duration", type=int, default=30)
    args = ap.parse_args()

    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
    ep_json = ep_dir / "episode.json"
    if not ep_json.is_file():
        print(f"!! episode.json not found: {ep_json}", file=sys.stderr)
        sys.exit(1)

    meta = json.loads(ep_json.read_text())
    music_block = meta.get("musicBlock", {})
    letters = music_block.get("clips") or []
    if not letters:
        print("(no letter clips in musicBlock; nothing to do)")
        sys.exit(0)

    mp3 = find_mp3(ep_dir, music_block.get("songLyric"))
    print(f"music phase ep{args.episode:02d}")
    print(f"  letters: {letters}")
    print(f"  mp3: {mp3 or '(none)'}")

    if not mp3:
        print(f"⚠ no Suno mp3 found for {music_block.get('songLyric')!r}; skipping music phase")
        sys.exit(0)

    any_failed = False
    for letter in letters:
        src = ep_dir / "clips" / f"{letter}.mp4"
        if not src.is_file():
            print(f"⚠ {letter}.mp4 not rendered yet, skipping")
            continue
        out = ep_dir / "clips" / f"{letter}_with_audio.mp4"
        if out.is_file() and out.stat().st_size > 100_000:
            print(f"✓ {out.name} already exists, skipping")
            continue
        cmd = ["python3", str(LOOP_SCRIPT),
               str(src), str(mp3), str(out), f"--duration={args.duration}"]
        print(f"\n→ {' '.join(cmd[:3])} {letter}.mp4 → {out.name}")
        rc = subprocess.call(cmd)
        if rc != 0:
            print(f"✗ loopVideoWithSong returned {rc} for {letter}", file=sys.stderr)
            any_failed = True
        elif not out.is_file() or out.stat().st_size < 100_000:
            print(f"✗ {out.name} not produced or too small", file=sys.stderr)
            any_failed = True
        else:
            print(f"✓ {out.name} OK ({out.stat().st_size // 1024} KB)")

    sys.exit(2 if any_failed else 0)


if __name__ == "__main__":
    main()
