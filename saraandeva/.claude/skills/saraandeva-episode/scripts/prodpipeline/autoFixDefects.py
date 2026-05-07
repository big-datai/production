#!/usr/bin/env python3
"""
Read a Gemini-Flash audit JSON (produced by auditClipsWithGemini.mjs) and
emit a deterministic FIX PLAN — which clips need re-submit, with classified
defect categories and prompt-tightening heuristics applied.

Closes the loop between Phase 8 (audit) and Phase 5 (re-submit) of
runEpisodePipeline.py. Replaces the manual "agent reads audit JSON, agent
edits clip prompt, agent re-submits" cycle.

Defect taxonomy (from docs/lessons/lesson_kling_ghost_anatomy_ep10.md,
lesson_kling_prompt_anatomy.md, lesson_no_red_splatter_kids_show.md):

  duplicate_character   — extra/clone characters (>expected count)
  ghost / morphing      — anatomy bug (extra arm, 180° flip, face warp)
  character_passive     — too still (Kling render too static)
  scene_mismatch        — abrupt scene change inside one clip
  wrong_take            — matched-by-similarity got an old/wrong render
  costume_loss          — character renders without costume
  visual_clone          — two distinct chars rendered identically
  other                 — narrative/semantic (audio mismatch, prop bug)

Per-defect fix heuristic:
  duplicate_character   → add to negativePrompt: "extra <Char>, duplicate <Char>, two <Char>s, second <Char>"
  ghost / morphing      → append continuity-lock vocab to prompt; add anti-morph negatives
  character_passive     → CAPS body-part verb in prompt; add "static, idle, motionless" to negativePrompt
  scene_mismatch        → flag for SPLIT into two sub-clips (manual decision)
  wrong_take            → manual eyeball — pipeline matched by prompt-similarity, can't auto-fix
  costume_loss          → prompt's cast identity locks need costume description (manual)
  visual_clone          → add distinct anchor (hair color, pose, prop) per character
  other                 → narrative — flag for human review only

Usage:
  python3 autoFixDefects.py --audit content/episodes/ep15/audit_v1.json
  python3 autoFixDefects.py --audit ... --episode 15 --emit-fixed-specs

Outputs:
  - stdout: human-readable fix plan
  - <ep_dir>/auto_fix_plan_v<N>.json: machine-readable plan
  - if --emit-fixed-specs: <ep_dir>/_fix_v<N>/<clip>.json with prompt edits applied
"""
import argparse, json, re, sys
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")

# ─── Defect classifier ─────────────────────────────────────────────────────
# Each entry: (regex, category). First match wins.
DEFECT_PATTERNS = [
    (r"duplicate.{0,20}character|extra (?:sara|eva|papa|mama|joe|ginger|isabel|leo|lisa|girl|adult)|two (?:sara|eva|papa|mama|joe|ginger)s|second (?:sara|eva)\b", "duplicate_character"),
    (r"\bghost\b|\bextra (?:arm|leg|hand|head)\b|three[\- ]arm|extra limb|disfigured|morphing|flicker|warped face|distorted face", "ghost_morphing"),
    (r"character_passive|too (?:still|static)|minimal movement|barely moves|no motion|sitting (?:and|while) looking", "character_passive"),
    (r"scene_mismatch|scene (?:abruptly )?changes|abrupt cut|location (?:change|swap)|inconsistent scene", "scene_mismatch"),
    (r"wrong take|old render|previous version|earlier clip", "wrong_take"),
    (r"no costume|missing costume|wears (?:everyday|regular) clothes|out of costume", "costume_loss"),
    (r"identical|visual_clone|cloned|same outfit|same hair (?:and|&) (?:eye|face)|indistinguishable", "visual_clone"),
    (r"red.{0,30}(?:blood|gore|splatter|spurt)|blood near (?:face|mouth)", "red_blood_kid_show_fail"),
]


def classify_defect(text: str) -> str:
    t = (text or "").lower()
    for pat, cat in DEFECT_PATTERNS:
        if re.search(pat, t, re.I):
            return cat
    return "other"


# ─── Fix heuristics per defect category ────────────────────────────────────
# Each returns ([prompt-deltas], [negative-prompt-deltas], action)
# where deltas are lists of {op: append|prepend|replace, str: <text>}
NEG_BLOCK_DUP = "extra characters, duplicate characters, multiple instances of same person, twin renders, doppelganger, ghost limbs"
NEG_BLOCK_MORPH = "morphing, flickering, disfigured, distorted, extra face, extra arm, extra leg, three arms, unstable motion, warped anatomy"
NEG_BLOCK_PASSIVE = "static pose, idle, motionless, frozen, observing without acting"

CONTINUITY_LOCK_VOCAB = "preserve silhouette, maintain proportions, keep colors consistent, single rendering of each character"


def heuristic(category: str, defect_text: str):
    if category == "duplicate_character":
        return ([], [{"op": "append", "str": NEG_BLOCK_DUP}], "auto_fix")
    if category == "ghost_morphing":
        return (
            [{"op": "append", "str": CONTINUITY_LOCK_VOCAB}],
            [{"op": "append", "str": NEG_BLOCK_MORPH}],
            "auto_fix",
        )
    if category == "character_passive":
        return (
            [],
            [{"op": "append", "str": NEG_BLOCK_PASSIVE}],
            "auto_fix_with_review",
        )
    if category == "scene_mismatch":
        return ([], [], "manual_split")
    if category == "wrong_take":
        return ([], [], "manual_eyeball")
    if category == "costume_loss":
        return ([], [], "manual_costume_lock")
    if category == "visual_clone":
        return ([], [], "manual_distinct_anchor")
    if category == "red_blood_kid_show_fail":
        return ([], [], "manual_swap_color")
    return ([], [], "human_review")


def apply_deltas(text: str, deltas: list) -> str:
    out = text or ""
    for d in deltas:
        if d["op"] == "append":
            out = (out.rstrip(", \n") + ", " + d["str"]) if out else d["str"]
        elif d["op"] == "prepend":
            out = d["str"] + ", " + out if out else d["str"]
        elif d["op"] == "replace":
            out = d["str"]
    return out


# ─── Audit reader ──────────────────────────────────────────────────────────
def parse_audit(audit_path: Path):
    audit = json.loads(audit_path.read_text())
    flagged = audit.get("flagged", {})
    results = audit.get("results", {})
    return audit, flagged, results


def extract_defect_lines(result: dict) -> list:
    """Pull individual defect lines from the per-clip Gemini result."""
    lines = []
    raw_defects = result.get("defects")
    if isinstance(raw_defects, list):
        for d in raw_defects:
            s = (d or "").strip(" -")
            if s and s.upper() not in ("NONE", "N/A"):
                lines.append(s)
    elif isinstance(raw_defects, str):
        for ln in raw_defects.split("\n"):
            ln = ln.strip(" -")
            if ln and ln.upper() not in ("NONE", "N/A"):
                lines.append(ln)
    return lines


# ─── Fix planner ───────────────────────────────────────────────────────────
def build_plan(audit_path: Path, ep_dir: Path):
    audit, flagged, results = parse_audit(audit_path)
    plan = {
        "audit": str(audit_path),
        "generatedAt": __import__("datetime").datetime.now().isoformat() + "Z",
        "fixes": [],
        "summary": {
            "auto_fix": 0, "auto_fix_with_review": 0,
            "manual_split": 0, "manual_eyeball": 0,
            "manual_costume_lock": 0, "manual_distinct_anchor": 0,
            "manual_swap_color": 0, "human_review": 0,
        },
    }

    # walk every flagged clip (fox/critical/minor)
    for level in ("fox", "critical", "minor"):
        for fname in flagged.get(level, []):
            r = results.get(fname, {})
            defects = extract_defect_lines(r)
            for defect in defects:
                cat = classify_defect(defect)
                pdelta, ndelta, action = heuristic(cat, defect)
                clip_id = re.sub(r"\.mp4$", "", fname)
                plan["fixes"].append({
                    "clip": clip_id,
                    "auditFile": fname,
                    "level": level,
                    "defectText": defect,
                    "category": cat,
                    "promptDeltas": pdelta,
                    "negativeDeltas": ndelta,
                    "action": action,
                })
                plan["summary"][action] = plan["summary"].get(action, 0) + 1

    return plan


# ─── Spec-edit emitter ─────────────────────────────────────────────────────
def emit_fixed_specs(plan: dict, ep_dir: Path, version: int):
    fix_dir = ep_dir / f"_fix_v{version}"
    fix_dir.mkdir(exist_ok=True)
    edited = {}

    # group fixes by clip
    by_clip = {}
    for fix in plan["fixes"]:
        if fix["action"] not in ("auto_fix", "auto_fix_with_review"): continue
        by_clip.setdefault(fix["clip"], []).append(fix)

    for clip_id, fixes in by_clip.items():
        spec_path = ep_dir / f"{clip_id}.json"
        if not spec_path.exists():
            print(f"  ⚠ {clip_id}: spec file not found, skipping", file=sys.stderr)
            continue
        spec = json.loads(spec_path.read_text())
        new_prompt = spec.get("prompt", "")
        new_neg = spec.get("negativePrompt", "")
        for fix in fixes:
            new_prompt = apply_deltas(new_prompt, fix["promptDeltas"])
            new_neg = apply_deltas(new_neg, fix["negativeDeltas"])
        spec["prompt"] = new_prompt
        spec["negativePrompt"] = new_neg
        spec["_autoFix"] = {
            "appliedFixes": [f["category"] for f in fixes],
            "originalDefects": [f["defectText"][:120] for f in fixes],
            "version": version,
        }
        out_path = fix_dir / f"{clip_id}.json"
        out_path.write_text(json.dumps(spec, indent=2))
        edited[clip_id] = str(out_path)

    return fix_dir, edited


# ─── Main ──────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit", required=True, help="path to audit_v<N>.json")
    ap.add_argument("--episode", "-e", type=int, help="episode number (inferred from path if omitted)")
    ap.add_argument("--emit-fixed-specs", action="store_true",
                    help="write modified clip JSONs to <ep>/_fix_v<N>/")
    ap.add_argument("--fix-version", type=int, default=2, help="version suffix for fix dir / metadata")
    args = ap.parse_args()

    audit_path = Path(args.audit)
    if not audit_path.is_file():
        print(f"!! audit file not found: {audit_path}", file=sys.stderr)
        sys.exit(1)

    # infer episode dir
    if args.episode:
        ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
    else:
        ep_dir = audit_path.parent

    plan = build_plan(audit_path, ep_dir)
    plan_path = ep_dir / f"auto_fix_plan_v{args.fix_version}.json"
    plan_path.write_text(json.dumps(plan, indent=2))

    # human-readable
    print(f"Auto-fix plan from {audit_path.name}")
    print(f"  → {plan_path.relative_to(PROJECT_ROOT)}\n")
    print("Summary by action:")
    for action, count in plan["summary"].items():
        if count > 0:
            print(f"  {action}: {count}")

    print("\nPer-clip details:")
    by_clip = {}
    for fix in plan["fixes"]:
        by_clip.setdefault(fix["clip"], []).append(fix)
    for clip in sorted(by_clip, key=lambda x: int(x) if x.isdigit() else 999):
        for fix in by_clip[clip]:
            mark = {
                "auto_fix": "🔧", "auto_fix_with_review": "🔧?",
                "manual_split": "✂️", "manual_eyeball": "👁",
                "manual_costume_lock": "👗", "manual_distinct_anchor": "🎯",
                "manual_swap_color": "🎨", "human_review": "❓",
            }.get(fix["action"], "•")
            print(f"  {mark} clip {clip} ({fix['level']}) [{fix['category']}] {fix['action']}")
            print(f"      “{fix['defectText'][:100]}”")

    # optional: emit edited specs
    if args.emit_fixed_specs:
        fix_dir, edited = emit_fixed_specs(plan, ep_dir, args.fix_version)
        print(f"\nEmitted {len(edited)} fixed spec(s) to {fix_dir.relative_to(PROJECT_ROOT)}/")

    auto_count = plan["summary"].get("auto_fix", 0) + plan["summary"].get("auto_fix_with_review", 0)
    if auto_count == 0:
        print("\nNo auto-fixable defects. All require manual review.")
        sys.exit(0)
    print(f"\n{auto_count} clip-defect(s) auto-fixable. Re-submit via:")
    print(f"  node .../kling_ep15_pipeline.mjs submit  # uses _fix_v{args.fix_version}/ if present")
    sys.exit(0)


if __name__ == "__main__":
    main()
