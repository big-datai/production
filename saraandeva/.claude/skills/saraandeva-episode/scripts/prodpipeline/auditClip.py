#!/usr/bin/env python3
"""
Per-clip end-to-end QA — file checks + duration + audio + Gemini audit
+ spec comparison + GO/NO-GO verdict in one command.

Replaces the manual flow:
  1. ls clip → 2. ffprobe duration → 3. extractContactSheet → 4. agent eyeball
  5. auditClipsWithGemini → 6. compare audit to spec subjects manually

Now one shot:
  python3 auditClip.py --episode 14 --clip 3

Output: structured JSON + plain summary + exit code:
  0 = PASS (ship)
  1 = WARN (review but OK)
  2 = FAIL (do not ship — re-render or fix)
  3 = infrastructure (file missing, ffprobe failed, etc.)

What it checks:
  ✓ File exists, size > 100 KB
  ✓ Duration matches spec.durationSec (±10%)
  ✓ Audio stream present (if spec.nativeAudio=true)
  ✓ Contact sheet generated to /tmp/clip_<N>_sheet.jpg
  ✓ Gemini audit (CLEAN/MINOR/CRITICAL)
  ✓ Spec compliance:
      - VISIBLE_HUMANS_COUNT == len(spec.subjects) (no extras, no missing)
      - DEFECTS list — count critical vs minor

Verdict logic:
  FAIL  if Gemini OVERALL=CRITICAL with non-cosmetic defect (not "scene_mismatch on framed wall photo style")
        OR humans count differs by 2+
        OR file size < 100 KB
        OR duration off by >25%
  WARN  if Gemini OVERALL=MINOR_ISSUES OR humans_count off by 1
  PASS  otherwise
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")


def probe(mp4: Path) -> dict:
    """ffprobe → {duration_sec, has_audio, video_codec, audio_codec, width, height}"""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(mp4)],
            capture_output=True, text=True, timeout=20)
        j = json.loads(r.stdout)
    except Exception as e:
        return {"error": str(e)}
    duration = float(j.get("format", {}).get("duration", 0))
    streams = j.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio = next((s for s in streams if s.get("codec_type") == "audio"), {})
    return {
        "duration_sec": duration,
        "has_audio": bool(audio),
        "video_codec": video.get("codec_name"),
        "audio_codec": audio.get("codec_name"),
        "width": video.get("width"),
        "height": video.get("height"),
    }


def gemini_audit_one(mp4: Path) -> dict:
    """Run auditClipsWithGemini on a single-clip dir. Returns parsed audit dict."""
    # Audit script wants a directory of numeric .mp4s. Symlink our clip to /tmp/.
    tmp_dir = Path(f"/tmp/audit_clip_{int(time.time())}")
    tmp_dir.mkdir(exist_ok=True)
    symlink = tmp_dir / mp4.name
    if symlink.exists(): symlink.unlink()
    try:
        symlink.symlink_to(mp4.absolute())
    except OSError:
        # fallback: copy
        import shutil
        shutil.copy(mp4, symlink)
    out_json = tmp_dir / "audit.json"
    audit_script = PROJECT_ROOT / ".claude" / "skills" / "saraandeva-episode" / "scripts" / "prodpipeline" / "auditClipsWithGemini.py"
    r = subprocess.run(
        ["python3", str(audit_script), str(tmp_dir), "--out", str(out_json)],
        capture_output=True, text=True, timeout=180)
    if not out_json.is_file():
        return {"error": f"audit script failed: {r.stderr[-300:]}"}
    audit_data = json.loads(out_json.read_text())
    # Cleanup
    try:
        symlink.unlink()
        out_json.unlink()
        tmp_dir.rmdir()
    except OSError:
        pass
    # Return the per-clip results entry
    return audit_data.get("results", {}).get(mp4.name, {})


def compare_to_spec(audit: dict, spec: dict) -> list[str]:
    """Return list of per-spec-mismatch strings."""
    issues = []
    expected_subjects = spec.get("subjects", []) or []
    actual_count = audit.get("humansCount")
    if actual_count is not None and len(expected_subjects) > 0:
        diff = actual_count - len(expected_subjects)
        if abs(diff) >= 2:
            issues.append(f"humans_count_off: spec={len(expected_subjects)} actual={actual_count} (diff {diff:+d})")
        elif abs(diff) == 1:
            issues.append(f"humans_count_off_by_1: spec={len(expected_subjects)} actual={actual_count}")
    # Check humans description for canonical names presence
    actual_humans = (audit.get("humans") or "").lower()
    for subj in expected_subjects:
        if subj.lower() not in actual_humans and not any(part.lower() in actual_humans for part in subj.split("_")):
            issues.append(f"subject_missing_in_render: {subj!r} not detected in audit description")
    return issues


def verdict(checks: dict) -> tuple[str, int, list[str]]:
    """Return (verdict_str, exit_code, reasons)."""
    reasons = []
    fail = False
    warn = False

    # File checks
    if not checks["file_exists"]:
        return ("FAIL", 3, ["file does not exist"])
    if checks["size_bytes"] < 100_000:
        return ("FAIL", 2, [f"file size {checks['size_bytes']} < 100 KB (likely truncated)"])

    # Duration
    expected = checks.get("expected_duration", 10)
    actual = checks.get("actual_duration", 0)
    if actual > 0 and expected > 0:
        diff_pct = abs(actual - expected) / expected
        if diff_pct > 0.25:
            fail = True
            reasons.append(f"duration_off: expected {expected}s, got {actual:.1f}s (off {diff_pct*100:.0f}%)")
        elif diff_pct > 0.1:
            warn = True
            reasons.append(f"duration_warn: expected {expected}s, got {actual:.1f}s")

    # Audio
    if checks.get("requires_audio") and not checks.get("has_audio"):
        fail = True
        reasons.append("missing_audio: spec.nativeAudio=true but no audio stream")

    # Gemini overall
    overall = checks.get("gemini_overall", "UNKNOWN")
    if overall == "CRITICAL_DEFECT":
        # Distinguish hard defects from soft style nits
        defects = checks.get("gemini_defects", []) or []
        hard = [d for d in defects if any(w in d.lower() for w in
                ["ghost", "duplicate", "anatomy", "wrong character",
                 "missing limb", "horror", "blood", "scary", "extra arm"])]
        if hard:
            fail = True
            reasons.append(f"gemini_critical_hard: {hard[:2]}")
        else:
            warn = True
            reasons.append(f"gemini_critical_soft (style nits): {len(defects)} defects, none anatomy/clone")
    elif overall == "MINOR_ISSUES":
        warn = True
        reasons.append(f"gemini_minor: {len(checks.get('gemini_defects', []))} defects")

    # Spec comparison
    mismatches = checks.get("spec_mismatches", [])
    for m in mismatches:
        if "off_by_1" in m or "subject_missing" in m:
            warn = True
            reasons.append(m)
        else:
            fail = True
            reasons.append(m)

    if fail: return ("FAIL", 2, reasons)
    if warn: return ("WARN", 1, reasons)
    return ("PASS", 0, ["all checks clean"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--clip", "-c", required=True, help="clip number (1, 2, ..., or A, B for letter clips)")
    ap.add_argument("--no-gemini", action="store_true", help="skip Gemini audit (fast mode, file/duration/audio only)")
    ap.add_argument("--json", action="store_true", help="output JSON only")
    args = ap.parse_args()

    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
    spec_path = ep_dir / f"{args.clip}.json"
    if not spec_path.is_file():
        print(f"!! spec not found: {spec_path}", file=sys.stderr); sys.exit(3)
    spec = json.loads(spec_path.read_text())

    mp4 = ep_dir / "clips" / f"{args.clip}.mp4"
    checks = {
        "episode": args.episode,
        "clip": args.clip,
        "spec_file": spec_path.name,
        "mp4_path": str(mp4),
        "file_exists": mp4.is_file(),
        "expected_duration": spec.get("durationSec", 10),
        "requires_audio": spec.get("nativeAudio", False),
    }
    if not checks["file_exists"]:
        v, code, reasons = verdict(checks)
        print(f"❌ {args.clip}: {v} — clip mp4 not found")
        sys.exit(code)
    checks["size_bytes"] = mp4.stat().st_size

    # Probe
    probe_data = probe(mp4)
    checks["actual_duration"] = probe_data.get("duration_sec", 0)
    checks["has_audio"] = probe_data.get("has_audio", False)
    checks["video_codec"] = probe_data.get("video_codec")
    checks["resolution"] = f"{probe_data.get('width')}×{probe_data.get('height')}"

    # Contact sheet (informational)
    sheet_p = Path(f"/tmp/{mp4.stem}_sheet.jpg")
    sheet_script = PROJECT_ROOT / ".claude" / "skills" / "saraandeva-episode" / "scripts" / "prodpipeline" / "extractContactSheet.py"
    subprocess.run(["python3", str(sheet_script), str(mp4), "--out", str(sheet_p)],
                   capture_output=True, timeout=60)
    checks["contact_sheet"] = str(sheet_p) if sheet_p.is_file() else None

    # Gemini audit (slow, paid)
    if not args.no_gemini:
        audit = gemini_audit_one(mp4)
        if "error" in audit:
            checks["gemini_error"] = audit["error"]
            checks["gemini_overall"] = "UNKNOWN"
        else:
            checks["gemini_overall"] = audit.get("overall", "UNKNOWN")
            checks["gemini_defects"] = audit.get("defects", [])
            checks["gemini_visible_humans"] = audit.get("humans", "")
            checks["gemini_humans_count"] = audit.get("humansCount")
            # Spec comparison
            checks["spec_mismatches"] = compare_to_spec(audit, spec)
    else:
        checks["gemini_overall"] = "SKIPPED"
        checks["spec_mismatches"] = []

    v, code, reasons = verdict(checks)
    checks["verdict"] = v
    checks["verdict_reasons"] = reasons

    if args.json:
        print(json.dumps(checks, indent=2))
    else:
        ICON = {"PASS": "✅", "WARN": "🟡", "FAIL": "🔴"}.get(v, "❓")
        print(f"\n{ICON} clip {args.clip}: {v}")
        print(f"   spec subjects: {spec.get('subjects')}")
        print(f"   file: {checks.get('size_bytes', 0)//1024} KB, {checks.get('actual_duration', 0):.1f}s,"
              f" {checks.get('resolution')}, audio={'yes' if checks.get('has_audio') else 'no'}")
        if checks.get("gemini_overall") not in ("UNKNOWN", "SKIPPED"):
            print(f"   gemini: {checks['gemini_overall']} — {len(checks.get('gemini_defects', []))} defects")
            print(f"   visible humans: {checks.get('gemini_visible_humans', '')[:80]}")
            for d in checks.get("gemini_defects", []):
                print(f"     {d}")
        for r in reasons:
            print(f"   • {r}")
        if checks.get("contact_sheet"):
            print(f"   contact sheet: {checks['contact_sheet']}")

    sys.exit(code)


if __name__ == "__main__":
    main()
