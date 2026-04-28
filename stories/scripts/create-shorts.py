#!/usr/bin/env python3
"""
Create YouTube Shorts (Part 1 + Part 2) from Kling animated clips.
Uses pre-generated summaries from generate-story-summaries.mjs.

Usage:
    python3 scripts/create-shorts.py "Cinderella"       # one story
    python3 scripts/create-shorts.py --all              # all stories
    python3 scripts/create-shorts.py --all --dry-run    # preview
    python3 scripts/create-shorts.py --all --skip-audio # podcast audio

Prerequisites:
    node scripts/generate-story-summaries.mjs   # generates summaries.json

Output: exports/shorts/<SafeTitle>_short_part1.mp4, _short_part2.mp4
"""

import os
import sys
import json
import subprocess
import argparse
from pathlib import Path

STORIES_DIR = Path("exports/stories")
PUBLISHED_DIR = STORIES_DIR / "_published"
SHORTS_DIR = Path("exports/shorts")  # only used for summaries.json
FFMPEG = "/usr/local/bin/ffmpeg"
FFPROBE = "/usr/local/bin/ffprobe"
WIDTH = 1080
HEIGHT = 1920
MAX_DURATION = 59


def safe_title(title):
    return "".join(c if c.isalnum() or c == " " else "" for c in title).replace(" ", "_")


def find_story_dir(title):
    safe = safe_title(title)
    for d in [STORIES_DIR, PUBLISHED_DIR]:
        if not d.exists(): continue
        for f in d.iterdir():
            if f.name.startswith(safe + "_") and f.is_dir():
                return f
    return None


def find_animated_clips(story_dir):
    safe = story_dir.name.rsplit("_", 1)[0]
    anim_dir = story_dir / "youtube" / safe / "illustrations" / "animated"
    return sorted(anim_dir.glob("anim_*.mp4")) if anim_dir.exists() else []


def get_story_ids(title):
    seed = Path("content/podcast/seedBednightStories.mjs")
    if not seed.exists(): return None, None
    import re
    content = seed.read_text()
    yt_id = sp_id = None
    yt = re.search(r'const YOUTUBE_IDS = \{([\s\S]*?)\};', content)
    if yt:
        for m in re.finditer(r'"([^"]+)":\s*\'([^\']+)\'|\'([^\']+)\':\s*\'([^\']+)\'', yt.group(1)):
            if (m.group(1) or m.group(3)) == title: yt_id = m.group(2) or m.group(4)
    sp = re.search(r'const SPOTIFY_IDS = \{([\s\S]*?)\};', content)
    if sp:
        for m in re.finditer(r'"([^"]+)":\s*\'([^\']+)\'|\'([^\']+)\':\s*\'([^\']+)\'', sp.group(1)):
            if (m.group(1) or m.group(3)) == title: sp_id = m.group(2) or m.group(4)
    return yt_id, sp_id


def get_full_duration(story_dir):
    sd = story_dir / "spotify"
    if not sd.exists(): return ""
    mp3s = list(sd.glob("*.mp3"))
    if not mp3s: return ""
    try:
        d = float(subprocess.run([FFPROBE, "-v", "quiet", "-show_entries", "format=duration",
            "-of", "csv=p=0", str(mp3s[0])], capture_output=True, text=True, timeout=10).stdout.strip())
        return f"{int(d/60)} min"
    except: return ""


def find_all_stories_with_clips():
    results = []
    for d in [STORIES_DIR, PUBLISHED_DIR]:
        if not d.exists(): continue
        for f in d.iterdir():
            if f.name.startswith("_") or not f.is_dir(): continue
            if find_animated_clips(f):
                results.append((f.name.rsplit("_", 1)[0].replace("_", " "), f))
    return sorted(results)


def create_short(title, story_dir, dry_run=False, skip_audio=False):
    safe = safe_title(title)
    clips = find_animated_clips(story_dir)
    if not clips:
        print(f"  No animated clips")
        return None

    # Load summaries
    summaries_file = SHORTS_DIR / "summaries.json"
    parts_data = {}
    if not skip_audio and summaries_file.exists():
        summaries = json.loads(summaries_file.read_text())
        entry = summaries.get(title, {})
        for pk in ["part1", "part2"]:
            part = entry.get(pk, {})
            if part.get("audioPath") and Path(part["audioPath"]).exists():
                parts_data[pk] = part
                print(f"  {pk}: {part.get('wordCount','?')} words, {part.get('duration',0):.1f}s")
    if not parts_data:
        if not skip_audio:
            print(f"  No summaries — run: node scripts/generate-story-summaries.mjs")
        parts_data["part1"] = {"duration": MAX_DURATION}
        # Try podcast audio
        sd = story_dir / "spotify"
        if sd.exists():
            mp3s = list(sd.glob("*.mp3"))
            if mp3s: parts_data["part1"]["audioPath"] = str(mp3s[0])

    if dry_run:
        print(f"  DRY RUN — {len(parts_data)} part(s)")
        return None

    SHORTS_DIR.mkdir(parents=True, exist_ok=True)
    outputs = []

    for part_key, part_info in parts_data.items():
        audio_dur = min(part_info.get("duration", MAX_DURATION), MAX_DURATION)
        audio_path = Path(part_info["audioPath"]) if part_info.get("audioPath") else None

        # Split clips: Part 1 = first half, Part 2 = second half
        mid = len(clips) // 2
        if len(parts_data) == 2:
            part_clips = clips[:mid] if part_key == "part1" else clips[mid:]
        else:
            part_clips = clips

        # Calculate clip duration to fill audio
        cd = min(audio_dur / max(len(part_clips), 1), 5.0)
        cd = max(cd, 2.0)
        max_c = int(audio_dur / cd)
        if len(part_clips) > max_c:
            step = len(part_clips) / max_c
            selected = [part_clips[int(i * step)] for i in range(max_c)]
        else:
            selected = part_clips
            cd = audio_dur / max(len(selected), 1)

        total_dur = min(len(selected) * cd, MAX_DURATION)
        suffix = f"_{part_key}" if len(parts_data) == 2 else ""
        # Save in story folder: exports/stories/<dir>/shorts/
        shorts_dir = story_dir / "shorts"
        shorts_dir.mkdir(exist_ok=True)
        output = shorts_dir / f"{safe}_short{suffix}.mp4"
        print(f"  {part_key}: {len(selected)} clips x {cd:.1f}s = {total_dur:.0f}s")

        temp_dir = SHORTS_DIR / f"_temp_{safe}_{part_key}"
        temp_dir.mkdir(exist_ok=True)

        # Trim + scale clips to vertical
        trimmed = []
        for i, clip in enumerate(selected):
            t = temp_dir / f"c{i:03d}.mp4"
            subprocess.run([FFMPEG, "-y", "-i", str(clip), "-t", str(cd),
                "-vf", f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,crop={WIDTH}:{HEIGHT},setsar=1",
                "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p", "-an", str(t)],
                capture_output=True, timeout=30)
            trimmed.append(t)
        print(f"    {len(trimmed)} clips trimmed")

        # Concat
        cf = temp_dir / "concat.txt"
        cf.write_text("\n".join(f"file '{p.resolve()}'" for p in trimmed))

        # Assemble
        if audio_path and audio_path.exists():
            cmd = [FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(cf),
                "-i", str(audio_path), "-map", "0:v", "-map", "1:a",
                "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", "-t", str(total_dur), "-shortest", str(output)]
        else:
            cmd = [FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(cf),
                "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
                "-an", "-t", str(total_dur), str(output)]

        r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            print(f"  ffmpeg error: {r.stderr[-200:]}")

        # Cleanup
        for p in trimmed: p.unlink(missing_ok=True)
        cf.unlink(missing_ok=True)
        try: temp_dir.rmdir()
        except: pass

        if output.exists():
            sz = output.stat().st_size / 1024 / 1024
            print(f"  {output.name} ({sz:.1f} MB)")
            outputs.append(output)

    # Save description with pinned comment
    slug = safe.lower().replace("_", "-")
    yt_id, sp_id = get_story_ids(title)
    yt_link = f"https://www.youtube.com/watch?v={yt_id}" if yt_id else "https://www.youtube.com/@goreadling"
    sp_link = f"https://open.spotify.com/episode/{sp_id}" if sp_id else "https://open.spotify.com/show/5Xibl3BuCkhfxRJRu5v6ML"
    dur = get_full_duration(story_dir)

    # Save description in story shorts folder
    shorts_dir = story_dir / "shorts"
    shorts_dir.mkdir(exist_ok=True)
    desc = shorts_dir / f"{safe}_short_description.txt"
    desc.write_text(
        f"{title} — bedtime story in 60 seconds!\n\n"
        f"📖 Read along: https://goreadling.com/stories/{slug}\n"
        f"▶️ Full story ({dur}): {yt_link}\n"
        f"🎧 Spotify: {sp_link}\n"
        f"📱 iOS: https://apps.apple.com/app/goreadling/id6755505679\n"
        f"📱 Android: https://play.google.com/store/apps/details?id=com.goreadling.app\n\n"
        f"#bedtimestory #{slug.replace('-','')} #kidsstory #shorts #goreadling "
        f"#bedtimeforkids #storytime #fairytale\n\n"
        f"PINNED COMMENT:\n"
        f"Want the full story? ({dur}) {yt_link}\n"
        f"Read along with illustrations: https://goreadling.com/stories/{slug}\n"
        f"Get GoReadling free: https://apps.apple.com/app/goreadling/id6755505679\n"
    )

    return outputs[0] if outputs else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("title", nargs="?")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-audio", action="store_true")
    args = parser.parse_args()

    if not args.title and not args.all:
        parser.print_help()
        sys.exit(1)

    if args.all:
        stories = find_all_stories_with_clips()
        print(f"Creating shorts for {len(stories)} stories\n")
        created = 0
        for title, sd in stories:
            print(f"\n{title}")
            if create_short(title, sd, args.dry_run, args.skip_audio):
                created += 1
        print(f"\nDone! {created} stories processed")
    else:
        sd = find_story_dir(args.title)
        if not sd:
            print(f"Not found: {args.title}")
            sys.exit(1)
        create_short(args.title, sd, args.dry_run, args.skip_audio)


if __name__ == "__main__":
    main()
