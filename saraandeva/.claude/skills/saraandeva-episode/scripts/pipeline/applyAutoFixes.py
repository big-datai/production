#!/usr/bin/env python3
"""
Promote auto-fix specs from <ep>/_fix_v<N>/<N>.json to the canonical
<ep>/<N>.json so the next pipeline run re-submits them with tightened
prompts. Backs up the original to <ep>/_backup_v<N>/.

Closes the audit → autoFixDefects → resubmit loop.

By default this is a DRY-RUN (per feedback_dont_auto_create.md — no auto
overwrites). Pass --apply to actually copy files.

After applying:
  python3 runEpisodePipeline.py --episode <NN> --start-from 5
  # picks up at submit, re-renders the patched clips, re-audits

Usage:
  python3 applyAutoFixes.py --episode 15                          # dry-run
  python3 applyAutoFixes.py --episode 15 --plan auto_fix_plan_v2.json --apply
  python3 applyAutoFixes.py --episode 15 --apply --reset-state    # also rm tasks from state

Exit codes:
  0  no fixes to apply (clean) OR dry-run completed
  1  --apply succeeded with N fixes promoted
  2  no plan file or fix dir found
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")


def latest_plan(ep_dir: Path):
    plans = sorted(ep_dir.glob("auto_fix_plan_v*.json"))
    return plans[-1] if plans else None


def matching_fix_dir(ep_dir: Path, plan_name: str):
    # auto_fix_plan_v2.json → _fix_v2
    v = plan_name.replace("auto_fix_plan_v", "").replace(".json", "")
    return ep_dir / f"_fix_v{v}"


def reset_clip_tasks(ep_dir: Path, clips: list):
    """Remove specified clip_<N> entries from _pipeline_state.json so the
    next submit re-submits them. Backs up state file first."""
    state_p = ep_dir / "_pipeline_state.json"
    if not state_p.is_file():
        print("  (no _pipeline_state.json, nothing to reset)")
        return 0
    state = json.loads(state_p.read_text())
    backup = ep_dir / "_pipeline_state.backup.json"
    backup.write_text(state_p.read_text())
    tasks = state.get("clipTasks") or {}
    removed = 0
    for c in clips:
        for key_form in (f"clip_{c}", c):
            if key_form in tasks:
                del tasks[key_form]
                removed += 1
                break
    state["clipTasks"] = tasks
    state_p.write_text(json.dumps(state, indent=2))
    return removed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--plan", help="explicit plan JSON path; default = latest auto_fix_plan_v*.json")
    ap.add_argument("--apply", action="store_true", help="actually copy fixes (default: dry-run)")
    ap.add_argument("--reset-state", action="store_true",
                    help="also clear clip_<N> entries from _pipeline_state.json so they re-submit")
    args = ap.parse_args()

    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
    if not ep_dir.is_dir():
        print(f"!! episode dir not found: {ep_dir}", file=sys.stderr)
        sys.exit(2)

    plan_p = Path(args.plan) if args.plan else latest_plan(ep_dir)
    if not plan_p or not plan_p.is_file():
        print(f"!! no auto_fix_plan_v*.json found in {ep_dir}; run autoFixDefects.py first")
        sys.exit(2)

    plan = json.loads(plan_p.read_text())
    fix_dir = matching_fix_dir(ep_dir, plan_p.name)
    if not fix_dir.is_dir():
        print(f"!! fix dir {fix_dir.name} missing; re-run autoFixDefects.py with --emit-fixed-specs")
        sys.exit(2)

    auto_fixes = [f for f in plan.get("fixes", [])
                  if f.get("action") in ("auto_fix", "auto_fix_with_review")]
    affected_clips = sorted({f["clip"] for f in auto_fixes})

    print(f"Plan: {plan_p.name}")
    print(f"Fix dir: {fix_dir.name}")
    print(f"Auto-fixable clips: {len(affected_clips)}  → {affected_clips or '(none)'}")
    print()

    if not affected_clips:
        print("✓ no auto-fixable defects in plan; nothing to apply")
        sys.exit(0)

    backup_dir = ep_dir / fix_dir.name.replace("_fix_", "_backup_")
    if not args.apply:
        print("DRY RUN — not modifying files. Re-run with --apply to actually promote fixes.")
        for c in affected_clips:
            src = fix_dir / f"{c}.json"
            dst = ep_dir / f"{c}.json"
            print(f"  would copy {src.relative_to(PROJECT_ROOT)} → {dst.relative_to(PROJECT_ROOT)}")
            print(f"  would back up {dst.relative_to(PROJECT_ROOT)} → {backup_dir.name}/{c}.json")
        if args.reset_state:
            print(f"\n  would clear clipTasks: {affected_clips}")
        print("\nNext step (after apply):")
        print(f"  python3 runEpisodePipeline.py --episode {args.episode} --start-from 5")
        sys.exit(0)

    # --apply branch
    backup_dir.mkdir(exist_ok=True)
    promoted = 0
    for c in affected_clips:
        src = fix_dir / f"{c}.json"
        dst = ep_dir / f"{c}.json"
        if not src.is_file():
            print(f"  ⚠ {src.name} missing in fix dir, skipping")
            continue
        if dst.is_file():
            shutil.copy2(dst, backup_dir / f"{c}.json")
        shutil.copy2(src, dst)
        print(f"  ✓ promoted {c}.json (backup → {backup_dir.name}/)")
        promoted += 1

    if args.reset_state:
        removed = reset_clip_tasks(ep_dir, affected_clips)
        print(f"\n  ✓ cleared {removed} clip task(s) from _pipeline_state.json (backup saved)")

    print(f"\n✅ promoted {promoted} fix(es). Next:")
    print(f"  python3 runEpisodePipeline.py --episode {args.episode} --start-from 5")
    sys.exit(1)   # special exit so orchestrator can detect "fixes were applied"


if __name__ == "__main__":
    main()
