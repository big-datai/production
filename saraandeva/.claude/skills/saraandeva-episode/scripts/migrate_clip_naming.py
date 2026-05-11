#!/usr/bin/env python3
"""
Migrate ep01/ep02/ep03 clip naming from legacy schemes to canonical numeric.

Canonical (ep04+):  season_01/episode_NN/clips/<N>.mp4   (1.mp4, 2.mp4, …)
                    content/episodes/epNN/<N>.json       (1.json, 2.json, …)

Legacy schemes:
  ep01: season_01/episode_01/clips/clip_NNa.mp4 + alt versions (_v1_buggy etc.)
        content/episodes/ep01/clip_NN.json + clip_NNa.json
  ep02: season_01/episode_02/clips/kling_job_NNN.mp4 + sidecar .json with `mappedTo`
        content/episodes/ep02/clip_NNa.json
  ep03: season_01/episode_03/clips/clip_NNa.mp4
        content/episodes/ep03/clip_NNa.json

Strategy (per ep):
  1. Move existing clips/*.mp4 → clips/.legacy/
  2. Move existing content/episodes/epNN/clip_*.json → content/episodes/epNN/.legacy/
  3. Compute canonical-spec sequence (sorted lexical) from content/ specs
  4. For each spec_name, find the kept mp4 and copy to clips/<seq>.mp4
  5. Copy spec JSON to content/episodes/epNN/<seq>.json
  6. Write _legacy_mapping.json next to clips for audit / reverse

Idempotent: if `.legacy/` already populated for an ep, skip migration.

Usage:
  python3 migrate_clip_naming.py --ep 1
  python3 migrate_clip_naming.py --ep 2
  python3 migrate_clip_naming.py --ep 3
  python3 migrate_clip_naming.py --ep all   # runs ep01, ep02, ep03 in order
  python3 migrate_clip_naming.py --ep 1 --dry-run
"""
from __future__ import annotations
import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
SEASON = ROOT / "season_01"
CONTENT = ROOT / "content" / "episodes"


def find_kept_mp4(clips_dir: Path, spec_stem: str) -> Path | None:
    """Find the kept mp4 for a canonical spec name like 'clip_07b'.

    Convention: prefer the bare-named file (clip_07b.mp4); if it doesn't
    exist, fall back to the highest-version suffix file (e.g.
    clip_07b_v3_clean.mp4 over clip_07b_v1_2Saras.mp4).
    """
    bare = clips_dir / f"{spec_stem}.mp4"
    if bare.exists():
        return bare
    candidates = sorted(clips_dir.glob(f"{spec_stem}_v*.mp4"))
    if candidates:
        # Highest version suffix wins (lexical sort works for _v1, _v2, _v3)
        return candidates[-1]
    return None


def migrate_ep01_or_03(ep_num: int, dry_run: bool) -> dict:
    """ep01 and ep03 share the legacy `clip_NNa` scheme."""
    clips_dir = SEASON / f"episode_{ep_num:02d}" / "clips"
    content_dir = CONTENT / f"ep{ep_num:02d}"
    return _migrate_filename_based(clips_dir, content_dir, dry_run, ep_num)


def migrate_ep02(dry_run: bool) -> dict:
    """ep02 uses kling_job_NNN.mp4 + sidecar .json files with `mappedTo`."""
    clips_dir = SEASON / "episode_02" / "clips"
    content_dir = CONTENT / "ep02"
    if not clips_dir.exists():
        raise SystemExit(f"❌ {clips_dir} not found")

    # Read sidecars: { kling_id: {"status": "keep"|"reject", "mappedTo": "clip_01a"} }
    sidecars: dict[int, dict] = {}
    for j in clips_dir.glob("kling_job_*.json"):
        try:
            d = json.loads(j.read_text())
            sidecars[int(d["klingId"])] = d
        except Exception as e:
            print(f"⚠ skipping malformed sidecar {j.name}: {e}")

    # Build mappedTo → kling_id (only "keep" status)
    mapped: dict[str, int] = {}
    for kid, d in sidecars.items():
        if d.get("status") == "keep" and d.get("mappedTo"):
            mapped[d["mappedTo"]] = kid

    # Canonical sequence: sort mappedTo names lexically (clip_01a, clip_01b, …)
    canonical = sorted(mapped.keys())
    print(f"📋 ep02: {len(canonical)} canonical clips from sidecar metadata")

    return _apply_migration(
        clips_dir=clips_dir,
        content_dir=content_dir,
        dry_run=dry_run,
        ep_num=2,
        canonical_names=canonical,
        mp4_resolver=lambda spec: clips_dir / f"kling_job_{mapped[spec]}.mp4",
    )


def _migrate_filename_based(
    clips_dir: Path, content_dir: Path, dry_run: bool, ep_num: int
) -> dict:
    if not clips_dir.exists():
        raise SystemExit(f"❌ {clips_dir} not found")
    if not content_dir.exists():
        raise SystemExit(f"❌ {content_dir} not found")

    # Canonical specs from content/episodes/ep01/clip_*.json (excluding RECORDING_CHECKLIST.md, episode.json, validation_clip.json)
    spec_files = sorted(
        f for f in content_dir.glob("clip_*.json") if f.name != "validation_clip.json"
    )
    canonical = [f.stem for f in spec_files]
    print(f"📋 ep{ep_num:02d}: {len(canonical)} canonical specs from content/")

    return _apply_migration(
        clips_dir=clips_dir,
        content_dir=content_dir,
        dry_run=dry_run,
        ep_num=ep_num,
        canonical_names=canonical,
        mp4_resolver=lambda spec: find_kept_mp4(clips_dir, spec),
    )


def _apply_migration(
    *,
    clips_dir: Path,
    content_dir: Path,
    dry_run: bool,
    ep_num: int,
    canonical_names: list[str],
    mp4_resolver,
) -> dict:
    legacy_clips = clips_dir / ".legacy"
    legacy_content = content_dir / ".legacy"
    if legacy_clips.exists() and any(legacy_clips.iterdir()):
        print(f"⏭  ep{ep_num:02d}: {legacy_clips} already populated — skipping (use --force or remove .legacy/ to re-run)")
        return {"skipped": True}

    # Plan: spec_name → (mp4_src, seq_num)
    plan: list[dict] = []
    missing: list[str] = []
    for seq, spec in enumerate(canonical_names, start=1):
        mp4_src = mp4_resolver(spec)
        json_src = content_dir / f"{spec}.json"
        if mp4_src is None or not mp4_src.exists():
            missing.append(spec)
            plan.append({"seq": seq, "spec": spec, "mp4_src": None, "json_src": str(json_src) if json_src.exists() else None})
        else:
            plan.append({"seq": seq, "spec": spec, "mp4_src": str(mp4_src), "json_src": str(json_src) if json_src.exists() else None})

    if missing:
        print(f"⚠ ep{ep_num:02d}: {len(missing)} canonical specs have no mp4: {', '.join(missing[:10])}{'…' if len(missing) > 10 else ''}")

    if dry_run:
        print(f"\n--- ep{ep_num:02d} migration plan (dry-run) ---")
        for p in plan:
            mp4_name = Path(p["mp4_src"]).name if p["mp4_src"] else "(none)"
            json_name = Path(p["json_src"]).name if p["json_src"] else "(none)"
            print(f"  {p['seq']:>3}.mp4  ←  {mp4_name:<45}   {p['seq']:>3}.json  ←  {json_name}")
        return {"dry_run": True, "plan": plan, "missing": missing}

    # ─── 1. Archive originals ─────────────────────────────────────────────
    legacy_clips.mkdir(parents=True, exist_ok=True)
    legacy_content.mkdir(parents=True, exist_ok=True)
    moved_clips = 0
    for f in list(clips_dir.iterdir()):
        if f.is_file() and f.name not in (".DS_Store",):
            target = legacy_clips / f.name
            if not target.exists():
                shutil.move(str(f), str(target))
                moved_clips += 1
    moved_content = 0
    for f in list(content_dir.glob("clip_*.json")):
        target = legacy_content / f.name
        if not target.exists():
            shutil.move(str(f), str(target))
            moved_content += 1
    # validation_clip.json (ep03) stays alongside; episode.json stays
    print(f"📦 ep{ep_num:02d}: archived {moved_clips} mp4s + {moved_content} json specs → .legacy/")

    # ─── 2. Re-emit under canonical numeric names ────────────────────────
    written_mp4 = 0
    written_json = 0
    for p in plan:
        seq = p["seq"]
        if p["mp4_src"]:
            src_in_legacy = legacy_clips / Path(p["mp4_src"]).name
            dst = clips_dir / f"{seq}.mp4"
            shutil.copy2(str(src_in_legacy), str(dst))
            written_mp4 += 1
        if p["json_src"]:
            src_in_legacy = legacy_content / Path(p["json_src"]).name
            dst = content_dir / f"{seq}.json"
            shutil.copy2(str(src_in_legacy), str(dst))
            written_json += 1

    # ─── 3. Audit log ─────────────────────────────────────────────────────
    audit = {
        "ep_num": ep_num,
        "canonical_count": len(canonical_names),
        "mp4_renamed": written_mp4,
        "json_renamed": written_json,
        "missing_mp4_for": missing,
        "mapping": [
            {
                "seq": p["seq"],
                "legacy_spec": p["spec"],
                "mp4_src": Path(p["mp4_src"]).name if p["mp4_src"] else None,
                "json_src": Path(p["json_src"]).name if p["json_src"] else None,
            }
            for p in plan
        ],
    }
    (clips_dir / "_legacy_mapping.json").write_text(json.dumps(audit, indent=2))
    print(f"✅ ep{ep_num:02d}: {written_mp4} mp4s + {written_json} jsons under canonical numeric names")
    print(f"   audit log: {clips_dir / '_legacy_mapping.json'}")
    return audit


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ep", required=True, help="1, 2, 3, or all")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    eps = [1, 2, 3] if args.ep == "all" else [int(args.ep)]
    for ep in eps:
        print(f"\n━━━ Episode {ep:02d} ━━━")
        if ep in (1, 3):
            migrate_ep01_or_03(ep, args.dry_run)
        elif ep == 2:
            migrate_ep02(args.dry_run)
        else:
            print(f"❌ ep{ep:02d}: not a legacy episode (canonical naming already in use)")


if __name__ == "__main__":
    main()
