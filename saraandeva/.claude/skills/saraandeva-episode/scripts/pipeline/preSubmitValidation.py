#!/usr/bin/env python3
"""
Pre-Kling-submit validation gate — every check that can be done on STILLS
BEFORE paying for video renders.

User directive 2026-05-12: validate everything we can on stills first.
Catches issues at $0 cost that would otherwise cost ~$0.70-1.40 per clip
in wasted Kling renders.

Checks (all-or-nothing — exits 1 if any FAIL):

  A. STILL PRESENCE          — every clip JSON has a stills/clip_<N>_*.png
  B. STILL UPLOAD            — every clip still URL is in _pipeline_state.json.uploads
  C. ELEMENT RESOLUTION      — every subject in subjects[] resolves to a Kling element_id
  D. SCENE CONSISTENCY       — auditSceneConsistency.py exits 0 (all scene groups CONSISTENT)
  E. CHARACTER COUNT IN STILL — Gemini Vision spot-check: # of distinct chars in each
                                still matches len(subjects) (catches duplicates / missing)

Each check produces structured output:
  ✓ check name — passed
  ❌ check name — failed: <reason>

Exit codes:
  0 = ALL pass → safe to proceed to phase 8 (submit)
  1 = at least one FAIL → fix locally before Kling, save credits
  2 = infrastructure error (file/API/env missing)

Usage:
    python3 preSubmitValidation.py --episode 16
    python3 preSubmitValidation.py --episode 16 --skip-scene-audit   # skip the slow Gemini check
    python3 preSubmitValidation.py --episode 16 --json               # machine-readable
"""
from __future__ import annotations
import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
PIPELINE = PROJECT_ROOT / ".claude/skills/saraandeva-episode/scripts/pipeline"


# ───────────────────────── Check A: still presence ───────────────────────
def check_still_presence(ep_num: int) -> tuple[bool, list[str]]:
    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{ep_num:02d}"
    stills = ep_dir / "stills"
    missing = []
    for fp in sorted(ep_dir.iterdir()):
        if not re.fullmatch(r"\d+\.json", fp.name): continue
        n = int(fp.stem)
        found = False
        for pat in (f"clip_{n:02d}_*.png", f"clip_{n}_*.png"):
            if any(p.is_file() and "old" not in p.parts for p in stills.glob(pat)):
                found = True; break
        if not found:
            missing.append(f"clip_{n}")
    return (not missing, missing)


# ───────────────────────── Check B: still upload ─────────────────────────
def check_still_upload(ep_num: int) -> tuple[bool, list[str]]:
    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{ep_num:02d}"
    state_p = ep_dir / "_pipeline_state.json"
    if not state_p.is_file():
        return False, ["_pipeline_state.json missing — run phase 3 (upload) first"]
    try: state = json.loads(state_p.read_text())
    except Exception:
        return False, ["_pipeline_state.json unreadable"]
    uploads = state.get("uploads", {})
    missing = []
    for fp in sorted(ep_dir.iterdir()):
        if not re.fullmatch(r"\d+\.json", fp.name): continue
        n = int(fp.stem)
        key = f"clip_{n}_still"
        if not uploads.get(key, {}).get("httpsUrl"):
            missing.append(f"clip_{n}_still")
    return (not missing, missing)


# ───────────────────────── Check C: element resolution ────────────────────
def check_element_resolution(ep_num: int) -> tuple[bool, list[str]]:
    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{ep_num:02d}"
    reg_p = PROJECT_ROOT / "content" / "elements_registry.json"
    if not reg_p.is_file():
        return False, ["elements_registry.json missing"]
    reg = json.loads(reg_p.read_text())
    needed: Counter = Counter()
    for fp in sorted(ep_dir.iterdir()):
        if not re.fullmatch(r"\d+\.json", fp.name): continue
        try: d = json.loads(fp.read_text())
        except Exception: continue
        for s in d.get("subjects") or []: needed[s] += 1
    missing = []
    for name in needed:
        if reg.get(f"ep{ep_num:02d}_{name}") or reg.get(name): continue
        missing.append(name)
    return (not missing, missing)


# ───────────────────────── Check D: scene consistency ─────────────────────
def check_scene_consistency(ep_num: int) -> tuple[bool, list[str]]:
    """Calls auditSceneConsistency.py. Costs ~$0.005 in Gemini Flash."""
    script = PIPELINE / "auditSceneConsistency.py"
    r = subprocess.run(
        ["python3", str(script), "--episode", str(ep_num), "--json"],
        capture_output=True, text=True, timeout=300,
    )
    if r.returncode == 2:
        return False, [f"auditSceneConsistency infra error: {r.stderr[-200:]}"]
    try:
        findings = json.loads(r.stdout.split("\n")[-1] if "[" not in r.stdout[:5] else r.stdout)
    except Exception:
        # Fallback: parse from non-json output
        return (r.returncode == 0,
                [] if r.returncode == 0 else ["auditSceneConsistency reported drift — see audit log"])
    bad = [f"{f['scene']} ({len(f['clips'])} clips)"
           for f in findings if f.get("verdict") == "INCONSISTENT"]
    return (not bad, bad)


# ───────────────────────── Check E: deep per-still audit ─────────────────
# Default ON 2026-05-12 (was opt-in). ~$0.005/still × clips = ~$0.11/episode.
# 5 dimensions: subjects, action, anatomy, physics (floating objects),
# wardrobe. Calls auditClipStill.py — catches drift the identity-only check
# misses (clip-21 wrong-Sara, clip-2 floating-tooth incidents 2026-05-12).
def check_character_counts(ep_num: int) -> tuple[bool, list[str]]:
    """Deep per-still Vision audit via auditClipStill.py — 5 dimensions per still."""
    script = PIPELINE / "auditClipStill.py"
    r = subprocess.run(
        ["python3", str(script), "--episode", str(ep_num), "--all"],
        capture_output=True, text=True, timeout=600,
    )
    if r.returncode == 2:
        return False, [f"auditClipStill infra error: {r.stderr[-200:]}"]
    fails = []
    for line in r.stdout.splitlines():
        line = line.strip()
        if line.startswith("❌"):
            fails.append(line.lstrip("❌ "))
        elif line.startswith("⤷"):
            # attach the "top defect" to the previous fail line
            if fails: fails[-1] += " | " + line.lstrip("⤷ ")
    return (r.returncode == 0, fails)


# ───────────────────────── main ──────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--skip-scene-audit", action="store_true",
                    help="skip Check D (saves ~$0.005 Gemini + 10s)")
    ap.add_argument("--no-strict-chars", action="store_true",
                    help="opt-out of Check E (per-still character Vision audit). "
                         "Default ON — was opt-in pre-2026-05-12 (clip-21 wrong-Sara incident).")
    ap.add_argument("--strict-chars", action="store_true",
                    help="(legacy) keep Check E on — now default; --no-strict-chars to opt out")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    # Check E is now default ON unless --no-strict-chars
    strict_chars_on = not args.no_strict_chars

    findings = []
    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
    if not ep_dir.is_dir():
        print(f"!! episode dir not found: {ep_dir}", file=sys.stderr); sys.exit(2)

    print(f"━━━ Pre-Kling-submit validation: ep{args.episode:02d} ━━━\n")

    checks = [
        ("A. still presence    ", lambda: check_still_presence(args.episode)),
        ("B. still upload      ", lambda: check_still_upload(args.episode)),
        ("C. element resolution", lambda: check_element_resolution(args.episode)),
    ]
    if not args.skip_scene_audit:
        checks.append(("D. scene consistency", lambda: check_scene_consistency(args.episode)))
    if strict_chars_on:
        checks.append(("E. per-still chars  ", lambda: check_character_counts(args.episode)))

    failed = 0
    for label, fn in checks:
        try: ok, details = fn()
        except Exception as e:
            ok, details = False, [f"check raised {e}"]
        if ok:
            print(f"  ✓ {label} — passed")
            findings.append({"check": label.strip(), "status": "pass"})
        else:
            failed += 1
            print(f"  ❌ {label} — FAIL ({len(details)} issue(s)):")
            for d in details[:10]:
                print(f"       • {d}")
            findings.append({"check": label.strip(), "status": "fail", "issues": details})

    print()
    if failed:
        print(f"━━━ {failed}/{len(checks)} check(s) FAILED — fix locally before Kling submit ━━━")
        if args.json: print(json.dumps(findings, indent=2))
        sys.exit(1)
    print(f"━━━ all {len(checks)} checks passed — safe to submit to Kling ━━━")
    if args.json: print(json.dumps(findings, indent=2))
    sys.exit(0)


if __name__ == "__main__":
    main()
