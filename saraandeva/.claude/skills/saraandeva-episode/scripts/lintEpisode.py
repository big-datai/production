#!/usr/bin/env python3
"""
Deterministic linter for a Sara & Eva episode spec. Replaces the ~40 hard-rule
prose checks scattered across docs/lessons/*.md. Run this BEFORE submitting any
clip to Kling — saves $5-15/episode in re-renders.

Usage:
  python3 lintEpisode.py --episode 15
  python3 lintEpisode.py --episode 15 --strict   # exit non-zero on warnings too

Exit codes:
  0  no errors
  1  errors present (don't submit)
  2  warnings present (review but submittable; only with --strict does it fail)
"""
import argparse, json, re, sys
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")

# ─── Rule catalog ──────────────────────────────────────────────────────────
# Each rule returns (level, message) where level ∈ {error, warn}
# Sources: docs/lessons/lesson_kling_omni_pipeline_fixes.md, lesson_kling_costumed_elements_and_dialogue.md,
#          lesson_kids_show_comedy_intensity.md, lesson_no_red_splatter_kids_show.md,
#          lesson_kling_motion_verbs_duplicate.md, lesson_papa_play_scene_per_episode.md,
#          lesson_fourth_wall_audience_engagement.md, lesson_kling_omni_api_schema.md

PROMPT_CAP = 2500
MAX_BOUND_PER_CLIP = 7
ELEMENT_REF_EXPANSION = 10  # @Sara (5) → <<<element_1>>> (15)

BANNED_INTENSITY_WORDS = [
    r"\bapoplectic\b", r"\bthundering (?:shout|voice|roar)\b", r"\brage face\b",
    r"\benraged\b", r"\bfurious face\b", r"\bscreaming at\b", r"\bbellowing at\b",
    r"\bleaves tremble\b", r"\bground shakes\b", r"\bwindows rattle\b",
]

BANNED_PET_AIRBORNE = [
    r"\b(?:joe|ginger|dog) airborne\b", r"\b(?:joe|ginger|dog) leap(?:s|ing)? (?:onto|over|through)\b",
    r"\bflying through\b", r"\blaunches onto\b",
]

MOTION_TOWARD_VERBS = [
    r"\bwalks (?:in|toward|up to|over to|into)\b", r"\bapproaches\b",
    r"\bmoves to(?:ward)?\b", r"\bheads (?:in|to|toward|over)\b",
]

RED_LIQUID_NEAR_FACE = [
    # red/crimson/scarlet/blood-red + splatter/splash/spray etc + face/mouth/chin/apron-front
    (r"\b(?:red|crimson|scarlet|blood[\s-]red)\b.{0,40}\b(?:splatter|splash|spray|drip|drizzle|spurt|gush|burst|smear|stain)\b",
     "red-liquid splatter language"),
    (r"\b(?:splatter|splash)\b.{0,30}\b(?:face|mouth|chin|apron|cheek)\b", "splatter near face/mouth/chin"),
]


def load_episode(ep_num: int):
    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{ep_num:02d}"
    if not ep_dir.is_dir():
        print(f"!! episode dir not found: {ep_dir}", file=sys.stderr)
        sys.exit(1)
    episode = json.loads((ep_dir / "episode.json").read_text())
    clips = []
    for f in sorted(ep_dir.iterdir()):
        if re.fullmatch(r"\d+\.json", f.name) or re.fullmatch(r"[A-Z]\.json", f.name):
            spec = json.loads(f.read_text())
            spec["_file"] = f.name
            clips.append(spec)
    return episode, clips


# ─── Per-clip rules ────────────────────────────────────────────────────────
def lint_clip(clip: dict):
    findings = []
    f = clip.get("_file", "<?>")
    prompt = clip.get("prompt", "") or ""
    subjects = clip.get("subjects", []) or []
    bound = clip.get("boundElements", []) or []

    # R1. Prompt 2500-char cap (post-expansion)
    n_refs = len(re.findall(r"@(?:Sara|Eva|Mama|Papa|Joe|Ginger|Isabel|Leo|Lisa|Mrs\.?\s*Patel)\b", prompt))
    expanded = len(prompt) + n_refs * ELEMENT_REF_EXPANSION
    if expanded > PROMPT_CAP:
        findings.append(("error", f"R1 prompt overflow: {len(prompt)} chars + {n_refs} refs ⇒ ~{expanded} > {PROMPT_CAP}"))
    elif expanded > PROMPT_CAP - 50:
        findings.append(("warn", f"R1 prompt close to cap: ~{expanded}/{PROMPT_CAP}"))

    # R2. subjects non-empty
    if not subjects:
        findings.append(("error", "R2 subjects[] is empty"))

    # R3. boundElements ≤ 7
    if len(bound) > MAX_BOUND_PER_CLIP:
        findings.append(("error", f"R3 too many boundElements: {len(bound)} > {MAX_BOUND_PER_CLIP}"))

    # R4. Each @Tag appears once (per-character, not counting <<<element_N>>>)
    for char in subjects:
        c = re.escape(char)
        # Bare @Tag mentions (not preceded by <)
        n = len(re.findall(rf"(?<![<a-zA-Z]){c.replace(' ', '_')}|@{c}\b", prompt))
        # Heuristic — too imprecise to error on; warn only
        if n > 6:
            findings.append(("warn", f"R4 '@{char}' appears {n}× in prompt (over 6 may double-render)"))

    # R5. Banned intensity words (kid-show comedy tone)
    for pat in BANNED_INTENSITY_WORDS:
        if re.search(pat, prompt, re.I):
            findings.append(("error", f"R5 banned intensity word: /{pat}/"))

    # R6. Banned pet-airborne
    for pat in BANNED_PET_AIRBORNE:
        if re.search(pat, prompt, re.I):
            findings.append(("error", f"R6 banned pet-airborne: /{pat}/"))

    # R7. Motion-toward verbs
    for pat in MOTION_TOWARD_VERBS:
        if re.search(pat, prompt, re.I):
            findings.append(("warn", f"R7 motion-toward verb (may double character): /{pat}/"))

    # R8. Red liquid near face
    for pat, msg in RED_LIQUID_NEAR_FACE:
        if re.search(pat, prompt, re.I):
            findings.append(("error", f"R8 {msg}: /{pat}/"))

    # R9. Group nouns (memory: "everyone", "the family", "both girls", "the kids", "the sisters")
    for pat in [r"\beveryone\b", r"\bthe family\b", r"\bboth girls\b", r"\bthe kids\b", r"\bthe sisters\b"]:
        if re.search(pat, prompt, re.I):
            findings.append(("warn", f"R9 group noun (may spawn strangers): /{pat}/"))

    # R10. negativePrompt should exist for any clip
    if not (clip.get("negativePrompt") or "").strip():
        findings.append(("warn", "R10 missing negativePrompt"))

    return findings


# ─── Episode-level rules ───────────────────────────────────────────────────
def lint_episode(episode: dict, clips: list):
    findings = []

    # E1. 2–4 audience-ask beats
    asks = sum(1 for c in clips if "AUDIENCE-ASK" in (c.get("title", "") + c.get("prompt", "")).upper()
               or re.search(r"to camera", (c.get("prompt") or ""), re.I))
    if asks < 2:
        findings.append(("error", f"E1 only {asks} audience-ask beats (need 2-4)"))
    elif asks > 4:
        findings.append(("warn", f"E1 {asks} audience-ask beats (cap is 4)"))

    # E2. Papa-active 15s parent-activity scene present
    parent_15s = [c for c in clips
                  if c.get("durationSec") == 15 or "PARENT-ACTIVITY" in (c.get("title", "") or "").upper()]
    if not parent_15s:
        findings.append(("error", "E2 missing 15s parent-activity scene (papa-active rule)"))

    # E3. Final cliffhanger should be a camera-ask
    if clips:
        last = clips[-1]
        last_text = (last.get("title", "") + last.get("prompt", "")).upper()
        if "CLIFFHANGER" not in last_text and "CAMERA-ASK" not in last_text:
            findings.append(("warn", "E3 last clip may not be a cliffhanger camera-ask"))

    # E4. Total expected credits ≤ 2200 (abort threshold)
    total = episode.get("expectedCreditsTotal", 0)
    if total > 2200:
        findings.append(("warn", f"E4 expected total {total} cr exceeds 2200 abort threshold"))

    # E5. Costumed-element coverage — every newCostumePreviews entry must have
    # a matching ep<NN>_<Char> element in content/elements_registry.json.
    # Filename convention: group_ep<NN>_<char>_<costume>_preview.png → element key ep<NN>_<Char>.
    # ep15 caught us with Papa: papa_werewolf_preview.png existed but ep15_Papa was never created,
    # so kling_ep15_pipeline.mjs fell back to generic Papa (everyday look) and rendered Papa
    # inconsistently across clips 7, 10 (bare element) vs 17, 19, 20 (group still).
    previews = episode.get("newCostumePreviews", []) or []
    if previews:
        ep_num = episode.get("episode")
        if ep_num:
            ep_prefix = f"ep{int(ep_num):02d}_"
            registry_path = PROJECT_ROOT / "content" / "elements_registry.json"
            registry = {}
            if registry_path.is_file():
                try: registry = json.loads(registry_path.read_text())
                except json.JSONDecodeError: pass
            preview_pat = re.compile(r"(?:group_)?ep\d{2}_(\w+?)_[\w_]*preview\.png", re.I)
            for p in previews:
                m = preview_pat.search(p)
                if not m: continue
                char_key = m.group(1).capitalize()
                if char_key in ("Joe", "Ginger", "Sara", "Eva", "Papa", "Mama", "Isabel", "Leo"):
                    expected = f"{ep_prefix}{char_key}"
                    if expected not in registry:
                        findings.append(("error",
                            f"E5 costume preview {p!r} declares {char_key} costume but {expected!r} "
                            f"missing from elements_registry.json — Kling will fall back to generic "
                            f"{char_key} element (everyday look) and render inconsistently."))

    return findings


# ─── Main ──────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--strict", action="store_true", help="exit 2 on warnings")
    args = ap.parse_args()

    episode, clips = load_episode(args.episode)
    n_errors = n_warns = 0

    print(f"Linting ep{args.episode:02d} — {len(clips)} clip specs\n")

    for c in clips:
        f = c["_file"]
        findings = lint_clip(c)
        if not findings:
            print(f"  ✅ {f}")
            continue
        for lvl, msg in findings:
            mark = "🔴" if lvl == "error" else "🟡"
            print(f"  {mark} {f}  {msg}")
            if lvl == "error": n_errors += 1
            else: n_warns += 1

    print()
    print("Episode-level rules:")
    for lvl, msg in lint_episode(episode, clips):
        mark = "🔴" if lvl == "error" else "🟡"
        print(f"  {mark} {msg}")
        if lvl == "error": n_errors += 1
        else: n_warns += 1

    print(f"\n=== {n_errors} error(s), {n_warns} warning(s) ===")
    if n_errors > 0: sys.exit(1)
    if args.strict and n_warns > 0: sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
