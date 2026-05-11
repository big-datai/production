#!/usr/bin/env python3
"""
Mass-audit every rendered clip in an episode. Runs auditClip.py per clip and
writes a single Markdown report.

Replaces "for n in 1..30; do auditClip.py --episode 14 --clip $n; done".

Usage:
  python3 auditEpisode.py --episode 14
  python3 auditEpisode.py --episode 14 --no-gemini   # skip Gemini, just file/duration
  python3 auditEpisode.py --episode 14 --out content/episodes/ep14/audit_report.md

Output: Markdown table + per-clip details. Exit code = max severity (0/1/2).
"""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ICON = {"PASS": "✅", "WARN": "🟡", "FAIL": "🔴", "?": "❓"}


def run_audit(ep: int, clip_id: str, no_gemini: bool) -> dict:
    """Run auditClip.py --json on one clip; return parsed result."""
    cmd = [
        "python3",
        str(Path(__file__).parent / "auditClip.py"),
        "--episode", str(ep),
        "--clip", str(clip_id),
        "--json",
    ]
    if no_gemini: cmd.append("--no-gemini")
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    try:
        return json.loads(r.stdout)
    except (json.JSONDecodeError, ValueError):
        return {"clip": clip_id, "verdict": "?", "error": (r.stderr or r.stdout)[-300:]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--no-gemini", action="store_true", help="skip Gemini calls (file checks only)")
    ap.add_argument("--out", default=None, help="markdown output path; default <ep>/audit_report.md")
    args = ap.parse_args()

    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
    out_path = Path(args.out) if args.out else (ep_dir / "audit_report.md")
    clips_dir = ep_dir / "clips"

    # Find rendered clips (mp4 in clips/, ignore old/)
    rendered = []
    for p in sorted(clips_dir.iterdir()):
        if p.is_dir() or not p.name.endswith(".mp4"): continue
        stem = p.stem
        # Accept "1", "1.5", "A", "B" — skip anything else
        if not (stem.replace(".", "").isdigit() or (len(stem) == 1 and stem.isalpha())):
            continue
        rendered.append(stem)

    print(f"Auditing ep{args.episode:02d} — {len(rendered)} rendered clip(s)")
    if not rendered:
        print("  no rendered clips found"); sys.exit(0)

    results = []
    counts = {"PASS": 0, "WARN": 0, "FAIL": 0, "?": 0}
    max_code = 0
    start = time.time()
    for cid in rendered:
        print(f"  auditing clip {cid}...", end=" ", flush=True)
        r = run_audit(args.episode, cid, args.no_gemini)
        verdict = r.get("verdict", "?")
        results.append(r)
        counts[verdict if verdict in counts else "?"] = counts.get(verdict, 0) + 1
        # exit code: 0=PASS, 1=WARN, 2=FAIL, 3=infrastructure
        for reason in r.get("verdict_reasons", []):
            pass
        print(ICON.get(verdict, "?"))
    elapsed = time.time() - start

    # Build markdown report
    md = []
    md.append(f"# Episode {args.episode:02d} — audit report")
    md.append(f"_{time.strftime('%Y-%m-%d %H:%M:%S')} — {len(rendered)} clips, {elapsed:.0f}s_\n")
    md.append(f"**Summary:** ✅ {counts['PASS']}  🟡 {counts['WARN']}  🔴 {counts['FAIL']}  ❓ {counts['?']}\n")

    # Table
    md.append("| Clip | Verdict | Spec | Render | Gemini | Notes |")
    md.append("|------|---------|------|--------|--------|-------|")
    for r in results:
        cid = r.get("clip", "?")
        v = r.get("verdict", "?")
        ico = ICON.get(v, "❓")
        n_subj = len(r.get("expected_duration") and (json.loads((ep_dir / f"{cid}.json").read_text()).get("subjects") if (ep_dir / f"{cid}.json").is_file() else []) or [])
        spec_subj = "?"
        spec_path = ep_dir / f"{cid}.json"
        if spec_path.is_file():
            try: spec_subj = ", ".join(json.loads(spec_path.read_text()).get("subjects", []))
            except Exception: pass
        humans = r.get("gemini_humans_count")
        hum_disp = f"{humans} humans" if humans is not None else "?"
        gem = r.get("gemini_overall", "?")
        defects = r.get("gemini_defects", []) or []
        notes = ""
        if r.get("verdict_reasons"):
            notes = "; ".join(str(x)[:80] for x in r["verdict_reasons"][:2])
        md.append(f"| {cid} | {ico} {v} | {spec_subj} | {hum_disp} | {gem} ({len(defects)}) | {notes} |")

    # Detail section for non-PASS clips
    md.append("\n## Details (non-PASS clips)\n")
    for r in results:
        if r.get("verdict") == "PASS": continue
        cid = r.get("clip", "?")
        md.append(f"### Clip {cid} — {ICON.get(r.get('verdict','?'),'❓')} {r.get('verdict','?')}")
        md.append(f"- file: {(r.get('size_bytes') or 0) // 1024} KB, {r.get('actual_duration', 0):.1f}s")
        md.append(f"- gemini overall: {r.get('gemini_overall', '?')}")
        md.append(f"- gemini visible humans: `{(r.get('gemini_visible_humans') or '')[:200]}`")
        for d in r.get("gemini_defects", []) or []:
            md.append(f"  - 🚩 {d}")
        for reason in r.get("verdict_reasons", []) or []:
            md.append(f"  - 🟡 {reason}")
        if r.get("contact_sheet"):
            md.append(f"- contact sheet: `{r['contact_sheet']}`")
        md.append("")

    out_path.write_text("\n".join(md) + "\n")
    print(f"\n✓ {out_path.relative_to(PROJECT_ROOT) if PROJECT_ROOT in out_path.parents else out_path}")
    print(f"  ✅ {counts['PASS']}  🟡 {counts['WARN']}  🔴 {counts['FAIL']}  ❓ {counts['?']}")

    if counts["FAIL"] > 0: sys.exit(2)
    if counts["WARN"] > 0: sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
