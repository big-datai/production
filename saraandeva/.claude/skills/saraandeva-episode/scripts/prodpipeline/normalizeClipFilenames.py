#!/usr/bin/env python3
"""
Rename `clip_<N>.mp4` → `<N>.mp4` (and `clip_<N>_v<M>.mp4` → `<N>.mp4` keeping
highest version) so assembleEpisode's `^\\d+(\\.\\d+)?\\.mp4$` regex picks them up.

Faithful Python port of normalizeClipFilenames.mjs.

Usage:
  python3 normalizeClipFilenames.py <clips_dir>

Backs up displaced files to <clips_dir>/.originals/ before overwriting.
"""
import re, shutil, sys
from pathlib import Path


def main():
    if len(sys.argv) < 2:
        print("Usage: normalizeClipFilenames.py <clips_dir>", file=sys.stderr)
        sys.exit(1)
    clips_dir = Path(sys.argv[1]).resolve()
    if not clips_dir.is_dir():
        print(f"!! not a directory: {clips_dir}", file=sys.stderr)
        sys.exit(1)

    pat = re.compile(r"^clip_(\d+(?:\.\d+)?)(?:_v(\d+))?\.mp4$")
    groups: dict[str, list[tuple[str, int]]] = {}
    for f in clips_dir.iterdir():
        m = pat.match(f.name)
        if not m: continue
        n = m.group(1)
        v = int(m.group(2)) if m.group(2) else 0
        groups.setdefault(n, []).append((f.name, v))

    if not groups:
        print("(no clip_*.mp4 files to normalize)")
        sys.exit(0)

    backup_dir = clips_dir / ".originals"
    backup_dir.mkdir(exist_ok=True)

    renamed = 0
    for n, lst in groups.items():
        lst.sort(key=lambda x: x[1], reverse=True)   # highest version first
        winner_name, _ = lst[0]
        target = clips_dir / f"{n}.mp4"

        if target.is_file():
            shutil.move(str(target), str(backup_dir / f"{n}.mp4.was"))

        shutil.move(str(clips_dir / winner_name), str(target))
        print(f"  {winner_name}  →  {n}.mp4")
        renamed += 1

        for loser_name, _ in lst[1:]:
            shutil.move(str(clips_dir / loser_name), str(backup_dir / loser_name))
            print(f"    (archived {loser_name})")

    print(f"\n{renamed} clip(s) normalized. Backups in .originals/")


if __name__ == "__main__":
    main()
