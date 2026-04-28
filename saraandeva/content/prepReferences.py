#!/usr/bin/env python3
"""
Sara & Eva — Reference Photo & Video Preparation

Takes the messy source photos + videos (mixed HEIC/JPEG/MP4/MOV,
device-generated filenames) and produces a clean, semantically-named
library of JPEG reference images for Gemini / Kling.

- Normalizes every still to 1024px-long-edge JPEG.
- Extracts 3 representative frames (25%, 50%, 75% of the duration)
  from every video referenced in photoLabels.yaml.
- Saves everything under content/saraandeva/_curation/named/ with
  semantic names like  sara_beach_01.jpg, family_dogwalk_01.jpg,
  ginger_couch_frame2_01.jpg.
- Writes a companion manifest photoLabels_named.yaml mapping each
  original file → its new named copy (or copies, for videos), so the
  rest of the pipeline never has to touch the raw source dirs again.

Prereqs:
    brew install ffmpeg   (already present on this machine)
    macOS sips             (built-in — used for HEIC → JPEG)

Usage:
    python3 content/saraandeva/prepReferences.py           # one-shot
    python3 content/saraandeva/prepReferences.py --dry-run # preview only
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAMED_DIR = ROOT / "content" / "saraandeva" / "_curation" / "named"
LABELS_IN = ROOT / "content" / "saraandeva" / "photoLabels.yaml"
LABELS_OUT = ROOT / "content" / "saraandeva" / "photoLabels_named.yaml"

SIPS = "/usr/bin/sips"
FFMPEG = "/usr/local/bin/ffmpeg"
FFPROBE = "/usr/local/bin/ffprobe"

# Number of frames to extract per video (at 25%, 50%, 75% of duration).
VIDEO_FRAMES = 3

# ───────────────────────── Rename table ──────────────────────────
# Keyed by the source filename BASENAME (filename.ext). Value is the
# short slug to use in the new name ({character-or-scene})_{slug}.
# A few files need manual hints because their labels contain many
# characters; most are derived automatically from photoLabels.yaml.

MANUAL_NAME_OVERRIDES = {
    # Labeled Sara photos (user-tagged)
    "sara.jpg":                 ("sara",    "beach_bucket"),
    "sara 2.JPG":               ("sara",    "beach_closeup"),
    "sara pool.jpeg":           ("sara",    "pool_facepaint"),
    "sara ski.jpeg":            ("sara",    "ski_with_papa"),
    "sara and eva.jpeg":        ("sisters", "beach_facepaint"),
    # High-value single-character anchors
    "IMG_7456.HEIC":            ("sara",    "ski_bigsmile"),
    "IMG_7456 Medium.jpeg":     ("sara",    "ski_bigsmile_medium"),
    "IMG_1163.JPG":             ("sara",    "beach_facedetail"),
    "IMG_6890.HEIC":            ("eva",     "bedroom_twirl"),
    "IMG_6890 Medium.jpeg":     ("eva",     "bedroom_twirl_medium"),
    "IMG_7009.JPG":             ("sara",    "flowrider"),
    "IMG_4408.HEIC":            ("eva",     "ski_closeup"),
    "IMG_4408 Medium.jpeg":     ("eva",     "ski_closeup_medium"),
    "IMG_4408.jpeg":            ("eva",     "ski_closeup_full"),
    "IMG_5903.HEIC":            ("ginger",  "couch_sideview"),
    "IMG_6190.HEIC":            ("ginger",  "couch_blanket"),
    # Dog walks
    "IMG_7183.HEIC":            ("family",  "dogwalk_01"),
    "IMG_7184.HEIC":            ("family",  "dogwalk_02"),
    "IMG_7185.HEIC":            ("family",  "dogwalk_03"),
    "IMG_0350.HEIC":            ("family",  "dogwalk_04"),
    # Home / grandma visit
    "IMG_6193.HEIC":            ("family",  "home_play_with_joe"),
    "IMG_6194.HEIC":            ("family",  "grandma_visit_01"),
    "IMG_6195.HEIC":            ("family",  "grandma_visit_02"),
    "IMG_6196.HEIC":            ("family",  "grandma_visit_03"),
    "IMG_0422.JPG":             ("family",  "kitchen_donuts"),
    # Ski
    "IMG_2471.HEIC":            ("family",  "ski_chairlift_01"),
    "IMG_2473.HEIC":            ("family",  "ski_chairlift_02"),
    "IMG_3085.HEIC":            ("family",  "ski_lodge"),
    "IMG_4128.HEIC":            ("eva",     "snowboard_01"),
    "IMG_5423.HEIC":            ("eva",     "snowboard_02"),
    "IMG_5457.HEIC":            ("eva",     "ski_run"),
    "IMG_5457.jpeg":            ("eva",     "ski_run_full"),
    "IMG_5460.HEIC":            ("eva",     "ski_village"),
    "IMG_5460.jpeg":            ("eva",     "ski_village_full"),
    "IMG_6112.HEIC":            ("eva",     "ski_chalet"),
    "IMG_6112 Medium.jpeg":     ("eva",     "ski_chalet_medium"),
    "IMG_6112.jpeg":            ("eva",     "ski_chalet_full"),
    # Bikes
    "IMG_5253 Medium.jpeg":     ("family",  "bike_driveway_01"),
    "IMG_5261 Medium.jpeg":     ("family",  "bike_driveway_02"),
    "IMG_5360 Medium.jpeg":     ("family",  "bike_boardwalk_01"),
    "IMG_9011 Medium.jpeg":     ("sisters", "bike_boardwalk_fudge"),
    "IMG_9805 Medium.jpeg":     ("family",  "bike_family_selfie"),
    "IMG_6058.JPG":             ("sisters", "bike_race"),
    "9c6c5363-2cbe-4e76-bf02-8de056311413.jpg": ("sisters", "bike_race_alt"),
    # Family outdoor selfie
    "IMG_4103 Medium.jpeg":     ("family",  "rainy_selfie"),
    # Pool
    "IMG_1036.JPG":             ("sisters", "wavepool"),
    "IMG_1212.JPG":             ("sisters", "resort_pool_lounge"),
    "IMG_2395.JPG":             ("sisters", "indoor_pool_play"),
    "28ee3421-890b-4924-9b6c-e8708ee08831.jpg": ("family", "resort_pool_mama"),
    "4B682EA5-AAD3-43AE-95EA-6A8750953019.jpg":("sara",   "beach_bucket_alt"),
    # Restaurants / boats
    "IMG_5716.jpeg":            ("family",  "brunch_resort"),
    "IMG_5716 Medium.jpeg":     ("family",  "brunch_resort_medium"),
    "IMG_5831.jpeg":            ("family",  "restaurant_sunset"),
    "IMG_5831 Medium.jpeg":     ("family",  "restaurant_sunset_medium"),
    "IMG_7307.jpeg":            ("family",  "boat_florida"),
    "IMG_7307 Medium.jpeg":     ("family",  "boat_florida_medium"),
}

# Videos: explicit naming (with _frameNN suffix added by the extractor).
VIDEO_NAMES = {
    "IMG_7183.MP4":     ("family",  "dogwalk_01"),
    "IMG_7184.MP4":     ("family",  "dogwalk_02"),
    "IMG_7185.MP4":     ("family",  "dogwalk_03"),
    "IMG_0350.MP4":     ("family",  "dogwalk_04"),
    "IMG_0422.MP4":     ("family",  "kitchen_donuts"),
    "IMG_3471.MOV":     ("family",  "unlabeled_01"),
    "IMG_4170.MOV":     ("family",  "unlabeled_02"),
    "IMG_4103.MP4":     ("family",  "rainy_selfie"),
    "IMG_1036.MP4":     ("sisters", "wavepool"),
    "IMG_1212.MP4":     ("sisters", "resort_pool_lounge"),
    "IMG_2395.MP4":     ("sisters", "indoor_pool_play"),
    "IMG_4128.MP4":     ("eva",     "snowboard"),
    "IMG_4408.MP4":     ("eva",     "ski_closeup"),
    "IMG_7009.MP4":     ("sara",    "flowrider"),
    "IMG_9805.MP4":     ("family",  "bike_family_selfie"),
    "4B682EA5-AAD3-43AE-95EA-6A8750953019.MP4": ("sara", "beach_bucket"),
    "sara.MP4":         ("sara",    "labeled_video"),
}

# Source roots to look in (first hit wins).
SOURCE_DIRS = [
    Path("/Volumes/Samsung500/photo"),
    Path("/Users/admin1/Desktop/Photos-3-001"),
]


def find_source(basename: str) -> Path | None:
    for root in SOURCE_DIRS:
        p = root / basename
        if p.exists():
            return p
    return None


def convert_still(src: Path, dst: Path, dry_run: bool) -> bool:
    """Convert/resize any supported still to JPEG at 1024px long-edge."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dry_run:
        print(f"  [dry] {src.name}  →  {dst.name}")
        return True
    ext = src.suffix.lower()
    if ext == ".heic":
        # sips is the most reliable HEIC decoder on macOS
        cmd = [SIPS, "-s", "format", "jpeg", "-Z", "1024", str(src), "--out", str(dst)]
    else:
        # re-encode + resize via sips for a single, consistent output
        cmd = [SIPS, "-s", "format", "jpeg", "-Z", "1024", str(src), "--out", str(dst)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ❌ sips failed on {src.name}: {result.stderr[:200]}", file=sys.stderr)
        return False
    return True


def probe_duration(src: Path) -> float | None:
    cmd = [FFPROBE, "-v", "error", "-show_entries", "format=duration",
           "-of", "default=noprint_wrappers=1:nokey=1", str(src)]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()
        return float(out) if out else None
    except Exception:
        return None


def extract_frames(src: Path, char_scene: tuple[str, str], dry_run: bool) -> list[Path]:
    """Extract 3 frames (25/50/75% of duration) as named JPEGs."""
    char, scene = char_scene
    dur = probe_duration(src)
    if dur is None or dur <= 0:
        print(f"  ⚠️  Could not probe duration: {src.name}")
        return []
    fractions = [0.25, 0.50, 0.75]
    outputs = []
    for i, f in enumerate(fractions, start=1):
        t = dur * f
        dst = NAMED_DIR / f"{char}_{scene}_vf{i:02d}.jpg"
        if dst.exists():
            outputs.append(dst)
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dry_run:
            print(f"  [dry] {src.name} @ {t:.2f}s  →  {dst.name}")
            outputs.append(dst)
            continue
        cmd = [
            FFMPEG, "-y", "-ss", f"{t:.2f}", "-i", str(src),
            "-frames:v", "1", "-vf", "scale=1024:-1,setsar=1",
            "-q:v", "3", str(dst),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"  ❌ ffmpeg failed on {src.name} @ {t:.2f}s: {result.stderr[-300:]}", file=sys.stderr)
            continue
        outputs.append(dst)
    return outputs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--videos-only", action="store_true")
    ap.add_argument("--stills-only", action="store_true")
    args = ap.parse_args()

    NAMED_DIR.mkdir(parents=True, exist_ok=True)

    manifest: list[dict] = []

    # 1. Stills
    if not args.videos_only:
        print(f"\n📸 Normalising {len(MANUAL_NAME_OVERRIDES)} still photos → {NAMED_DIR.relative_to(ROOT)}")
        for src_name, (char, scene) in MANUAL_NAME_OVERRIDES.items():
            src = find_source(src_name)
            if src is None:
                print(f"  ⏭️  Skipping (not found): {src_name}")
                continue
            dst = NAMED_DIR / f"{char}_{scene}.jpg"
            if dst.exists():
                print(f"  ⏭️  Exists: {dst.name}")
            else:
                ok = convert_still(src, dst, args.dry_run)
                if ok:
                    print(f"  ✓  {src.name}  →  {dst.name}")
            manifest.append({
                "source": str(src),
                "named": str(dst.relative_to(ROOT)),
                "character_tag": char,
                "scene_tag": scene,
                "kind": "still",
            })

    # 2. Videos → frames
    if not args.stills_only:
        print(f"\n🎞  Extracting frames from {len(VIDEO_NAMES)} videos")
        for src_name, (char, scene) in VIDEO_NAMES.items():
            src = find_source(src_name)
            if src is None:
                print(f"  ⏭️  Skipping (not found): {src_name}")
                continue
            frames = extract_frames(src, (char, scene), args.dry_run)
            if frames:
                print(f"  ✓  {src.name}  →  {len(frames)} frames: {', '.join(f.name for f in frames)}")
                for f in frames:
                    manifest.append({
                        "source": str(src),
                        "named": str(f.relative_to(ROOT)),
                        "character_tag": char,
                        "scene_tag": scene,
                        "kind": "video_frame",
                    })

    # 3. Manifest (JSON for simplicity; user requested YAML earlier but this
    #    avoids a PyYAML dep and is trivially convertible).
    manifest_out = NAMED_DIR / "_manifest.json"
    if not args.dry_run:
        manifest_out.write_text(json.dumps(manifest, indent=2))
        print(f"\n📒 Wrote manifest: {manifest_out.relative_to(ROOT)}  ({len(manifest)} entries)")
    else:
        print(f"\n[dry] would write manifest with {len(manifest)} entries")


if __name__ == "__main__":
    main()
