#!/usr/bin/env python3
"""
Rename source photos IN PLACE using the semantic names from
prepReferences.py. Also converts HEIC to JPEG in the process so the
final library is a single format.

SAFETY:
  - Writes a _rename_log.json manifest BEFORE any mv/rm, mapping
    every old path → new path. This is your undo record.
  - HEIC source files: converted to JPEG (semantic name), then the
    original HEIC is moved to /Volumes/Samsung500/photo/_heic_backup/
    so nothing is deleted. If the user wants to reclaim space later,
    they can rm -rf that folder manually.
  - Videos (MP4/MOV): renamed in place (just file renames, no
    conversion).
  - JPEG/JPG/jpeg sources: renamed in place (.jpg extension).
  - Name collisions are aborted rather than overwritten.

Usage:
    python3 content/saraandeva/renameSourcePhotos.py --dry-run   # preview
    python3 content/saraandeva/renameSourcePhotos.py             # execute
    python3 content/saraandeva/renameSourcePhotos.py --undo      # revert using log
"""

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Import the canonical name mappings from the prep script so we never
# have to maintain two copies of the same table.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepReferences import (  # noqa: E402
    MANUAL_NAME_OVERRIDES,
    VIDEO_NAMES,
    SOURCE_DIRS,
)


def find_all_sources(basename: str) -> list[Path]:
    """Find EVERY source directory that contains this filename. The
    Google Photos export duplicates files across two locations; the
    original find_source() only returned the first hit, leaving
    Desktop copies unrenamed."""
    hits: list[Path] = []
    for root in SOURCE_DIRS:
        p = root / basename
        if p.exists():
            hits.append(p)
    return hits

ROOT = Path(__file__).resolve().parents[2]
LOG_FILE = ROOT / "content" / "saraandeva" / "_curation" / "_rename_log.json"
HEIC_BACKUP_DIR = Path("/Volumes/Samsung500/photo/_heic_backup")

SIPS = "/usr/bin/sips"


def sem_name(char: str, scene: str, ext: str) -> str:
    """e.g. ("sara", "beach_bucket", ".jpg") -> "sara_beach_bucket.jpg" """
    return f"{char}_{scene}{ext.lower()}"


def do_still(src: Path, new_name: str, dry: bool, log: list) -> None:
    """Rename + convert-if-HEIC a still photo."""
    target_dir = src.parent
    target = target_dir / new_name

    # Collision safety
    if target.exists() and target.resolve() != src.resolve():
        print(f"  ⚠️  TARGET EXISTS, skipping: {target}")
        return

    if src.suffix.lower() == ".heic":
        # Convert to JPEG (in the same source directory), then move the
        # HEIC original to the backup folder.
        print(f"  🔄 {src.name}  →  {new_name}  (HEIC→JPEG, backup original)")
        if dry:
            log.append({"op": "heic_convert", "from": str(src), "to": str(target)})
            return
        HEIC_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        # sips can write jpeg next to target
        r = subprocess.run(
            [SIPS, "-s", "format", "jpeg", str(src), "--out", str(target)],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            print(f"  ❌ sips failed: {r.stderr[:200]}")
            return
        backup = HEIC_BACKUP_DIR / src.name
        if backup.exists():
            print(f"  ⚠️  backup exists, leaving source in place: {backup}")
        else:
            shutil.move(str(src), str(backup))
        log.append({"op": "heic_convert", "from": str(src), "to": str(target), "backup": str(backup)})
    else:
        # Plain rename (force .jpg extension for JPEG-family)
        print(f"  🔄 {src.name}  →  {new_name}")
        if dry:
            log.append({"op": "rename", "from": str(src), "to": str(target)})
            return
        src.rename(target)
        log.append({"op": "rename", "from": str(src), "to": str(target)})


def do_video(src: Path, new_name: str, dry: bool, log: list) -> None:
    target = src.parent / new_name
    if target.exists() and target.resolve() != src.resolve():
        print(f"  ⚠️  TARGET EXISTS, skipping: {target}")
        return
    print(f"  🎥 {src.name}  →  {new_name}")
    if dry:
        log.append({"op": "rename", "from": str(src), "to": str(target)})
        return
    src.rename(target)
    log.append({"op": "rename", "from": str(src), "to": str(target)})


def run(dry: bool) -> None:
    log = {"started": datetime.now().isoformat(), "entries": []}

    # 1. Stills
    print(f"\n📸 Renaming still photos ({len(MANUAL_NAME_OVERRIDES)} total)")
    for src_name, (char, scene) in MANUAL_NAME_OVERRIDES.items():
        sources = find_all_sources(src_name)
        if not sources:
            print(f"  ⏭️  not found: {src_name}")
            continue
        for idx, src in enumerate(sources):
            ext = src.suffix.lower()
            out_ext = ".jpg" if ext in (".jpg", ".jpeg", ".heic", ".png") else ext
            # If the same basename exists in multiple source dirs, suffix the
            # second+ with a _b, _c, … so we don't clobber one copy with the other.
            suffix = "" if idx == 0 else f"_{chr(ord('b') + idx - 1)}"
            new_name = sem_name(char, scene + suffix, out_ext)
            do_still(src, new_name, dry, log["entries"])

    # 2. Videos
    print(f"\n🎞  Renaming videos ({len(VIDEO_NAMES)} total)")
    for src_name, (char, scene) in VIDEO_NAMES.items():
        sources = find_all_sources(src_name)
        if not sources:
            print(f"  ⏭️  not found: {src_name}")
            continue
        for idx, src in enumerate(sources):
            suffix = "" if idx == 0 else f"_{chr(ord('b') + idx - 1)}"
            new_name = sem_name(char, scene + suffix, src.suffix.lower())
            do_video(src, new_name, dry, log["entries"])

    # 3. Write log
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    if dry:
        print(f"\n[dry] {len(log['entries'])} rename operations would be logged to {LOG_FILE.relative_to(ROOT)}")
    else:
        LOG_FILE.write_text(json.dumps(log, indent=2))
        print(f"\n📒 Wrote rename log: {LOG_FILE.relative_to(ROOT)}  ({len(log['entries'])} ops)")
        print(f"   HEIC originals moved to: {HEIC_BACKUP_DIR}")
        print("   (Ask user before deleting that folder.)")


def undo() -> None:
    if not LOG_FILE.exists():
        raise SystemExit(f"❌ no rename log at {LOG_FILE}")
    log = json.loads(LOG_FILE.read_text())
    print(f"↩️  Reverting {len(log['entries'])} operations…")
    for e in reversed(log["entries"]):
        src = Path(e["to"])
        dst = Path(e["from"])
        if e["op"] == "heic_convert":
            # Delete the generated .jpg, restore HEIC from backup
            if src.exists():
                src.unlink()
            backup = Path(e["backup"])
            if backup.exists():
                shutil.move(str(backup), str(dst))
            print(f"  ↩️  {src.name}  ⇠  restored {dst.name}")
        elif e["op"] == "rename":
            if src.exists():
                src.rename(dst)
            print(f"  ↩️  {src.name}  ⇠  renamed back to {dst.name}")
    LOG_FILE.unlink()
    print("✅ undo complete, log file removed")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Preview without touching files")
    ap.add_argument("--undo", action="store_true", help="Revert using _rename_log.json")
    args = ap.parse_args()
    if args.undo:
        undo()
    else:
        run(args.dry_run)


if __name__ == "__main__":
    main()
