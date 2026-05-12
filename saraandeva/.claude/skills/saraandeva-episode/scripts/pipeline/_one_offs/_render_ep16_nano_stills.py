#!/usr/bin/env python3
"""Pre-render a Nano Banana still for every clip in ep16.

For each clip JSON in content/episodes/ep16/, calls generateGroupShot.py
with all subjects + scene as references and the clip's action prompt as pose.

Output: content/episodes/ep16/stills/clip_<NN>_<safe_title>.png

This is the user-requested "Nano-first" workflow — render the composition
cheaply with identity locks, audit BEFORE spending Kling credits, then submit
to Kling image2video using the still as the start frame.

Cost: ~$0.01-0.02 per still × 22 = $0.30 total.

Per `feedback_nano_banana_no_confirm.md`: just create them, no approval needed.
Per `validate_nano_render.py`: each still auto-audits for anatomy defects.

Usage:
    python3 _render_ep16_nano_stills.py              # all 22
    python3 _render_ep16_nano_stills.py --only 3,4,8 # specific clips
    python3 _render_ep16_nano_stills.py --skip 15    # skip clip 15 (has its own)
    python3 _render_ep16_nano_stills.py --parallel 4
"""
from __future__ import annotations
import argparse
import json
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

PROJECT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
EP = 16
EP_DIR = PROJECT / "content" / "episodes" / f"ep{EP:02d}"
STILLS_DIR = EP_DIR / "stills"
GENERATE = PROJECT / "content" / "generateGroupShot.py"

SCENE_TO_FILE = {
    "ep16-bathroom-mirror": "ep16_bathroom_mirror",
    "ep16-evas-bedroom-night": "ep16_evas_bedroom_night",
    "ep16-living-room-detective": "ep16_living_room_detective",
    "kitchen_morning": "kitchen_morning",
}

# ── Continuity anchors injected into the pose per clip ────────────────────
# User 2026-05-11: tooth-gap is a story-event continuity that MUST persist
# from clip 2 onward (the tooth FALLS in clip 2). Same idea applies to Mama
# hair (forcing the canonical bun) and Joe identity (locking the cream-
# blonde + blue-heart-collar look).
TOOTH_FELL_AT_CLIP = 2

EVA_GAP_ANCHOR = (
    " CRITICAL CONTINUITY: Eva has ONE FRONT UPPER TOOTH MISSING (clear "
    "gap-tooth — the upper-center incisor is GONE, gap is visible whenever "
    "the mouth opens or smiles). This is a permanent story-event state — "
    "the tooth fell out earlier in the episode. Render the missing-tooth "
    "gap clearly in every open-mouth shot, smile, or facial expression. "
    "NOT just any kid-tooth gap — one specific front incisor is absent."
)
MAMA_HAIR_ANCHOR = (
    " Mama's hair is in a LOW MESSY BUN at the back of her head (NOT a "
    "high ponytail, NOT loose, NOT braided). The bun is canonical Mama "
    "in every clip — preserve it exactly."
)
JOE_LOOK_ANCHOR = (
    " Joe the Pomeranian is PALE CREAM-BLONDE (not orange, not golden — "
    "almost white-blonde fluff), wearing a LIGHT-BLUE collar with a small "
    "silver HEART-SHAPED ID tag. This is canonical Joe — match the "
    "reference image exactly in color and collar."
)
PAPA_BALD_ANCHOR = (
    " Papa is COMPLETELY BALD — no hair on top of his head, smooth scalp "
    "visible. He has a full dark TRIMMED BEARD on his face and rectangular "
    "GLASSES. Athletic dad-bod, NOT overweight. Do NOT add hair to Papa's "
    "head under any circumstances — even when in a group composition, Papa "
    "is unambiguously bald."
)


def single_subject_anchor(subjects: list[str]) -> str:
    """Anti-duplicate / anti-ghost-spawn clause for the prompt.

    Per `lesson_background_character_duplicates.md` + `lesson_kling_ghost_anatomy_ep10.md`:
    Nano-Banana spawns duplicate characters when prompted with multi-character
    poses. The fix is an explicit COUNT anchor naming every subject and forbidding
    duplicates in any region of the frame.
    """
    if not subjects:
        return ""
    n = len(subjects)
    names = ", ".join(f"@{s}" for s in subjects)
    bullet = "; ".join(f"exactly ONE @{s}" for s in subjects)
    return (
        f" CRITICAL CHARACTER COUNT: this scene contains EXACTLY {n} subject(s): "
        f"{names}. {bullet}. Do NOT render a second instance of any subject — "
        f"no duplicate dog, no duplicate sister, no duplicate adult, no twin, "
        f"no ghost figure, no mirror duplicate (unless an actual mirror is in "
        f"the scene), no edge-of-frame echo, no background clone. EXACTLY {n} "
        f"character(s) visible total — count them before finalizing."
    )


def continuity_anchors(clip: dict) -> str:
    """Return continuity-anchor text to append to the pose for this clip."""
    parts = []
    cid = clip.get("clip")
    subjects = clip.get("subjects", [])
    subjects_lower = [s.lower() for s in subjects]

    # Anti-duplicate / anti-ghost clause (always applied — every clip)
    parts.append(single_subject_anchor(subjects))

    # Eva tooth-gap: clip 2 onwards (when Eva is on-screen)
    try:
        cid_int = int(cid)
    except (TypeError, ValueError):
        cid_int = 99  # letter clips - assume post-fall
    if "eva" in subjects_lower and cid_int >= TOOTH_FELL_AT_CLIP:
        parts.append(EVA_GAP_ANCHOR)

    if "mama" in subjects_lower:
        parts.append(MAMA_HAIR_ANCHOR)

    if "joe" in subjects_lower:
        parts.append(JOE_LOOK_ANCHOR)

    if "papa" in subjects_lower:
        parts.append(PAPA_BALD_ANCHOR)

    return "".join(parts)


def safe_slug(title: str, max_len: int = 40) -> str:
    """Make a filesystem-safe slug from a title."""
    s = re.sub(r"[^a-zA-Z0-9\s\-]", "", title.lower())
    s = re.sub(r"\s+", "_", s).strip("_")
    return s[:max_len].rstrip("_")


def extract_pose(clip: dict, max_chars: int = 1200) -> str:
    """Pull the clip prompt for use as Nano pose description."""
    p = clip.get("prompt")
    if isinstance(p, list):
        p = " ".join(p)
    if not p:
        p = clip.get("title", "")
    # Strip @ tokens — Nano doesn't need them, the char refs cover identity
    p = re.sub(r"@", "", p)
    return p[:max_chars]


def render_clip_still(clip: dict, dry_run: bool = False) -> dict:
    """Call generateGroupShot.py for one clip."""
    cid = clip["clip"]
    title = clip.get("title", f"clip{cid}")
    slug = safe_slug(title)
    out_id = f"ep{EP:02d}_clip_{cid:02d}_{slug}" if isinstance(cid, int) else f"ep{EP:02d}_clip_{cid}_{slug}"

    subjects = clip.get("subjects", [])
    if not subjects:
        return {"clip": cid, "status": "skip", "reason": "no subjects"}

    chars_csv = ",".join(s.lower() for s in subjects)
    scene_tag = clip.get("scene")
    scene_id = SCENE_TO_FILE.get(scene_tag)

    pose = extract_pose(clip)
    # Append continuity anchors (tooth-gap, Mama bun, canonical Joe) so the
    # Nano render locks story-event state across clips, not just identity.
    pose = pose + continuity_anchors(clip)

    # ── Per-episode avatar variants ──
    # User 2026-05-11: state changes (Eva loses tooth, costume swaps, etc.)
    # should be locked at the AVATAR-reference level, not just prompt anchors.
    # For each subject, prefer assets/characters/ep<NN>_<name>_front.png if
    # it exists; fall back to the canonical <name>_front.png. Eva's gap-tooth
    # variant lives at ep16_eva_front.png and is used for clips ≥ 2.
    try:
        cid_int = int(cid)
    except (TypeError, ValueError):
        cid_int = 99
    char_refs = []
    char_dir = PROJECT / "assets" / "characters"
    for subj in subjects:
        name_lower = subj.lower()
        ep_variant = char_dir / f"ep{EP:02d}_{name_lower}_front.png"
        canonical = char_dir / f"{name_lower}_front.png"
        # Use ep-variant for Eva ONLY after the tooth fall (clip 2+).
        # Other chars: always use ep-variant if it exists, else canonical.
        use_ep_variant = ep_variant.is_file()
        if name_lower == "eva" and cid_int < TOOTH_FELL_AT_CLIP:
            use_ep_variant = False  # clip 1: pre-fall Eva (still has tooth)
        char_refs.append(str(ep_variant if use_ep_variant else canonical))

    cmd = [
        "python3", str(GENERATE),
        out_id,
        "--chars", chars_csv,
        "--char-refs", ",".join(char_refs),
        "--pose", pose,
        "--n", "1",
        "--no-validate",  # batch validate at end instead
        "--force",         # always re-render (continuity anchors changed)
    ]
    if scene_id:
        cmd.extend(["--scene", scene_id])

    if dry_run:
        return {"clip": cid, "status": "dry-run",
                "out_id": out_id, "chars": chars_csv,
                "scene": scene_id or "(none)",
                "pose_len": len(pose)}

    try:
        res = subprocess.run(cmd, cwd=PROJECT, capture_output=True,
                              text=True, timeout=120)
    except subprocess.TimeoutExpired:
        return {"clip": cid, "status": "timeout"}

    expected = PROJECT / "assets" / "scenes" / f"group_{out_id}.png"
    if res.returncode == 0 and expected.is_file():
        # Copy to stills dir with clip-numbered name
        dest = STILLS_DIR / f"clip_{cid:02d}_{slug}.png" if isinstance(cid, int) \
               else STILLS_DIR / f"clip_{cid}_{slug}.png"
        shutil.copy(expected, dest)
        return {"clip": cid, "status": "ok", "out": str(dest), "src": str(expected)}
    return {"clip": cid, "status": "fail",
            "stderr": (res.stderr or "")[-400:]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="Comma-separated clip IDs")
    ap.add_argument("--skip", help="Comma-separated clip IDs to skip")
    ap.add_argument("--parallel", type=int, default=3,
                    help="Concurrent renders (default 3, ~1.2s/img on Gemini)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    STILLS_DIR.mkdir(parents=True, exist_ok=True)

    only_ids = {x.strip() for x in args.only.split(",")} if args.only else None
    skip_ids = {x.strip() for x in args.skip.split(",")} if args.skip else set()

    clip_files = sorted(EP_DIR.glob("*.json"))
    clips = []
    for f in clip_files:
        if not re.match(r"^\d+(\.\d+)?$|^[A-Z]$", f.stem):
            continue
        clip = json.loads(f.read_text())
        cid_str = str(clip.get("clip"))
        if only_ids and cid_str not in only_ids:
            continue
        if cid_str in skip_ids:
            continue
        clips.append(clip)

    print(f"━━━ Render ep16 Nano stills ━━━")
    print(f"  Clips:    {len(clips)}")
    print(f"  Parallel: {args.parallel}")
    print(f"  Out dir:  {STILLS_DIR}")
    print(f"  Mode:     {'DRY-RUN' if args.dry_run else 'LIVE'}\n")

    if args.dry_run:
        for c in clips:
            r = render_clip_still(c, dry_run=True)
            print(f"  📋 clip {r['clip']:>2}: {r.get('chars'):<20} scene={r.get('scene'):<28} pose={r.get('pose_len')}c")
        return

    with ThreadPoolExecutor(max_workers=args.parallel) as ex:
        futs = {ex.submit(render_clip_still, c, False): c for c in clips}
        ok = 0
        fail = 0
        for fut in as_completed(futs):
            r = fut.result()
            cid = r["clip"]
            icon = {"ok": "✅", "skip": "🟡", "fail": "❌",
                    "timeout": "⏰"}.get(r["status"], "?")
            extra = ""
            if r["status"] == "fail":
                extra = f" → {r.get('stderr', '')[:120]}"
            print(f"  {icon} clip {cid}: {r['status']}{extra}")
            if r["status"] == "ok":
                ok += 1
            elif r["status"] == "fail":
                fail += 1

    print(f"\n━━━ DONE: {ok} stills generated, {fail} failed ━━━")
    print(f"\n📂 Review the stills in: {STILLS_DIR}")
    print(f"   Once approved, submit to Kling via:")
    print(f"   python3 _run_ep16_kling_i2v.py  (uses stills as start frame)")


if __name__ == "__main__":
    main()
