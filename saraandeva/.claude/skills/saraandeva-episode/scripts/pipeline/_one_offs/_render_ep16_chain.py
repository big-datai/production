#!/usr/bin/env python3
"""Chain-render ep16 nano stills with scene continuity.

User directive 2026-05-12: instead of each clip rendering against the same
canonical scene PNG (which Nano interprets differently each call → drift),
each clip should use the PREVIOUS clip in the same scene group as its
scene anchor. This creates a continuity chain within each scene.

Plus: every render uses the latest LOCKED character avatars (eva_front.png,
ep16_eva_front.png, etc. — golden-blonde Eva canon).

Algorithm:
    For each clip N to render (in order):
        prev_n = max(c < N where clip[c].scene == clip[N].scene)
        if prev_n exists:
            copy stills/clip_<prev_n>_*.png → assets/scenes/<scene_id>.png
        else:
            keep canonical assets/scenes/<scene_id>.png as-is
        call _render_ep16_nano_stills.py --only N

Each scene group ends up with a tight visual chain because every new render
references the prior render in the chain.

Usage:
    python3 _render_ep16_chain.py                # render clips 11..22 by default
    python3 _render_ep16_chain.py --start 11 --end 22
    python3 _render_ep16_chain.py --only 11,19,20
    python3 _render_ep16_chain.py --dry-run
"""
from __future__ import annotations
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
EP = 16
EP_DIR = PROJECT / "content" / "episodes" / f"ep{EP:02d}"
STILLS_DIR = EP_DIR / "stills"
SCENE_DIR = PROJECT / "assets" / "scenes"
RENDER_SCRIPT = (PROJECT / ".claude/skills/saraandeva-episode/scripts/pipeline"
                 / "_one_offs/_render_ep16_nano_stills.py")

SCENE_TO_FILE = {
    "ep16-bathroom-mirror":       "ep16_bathroom_mirror",
    "ep16-evas-bedroom-night":    "ep16_evas_bedroom_night",
    "ep16-living-room-detective": "ep16_living_room_detective",
    "kitchen_morning":            "kitchen_morning",
}


def find_still(clip_n: int) -> Path | None:
    """Resolve stills/clip_<NN>_*.png (with backup-folder filter)."""
    for pat in (f"clip_{clip_n:02d}_*.png", f"clip_{clip_n}_*.png"):
        matches = sorted(p for p in STILLS_DIR.glob(pat)
                         if p.is_file() and "old" not in p.parts)
        if matches: return matches[0]
    return None


def load_scenes_map() -> dict[int, str]:
    """Returns {clip_n: scene_tag} for every numeric clip in the episode."""
    out: dict[int, str] = {}
    for fp in sorted(EP_DIR.iterdir()):
        if not re.fullmatch(r"\d+\.json", fp.name): continue
        try: d = json.loads(fp.read_text())
        except Exception: continue
        out[int(fp.stem)] = d.get("scene") or "(no_scene)"
    return out


def prev_in_scene(target: int, scenes: dict[int, str]) -> int | None:
    """Highest clip number < target sharing the same scene tag."""
    target_scene = scenes.get(target)
    if not target_scene: return None
    candidates = [c for c, s in scenes.items() if c < target and s == target_scene]
    return max(candidates) if candidates else None


def install_scene_anchor(scene_tag: str, anchor_png: Path,
                         backup_dir: Path) -> Path | None:
    """Copy anchor PNG to assets/scenes/<scene_id>.png. Returns backup path
    of the original (or None if no original existed)."""
    scene_id = SCENE_TO_FILE.get(scene_tag, scene_tag)
    dest = SCENE_DIR / f"{scene_id}.png"
    backup = None
    if dest.is_file():
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup = backup_dir / f"{scene_id}.png"
        shutil.copy(dest, backup)
    shutil.copy(anchor_png, dest)
    return backup


def restore_scenes(backups: dict[str, Path]):
    """Put canonical scene PNGs back after chain run."""
    for scene_id, backup in backups.items():
        dest = SCENE_DIR / f"{scene_id}.png"
        if backup and backup.is_file():
            shutil.copy(backup, dest)


def render_clip(clip_n: int, dry_run: bool) -> bool:
    cmd = ["python3", str(RENDER_SCRIPT), "--only", str(clip_n)]
    if dry_run:
        print(f"  [dry-run] would call: {' '.join(cmd)}")
        return True
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    ok = "ok" in r.stdout and r.returncode == 0
    if not ok:
        print(f"  ✗ clip {clip_n} render failed:\n{r.stdout[-400:]}\n{r.stderr[-400:]}",
              file=sys.stderr)
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--start", type=int, default=11, help="first clip (inclusive)")
    ap.add_argument("--end",   type=int, default=22, help="last clip (inclusive)")
    ap.add_argument("--only", help="comma-list of specific clips to render")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.only:
        clip_range = sorted(int(c.strip()) for c in args.only.split(",") if c.strip())
    else:
        clip_range = list(range(args.start, args.end + 1))

    scenes = load_scenes_map()
    backup_dir = Path(f"/tmp/scene_anchors_backup_ep{EP:02d}")
    original_backups: dict[str, Path] = {}

    print(f"━━━ Chain-render ep{EP:02d} stills ━━━")
    print(f"  Clips:    {clip_range}")
    print(f"  Mode:     {'DRY-RUN' if args.dry_run else 'LIVE'}")
    print(f"  Backups:  {backup_dir}")
    print()

    ok_count = fail_count = 0
    for n in clip_range:
        scene_tag = scenes.get(n)
        if not scene_tag:
            print(f"  ⚠ clip {n}: no scene tag in spec — skipping")
            continue
        prev = prev_in_scene(n, scenes)
        if prev is not None:
            anchor = find_still(prev)
            if anchor:
                scene_id = SCENE_TO_FILE.get(scene_tag, scene_tag)
                # Save canonical backup once per scene
                if scene_id not in original_backups:
                    dest = SCENE_DIR / f"{scene_id}.png"
                    if dest.is_file():
                        backup_dir.mkdir(parents=True, exist_ok=True)
                        b = backup_dir / f"{scene_id}.png"
                        shutil.copy(dest, b)
                        original_backups[scene_id] = b
                shutil.copy(anchor, SCENE_DIR / f"{scene_id}.png")
                print(f"  ▶ clip {n:>2} ({scene_tag}): anchor = clip_{prev} still ({anchor.name[:50]})")
            else:
                print(f"  ⚠ clip {n}: prev clip {prev} has no still — using canonical scene")
        else:
            print(f"  ▶ clip {n:>2} ({scene_tag}): no prev in scene — using canonical scene")

        if render_clip(n, args.dry_run):
            ok_count += 1
        else:
            fail_count += 1

    # Restore canonical scene PNGs after chain run
    if not args.dry_run:
        restore_scenes(original_backups)
        print(f"\n  ✓ restored {len(original_backups)} canonical scene PNGs from backup")

    print(f"\n━━━ DONE: {ok_count} ok, {fail_count} failed ━━━")
    sys.exit(1 if fail_count else 0)


if __name__ == "__main__":
    main()
