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
import argparse
import json
import re
import sys
import time
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
def coerce_prompt(v, sep: str = "\n\n") -> str:
    """prompt / negativePrompt can be list[str] (readable JSON, recommended) or str (legacy)."""
    if v is None: return ""
    if isinstance(v, list): return sep.join(str(x) for x in v)
    return str(v)


def lint_clip(clip: dict):
    findings = []
    f = clip.get("_file", "<?>")
    prompt = coerce_prompt(clip.get("prompt"), sep="\n\n")
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
    if not coerce_prompt(clip.get("negativePrompt"), sep=", ").strip():
        findings.append(("warn", "R10 missing negativePrompt"))

    # R11. Orphan @-ref: every @<Char> in prompt body must be in subjects[].
    # The submit pipeline (kling_ep15_pipeline.mjs:translatePromptToElementSyntax)
    # only translates @-refs whose name is in the elementOrder built from subjects[].
    # If the spec mentions @Joe but Joe was removed from subjects, the @-ref goes
    # to Kling as literal text and Kling has no element to bind it to. Renders
    # garbage or invents a generic dog. ep15 retrospective: this is what would
    # silently break a v3 of clip 17 if we drop Joe from subjects but leave
    # "@Joe leans" in the prompt body.
    # Multi-word names ("Mrs. Patel") need their full match — build a regex per subject.
    subject_set = set(subjects)
    # Find all @-mentions: @Char (possibly multi-word for "Mrs. Patel")
    # Pattern: @<Capitalized-word>(?: <Capitalized-word>)? followed by punct/space.
    at_pattern = re.compile(r"@([A-Z][a-zA-Z]*(?:\.\s+[A-Z][a-zA-Z]*)?)(?=['\s.,;:!?\)])")
    seen_orphans = set()
    for m in at_pattern.finditer(prompt):
        name = m.group(1).strip()
        # Drop trailing punctuation just in case
        if name not in subject_set and name not in seen_orphans:
            seen_orphans.add(name)
            findings.append(("error",
                f"R11 prompt mentions @{name!r} but it's NOT in subjects[]={subjects} — "
                f"the submit translator can't resolve it; @{name} will go to Kling as "
                f"literal text and the character won't bind to any element."))

    return findings


# ─── Episode-level rules ───────────────────────────────────────────────────
def lint_episode(episode: dict, clips: list):
    findings = []

    # ─── Common setup (used by E5, E6, E8) ────────────────────────────────
    ep_num = episode.get("episode")
    ep_prefix = f"ep{int(ep_num):02d}_" if ep_num else ""
    registry_path = PROJECT_ROOT / "content" / "elements_registry.json"
    registry = {}
    if registry_path.is_file():
        try: registry = json.loads(registry_path.read_text())
        except json.JSONDecodeError: pass
    previews = episode.get("newCostumePreviews", []) or []
    preview_pat = re.compile(r"(?:group_)?ep\d{2}_(\w+?)_[\w_]*preview\.png", re.I)

    # E1. 2–4 audience-ask beats
    asks = sum(1 for c in clips if "AUDIENCE-ASK" in (c.get("title", "") + coerce_prompt(c.get("prompt"))).upper()
               or re.search(r"to camera", coerce_prompt(c.get("prompt")), re.I))
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
        last_text = (last.get("title", "") + coerce_prompt(last.get("prompt"))).upper()
        if "CLIFFHANGER" not in last_text and "CAMERA-ASK" not in last_text:
            findings.append(("warn", "E3 last clip may not be a cliffhanger camera-ask"))

    # E4. Total expected credits ≤ 2200 (abort threshold)
    total = episode.get("expectedCreditsTotal", 0)
    if total > 2200:
        findings.append(("warn", f"E4 expected total {total} cr exceeds 2200 abort threshold"))

    # E6. Cross-clip element consistency — every character in episode.cast must
    # resolve to the SAME element_id across every clip they appear in. Catches
    # name typos (e.g. "Mama" vs "mama" vs "Mom") and missing-element silent
    # fallbacks before submission. Same logic as kling_ep15_pipeline.mjs
    # resolveElementId(): prefer ep<NN>_<Name> over <Name>.
    if ep_num:
        def resolve(name):
            return registry.get(f"{ep_prefix}{name}") or registry.get(name)

        # build map of char -> set of (clip_file, resolved_element_id) where char appeared
        char_resolutions = {}  # {char: {(file, eid_or_None)}}
        for c in clips:
            f = c["_file"]
            for s in (c.get("subjects") or []):
                eid = resolve(s)
                char_resolutions.setdefault(s, set()).add((f, eid))

        for char, pairs in char_resolutions.items():
            eids = {eid for _, eid in pairs}
            files = sorted({f for f, _ in pairs})
            if None in eids:
                missing_files = [f for f, eid in pairs if eid is None]
                findings.append(("error",
                    f"E6 character {char!r} has NO element in registry "
                    f"(neither {ep_prefix}{char} nor bare {char}); clips: {missing_files} "
                    f"will be submitted with this char missing from element_list."))
            elif len(eids) > 1:
                findings.append(("error",
                    f"E6 character {char!r} resolves to multiple element_ids "
                    f"across the episode: {eids} — Kling will render inconsistently. "
                    f"clips: {files}"))

    # E7. Costume keyword in every clip-prompt where a costumed character appears.
    # ep15 found that Joe/Ginger costume reverted in some clips because the action
    # lines didn't mention "ladybug" / "pumpkin cape" — Kling defaulted to baseline
    # Pomeranian/Jack-Russell. Forcing the costume keyword in EVERY clip where the
    # character appears keeps the costume locked.
    continuity = episode.get("continuity", {}) or {}
    costume_keywords = {}  # {Char: [keyword, ...]}
    for char_key, desc in continuity.items():
        m = re.search(r"costume:\s*([^.\n]{3,80})", desc or "", re.I)
        if not m: continue
        # normalize char_key (joe → Joe, mrspatel → Mrs. Patel)
        char = {"joe": "Joe", "ginger": "Ginger", "sara": "Sara", "eva": "Eva",
                "papa": "Papa", "mama": "Mama", "isabel": "Isabel", "leo": "Leo",
                "lisa": "Lisa", "mrspatel": "Mrs. Patel"}.get(char_key.lower(), char_key.capitalize())
        # extract substantive words (4+ chars, skip stopwords)
        STOP = {"with", "and", "the", "her", "his", "their", "onesie", "costume"}
        words = [w.lower().strip(",.;:") for w in re.split(r"[\s\-+]+", m.group(1)) if len(w) >= 4]
        words = [w for w in words if w not in STOP]
        if words:
            costume_keywords[char] = words[:3]   # top 3

    for c in clips:
        f = c["_file"]
        prompt = coerce_prompt(c.get("prompt"))
        for s in (c.get("subjects") or []):
            kws = costume_keywords.get(s)
            if not kws: continue
            if not any(re.search(rf"\b{re.escape(kw)}\w*", prompt, re.I) for kw in kws):
                findings.append(("warn",
                    f"E7 {f}: {s!r} in subjects but prompt doesn't mention costume keyword "
                    f"({'|'.join(kws)}) — Kling may render {s} without costume."))

    # E8. Registry ↔ Kling library coverage. Reads /tmp/kling_elements_cache.json
    # (populated by syncElementsRegistry.py within the last 60s; refreshed if
    # missing or stale). Catches the ep15-style failure where the Kling library
    # has costumed elements that aren't in the local registry — agent could
    # create duplicates if it ran a "create" workflow without checking first.
    cache_p = Path("/tmp/kling_elements_cache.json")
    if not cache_p.is_file() or (time.time() - cache_p.stat().st_mtime) > 60:
        # Lint shouldn't make API calls itself (it must run fast + offline).
        # Just print an info note that cache is stale and skip E8.
        findings.append(("warn", "E8 cache stale or missing; run syncElementsRegistry.py to populate /tmp/kling_elements_cache.json"))
    else:
        try:
            cache_data = json.loads(cache_p.read_text())
        except json.JSONDecodeError:
            cache_data = []
        # Build name → list[ids] from envelopes
        kling_by_name = {}
        for envelope in cache_data:
            inner = (envelope.get("task_result") or {}).get("elements") or []
            for el in inner:
                nm = el.get("element_name") or ""
                eid = el.get("element_id")
                if nm and eid:
                    kling_by_name.setdefault(nm, []).append(int(eid))

        # E8a (warn): registry entry whose value is NOT in Kling library at all (orphan)
        kling_all_ids = {eid for ids in kling_by_name.values() for eid in ids}
        for k, v in registry.items():
            if k.startswith("_") or not isinstance(v, (int, str)): continue
            try:
                vid = int(v)
                if vid not in kling_all_ids:
                    findings.append(("warn",
                        f"E8a registry[{k!r}]={vid} not in Kling library — element may have been deleted "
                        f"or registry has stale ID."))
            except (ValueError, TypeError): pass

        # E8b (error): episode declares costume preview for char X but Kling library
        # has zero matches for ep<NN>_<X> AND zero matches for <X>_HW_<*>.
        for p in previews:
            m = preview_pat.search(p)
            if not m: continue
            char = m.group(1).capitalize()
            expected = f"{ep_prefix}{char}"
            hw_pattern = re.compile(rf"^{re.escape(char)}_HW_\w+$")
            if expected not in kling_by_name and not any(hw_pattern.match(n) for n in kling_by_name):
                findings.append(("error",
                    f"E8b costume preview {p!r} expects {expected!r} or {char}_HW_* on Kling but neither "
                    f"exists. Upload PNG + create element before submit."))

        # E8c (warn): Kling library has ep<NN>_<X> or <X>_HW_<*> not in registry
        for nm in kling_by_name:
            mm = re.fullmatch(rf"ep{int(ep_num):02d}_(\w+)", nm) if ep_num else None
            mh = re.fullmatch(r"(\w+)_HW_\w+", nm)
            char = (mm.group(1) if mm else None) or (mh.group(1) if mh else None)
            if not char: continue
            registry_key = f"{ep_prefix}{char}"
            if registry_key not in registry:
                findings.append(("warn",
                    f"E8c Kling library has {nm!r} but registry has no {registry_key!r} — "
                    f"run syncElementsRegistry.py to add."))

    # E5. Costumed-element coverage — every newCostumePreviews entry must have
    # a matching ep<NN>_<Char> element in content/elements_registry.json.
    if previews and ep_num:
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
