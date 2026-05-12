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
    ap.add_argument("--song", default=None,
                    help="MP3 path to mix as background music bed. If omitted, "
                         "auto-resolves: <clips-dir>/../*.mp3 or assets/music/*.mp3. "
                         "Per lesson_every_episode_must_have_song.md, every episode "
                         "ships with a song bed mixed under the silent/montage clips.")
    ap.add_argument("--song-volume", type=float, default=0.30,
                    help="Background music volume (0.0-1.0). Default 0.30 so TTS "
                         "dialogue cuts cleanly through.")
    ap.add_argument("--no-song", action="store_true",
                    help="Skip music bed mix entirely (rare — use only when episode "
                         "is intentionally pure-dialogue).")
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

    # ─── Pad silent clips with silence track (prevents audio-bleed) ───
    # Per ep16 incident 2026-05-12: Kling clips with sound:"off" have NO audio
    # stream at all. ffmpeg concat with -c copy keeps the audio cursor at the
    # last audio-bearing clip, so dialogue from an earlier clip persists into
    # later silent video. Fix: every clip MUST have an audio stream whose
    # duration matches its video. Pad here so all `parts` are uniform.
    padded_parts = []
    for p in parts:
        try:
            v_dur = float(subprocess.check_output(
                ["ffprobe", "-v", "error", "-select_streams", "v",
                 "-show_entries", "stream=duration", "-of", "csv=p=0", str(p)]
            ).decode().strip())
            a_dur_raw = subprocess.check_output(
                ["ffprobe", "-v", "error", "-select_streams", "a",
                 "-show_entries", "stream=duration", "-of", "csv=p=0", str(p)]
            ).decode().strip()
            a_dur = float(a_dur_raw) if a_dur_raw else 0.0
        except Exception:
            padded_parts.append(p)
            continue
        if a_dur and abs(a_dur - v_dur) < 0.2:
            padded_parts.append(p)
            continue
        # silent or audio-shorter clip → pad with anullsrc
        padded = work / f"padded_{p.name}"
        rc = subprocess.call([
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(p),
            "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=44100",
            "-map", "0:v", "-map", "1:a",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
            str(padded),
        ])
        if rc == 0:
            print(f"  ⊕ padded silence: {p.name}")
            padded_parts.append(padded)
        else:
            padded_parts.append(p)   # fallback to unpadded if pad fails
    parts = padded_parts

    # ─── concat ──────────────────────────────────────────────────────
    concat_list = work / "concat.txt"
    concat_list.write_text("\n".join(f"file '{p}'" for p in parts))
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Resolve background song path (per lesson_every_episode_must_have_song.md).
    # Auto-search order: --song flag → <clips-dir>/../*.mp3 → assets/music/*.mp3
    song_path = None
    if not args.no_song:
        if args.song:
            song_path = Path(args.song)
        else:
            ep_root = Path(args.clips_dir).parent
            candidates = sorted(ep_root.glob("*.mp3")) or sorted(
                (Path(args.clips_dir).parents[2] / "assets" / "music").glob("*.mp3"))
            if candidates:
                song_path = candidates[0]
        if song_path and not song_path.is_file():
            print(f"⚠ song not found: {song_path}", file=sys.stderr)
            song_path = None

    if song_path:
        print(f"\n🎬 Concatenating {len(parts)} parts + music bed → {out_path}")
        print(f"   song: {song_path.name}  (volume={args.song_volume})")
        # Single ffmpeg pass: concat clips + loop song + amix with TTS audio
        cmd = ["ffmpeg", "-y", "-loglevel", "error",
               "-f", "concat", "-safe", "0", "-i", str(concat_list),
               "-i", str(song_path),
               "-filter_complex",
               f"[1:a]aloop=loop=-1:size=2e9,volume={args.song_volume}[bg];"
               f"[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]",
               "-map", "0:v", "-map", "[a]",
               "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
               str(out_path)]
    else:
        print(f"\n🎬 Concatenating {len(parts)} parts (no song bed) → {out_path}")
        cmd = ["ffmpeg", "-y", "-loglevel", "error",
               "-f", "concat", "-safe", "0",
               "-i", str(concat_list), "-c", "copy", str(out_path)]
    rc = subprocess.call(cmd)
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
