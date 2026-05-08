#!/usr/bin/env python3
"""
Merge a (short) dance video looped to fill a target duration with a song
(trimmed if longer than the duration).

  video → looped infinitely on input, capped by -t
  audio → trimmed to duration if longer; if shorter, output ends with silence

Source video's own audio track is dropped — only the provided song is used.

Faithful Python port of loopVideoWithSong.mjs.

Usage:
  python3 loopVideoWithSong.py <video> <audio> <output> [--duration=60] [--audio-start=0]
"""
import argparse
import subprocess
import sys
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(allow_abbrev=False)
    ap.add_argument("video")
    ap.add_argument("audio")
    ap.add_argument("output")
    ap.add_argument("--duration", type=float, default=60)
    ap.add_argument("--audio-start", type=float, default=0)
    args = ap.parse_args()

    video = Path(args.video).resolve()
    audio = Path(args.audio).resolve()
    output = Path(args.output).resolve()

    for p in (video, audio):
        if not p.is_file():
            print(f"❌ Not found: {p}", file=sys.stderr)
            sys.exit(1)
    if args.duration <= 0:
        print(f"❌ Invalid --duration: {args.duration}", file=sys.stderr)
        sys.exit(1)

    output.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-y", "-loglevel", "error", "-stats",
        "-stream_loop", "-1", "-i", str(video),
        *(["-ss", str(args.audio_start)] if args.audio_start > 0 else []),
        "-i", str(audio),
        "-t", str(args.duration),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        str(output),
    ]

    print(f"🎬 video:    {video}")
    print(f"🎵 audio:    {audio}")
    print(f"⏱  duration: {args.duration}s")
    print(f"💾 output:   {output}")

    rc = subprocess.call(cmd)
    if rc != 0:
        print(f"\n❌ ffmpeg exited {rc}", file=sys.stderr)
        sys.exit(rc)
    print(f"\n✅ {output}")


if __name__ == "__main__":
    main()
