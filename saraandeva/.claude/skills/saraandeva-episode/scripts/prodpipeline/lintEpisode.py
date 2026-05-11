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
    # All conjugations: walk(s|ing|ed) + start(s|ing) walking + similar
    r"\bwalk(?:s|ing|ed)?\s+(?:in|toward|towards|up to|over to|into|across|to)\b",
    r"\b(?:starts?|starting|began|begins|begin)\s+walking\b",
    r"\bapproach(?:es|ing|ed)?\b",
    r"\bmov(?:es|ing|ed)\s+to(?:ward|wards)?\b",
    r"\bhead(?:s|ing|ed)?\s+(?:in|to|toward|towards|over)\b",
    r"\bwander(?:s|ing|ed)?\s+(?:to|toward|towards|over)\b",
    r"\bgo(?:es|ing|ne)?\s+to\s+(?:the|her|his)\b",  # "goes to the table" / "going to her"
    r"\brushes?\s+(?:to|toward|towards)\b",
    r"\bcrosses?\s+(?:to|toward|towards|the\s+room|the\s+floor)\b",
]

RED_LIQUID_NEAR_FACE = [
    # red/crimson/scarlet/blood-red + splatter/splash/spray etc + face/mouth/chin/apron-front
    (r"\b(?:red|crimson|scarlet|blood[\s-]red)\b.{0,40}\b(?:splatter|splash|spray|drip|drizzle|spurt|gush|burst|smear|stain)\b",
     "red-liquid splatter language"),
    (r"\b(?:splatter|splash)\b.{0,30}\b(?:face|mouth|chin|apron|cheek)\b", "splatter near face/mouth/chin"),
]

# R12 — phantom Cast LOCK detection.
# Visual-description keywords (hair, clothing, color, anatomy) — if 2+ appear in the
# 120 chars after `<Name>:`, that's a positive render instruction for <Name> regardless
# of whether <Name> is in subjects[]. Lesson: lesson_kling_phantom_character_from_lock.md.
VISUAL_KEYWORDS_PAT = re.compile(
    r"\b(hair|eyes?|skin|beard|moustache|mustache|glasses|"
    r"sweater|henley|shirt|jeans|dress|skirt|pants|leggings|onesie|cardigan|trousers|"
    r"sneakers|boots|backpack|crossbody|"
    r"blonde|brunette|brown|black|blond|"
    r"fair|tan|pale|"
    r"wavy|curly|straight|bobbed|"
    r"sage|navy|cream|mustard|lemon|lavender|beige|olive|charcoal)\b",
    re.I,
)

# Recognized character names (canonical + ep14/15 named extras).
# Multi-word + underscore variants both included so the pattern catches "Mrs. Patel" and "young_Papa".
KNOWN_CHARS_PAT = re.compile(
    r"(?:^|[\s,;.\"\(\)\-—])(@?)("
    r"young_Papa|young_Mama|baby_Sara|baby_Eva|puppy_Joe|mama_with_camera|"
    r"Mrs\.?\s*Patel|"
    r"Sara|Eva|Mama|Papa|Joe|Ginger|Isabel|Leo|Lisa"
    r")\s*:\s*"
)


def load_episode(ep_num: int):
    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{ep_num:02d}"
    if not ep_dir.is_dir():
        print(f"!! episode dir not found: {ep_dir}", file=sys.stderr)
        sys.exit(1)
    episode = json.loads((ep_dir / "episode.json").read_text())
    clips = []
    for f in sorted(ep_dir.iterdir()):
        if re.fullmatch(r"\d+(\.\d+)?\.json", f.name) or re.fullmatch(r"[A-Z]\.json", f.name):
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

    # R4 + R21. Pattern Z (ep01-07 working pattern, confirmed 2026-05-07):
    #   1× @Char in action context (binds element)
    #   1× bare `Char (tone):` or `Char:` in dialogue attribution (no @ prefix, with colon)
    #   0× bare-name re-mentions in action ("Sara giggles", "Mama smiles") — these spawn
    #     phantoms similar to dialogue-spawn (R18). Pronouns ALSO don't work — Kling
    #     can't bind "she/he" to a specific character.
    #   Follow-up actions = ANONYMOUS body parts ("fingers on lips, eyes wide", "head tilts").
    for char in subjects:
        c = re.escape(char)
        # Total bare-name mentions (no @ prefix)
        bare_pat = rf"(?<![<@a-zA-Z]){c}(?:'s)?\b"
        all_bare = list(re.finditer(bare_pat, prompt))
        # Dialogue-attribution mentions: `Char (tone):` or `Char:` followed by quote
        dlg_pat = rf"(?<![<@a-zA-Z]){c}(?:\s*\([^)]+\))?\s*:\s*[\"“]"
        dlg_mentions = list(re.finditer(dlg_pat, prompt))
        n_dlg = len(dlg_mentions)
        # Bare-name mentions NOT in dialogue attribution = action-context (forbidden)
        dlg_starts = {m.start() for m in dlg_mentions}
        bare_action = [m for m in all_bare if m.start() not in dlg_starts]
        n_bare_action = len(bare_action)
        # @-prefixed mentions
        n_at = len(re.findall(rf"@{c}\b", prompt))

        if n_at > 4:
            findings.append(("error",
                f"R4 '@{char}' appears {n_at}× — Kling renders duplicate ghosts. "
                f"Pattern Z: 1× @-tag on first action mention only. After that use anonymous "
                f"body parts (e.g. 'fingers on lips', 'head tilts')."))
        elif n_at > 2:
            findings.append(("warn",
                f"R4 '@{char}' appears {n_at}× — Pattern Z allows 1× @-tag for action. "
                f"Subsequent actions should be anonymous body parts. Pronouns DON'T WORK in Kling."))

        if n_bare_action > 1:
            findings.append(("error",
                f"R21 '{char}' bare-name appears {n_bare_action}× in action context — phantom spawn risk. "
                f"Pattern Z: only allow bare name in dialogue attribution `{char} (tone):` or `{char}:`. "
                f"For follow-up actions use anonymous body parts."))
        elif n_bare_action == 1:
            findings.append(("warn",
                f"R21 '{char}' bare-name appears once in action context — risky. Pattern Z says "
                f"bare name only in `{char} (tone): \"dialogue\"` form. Replace with anonymous body part."))

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

    # R13. Total prompt length cap (soft).
    # Empirical: ep01-ep07 mean ~183-560 chars rendered clean; ep11+ mean 1400+ produces ghost chars
    # and live-action drift. Lesson: lesson_kling_prompt_length_research_2026_05_07.md.
    total_chars = len(prompt)
    if total_chars > 1100:
        findings.append(("error", f"R13 prompt {total_chars} chars > 1100 — too dense, Kling drifts. Compress to ≤700."))
    elif total_chars > 700:
        findings.append(("warn", f"R13 prompt {total_chars} chars > 700 — historical clean renders were ≤650. Consider compressing."))

    # R14. No Cast LOCKS section unless this clip uses a costumed element.
    # Cast LOCKS empirically OVERRIDE the bound @Element image and cause drift. Only useful when
    # forcing a costume identity (Halloween, swimsuit) on top of canonical anchor.
    has_cast_locks = bool(re.search(r"\bCast\s+LOCKS\s*:", prompt, re.I))
    is_costume_clip = any(
        any(kw in (b.get("tag") or "").lower() for kw in ("hw_", "halloween", "costume", "swim", "werewolf", "unicorn", "dino"))
        for b in bound
    )
    if has_cast_locks and not is_costume_clip:
        findings.append(("warn", "R14 Cast LOCKS section present on a non-costumed clip — empirically overrides bound @Element and causes drift. Remove the Cast LOCKS block; the @Tag reference IS the lock."))

    # R17. Multi-scene transitions in disguise (post-R15 trap).
    # User caught 2026-05-07: stripping "Shot 1/Shot 2" labels isn't enough — if the prompt
    # still says "DISSOLVES into / haze CLEARS to reveal / fades to / cuts to" the prompt is
    # still multi-shot semantically. Kling renders the second scene as stock footage / drift
    # (ep14 clip 4 → live-action coffee then live-action street).
    # ONE prompt = ONE continuous scene. No transitions, dissolves, reveals.
    transition_patterns = [
        r"\bdissolves?\s+(?:into|to)\b",
        r"\btransitions?\s+to\b",
        r"\bcuts?\s+to\b",
        r"\bfades?\s+(?:to|into)\b",
        r"\bcross[\s\-]?fade(?:s|d)?\b",
        r"\bclears?\s+to\s+reveal\b",
        r"\bpulls?\s+back\s+to\s+reveal\b",
        r"\bswirls?\s+into\b",
        r"\bthe\s+scene\s+(?:shifts|changes|cuts|fades|becomes)\b",
        r"\bwe\s+(?:are\s+entering|enter)\b",
        r"\bsoft\s+transition\b",
    ]
    for pat in transition_patterns:
        m = re.search(pat, prompt, re.I)
        if m:
            findings.append(("error",
                f"R17 multi-scene transition language in single-prompt: '{m.group(0)}'. "
                f"Kling renders transitions as separate scenes (often stock footage). "
                f"Collapse to ONE continuous scene; let assembly add cuts/dissolves in post."))
            break  # one error per clip is enough

    # R15. No per-shot timecode decomposition AND no prose multi-shot smuggling.
    # Kling Omni renders ONE continuous shot. Multi-shot prompts get blended into smear or
    # rendered as separate stock-footage segments (ep14 clip 4 → live-action coffee + street).
    # Two patterns to catch:
    #   (a) explicit timecodes: "Shot 1 (0-3s)... Shot 2 (3-7s)..."
    #   (b) prose multi-shot: "Multi-shot composition.", "voice off-screen", "soft focus on X"
    #       after dialogue (= scene cut), "split-screen", "scene cuts to", "two-shot then close-up"
    multi_shot = re.findall(r"\bShot\s+\d+\s*\(\d", prompt)
    if len(multi_shot) >= 2:
        findings.append(("error", f"R15a prompt has {len(multi_shot)} `Shot N (...)` timecode segments — Omni is single-shot. Collapse to one paragraph."))

    R15_PROSE_PATTERNS = [
        (r"\bmulti[\s\-]?shot\b", "multi-shot prose"),
        (r"\bsplit[\s\-]?screen\b", "split-screen prose"),
        (r"\bvoice\s+off[\s\-]?(?:screen|camera|frame)\b", "off-screen voice (= separate shot)"),
        (r"\boff[\s\-]?(?:screen|camera|frame)\s+(?:voice|narration)\b", "off-screen voice"),
        (r"\bscene\s+cuts?\s+to\b", "scene cuts to"),
        (r"\bwe\s+cut\s+to\b", "explicit cut"),
        (r"\btwo[\s\-]?shot\s+then\b", "two-shot then close-up"),
        (r"\b(?:then|next)\s+(?:we\s+see|the\s+camera)\b", "sequential shot framing"),
        (r"\bsoft\s+focus\s+on\s+the\b", "soft-focus shift to detail (= cut to insert)"),
    ]
    for pat, label in R15_PROSE_PATTERNS:
        m = re.search(pat, prompt, re.I)
        if m:
            findings.append(("error",
                f"R15b multi-shot in disguise ({label}): '{m.group(0)}'. "
                f"Kling renders this as multiple shots → smear/stock-footage. "
                f"Rewrite as ONE continuous shot."))
            break

    # R16. Negative-prompt entry count.
    # ep01-07 used 10-22 entries (clean). ep15 has 118 with self-contradictions like
    # `papa standing still`+`papa motionless`+`papa idle`. Model averages them out → no signal.
    neg_raw = clip.get("negativePrompt")
    if isinstance(neg_raw, list):
        neg_count = len(neg_raw)
    elif isinstance(neg_raw, str):
        neg_count = len([x for x in neg_raw.split(",") if x.strip()])
    else:
        neg_count = 0
    if neg_count > 30:
        findings.append(("error", f"R16 negativePrompt has {neg_count} entries > 30 — ep01-07 used 10-22. Compress to ≤22."))
    elif neg_count > 22:
        findings.append(("warn", f"R16 negativePrompt has {neg_count} entries > 22 — historical clean was 10-22. Consider deduping synonyms."))

    # R18. Bare character name in dialogue can spawn the character.
    # ep14 clip 2 (v2): Cast LOCKS removed but Papa's dialogue said "Mama and I have been
    # together for TEN years today." → Kling rendered phantom Mama as 4th character.
    # The literal name inside quotes is enough to make Kling include the character.
    # Fix: use pronoun ("she", "her", "your mom") OR add the character to subjects so
    # element_id binds her identity properly (controlled render vs phantom clone).
    KNOWN_NAMES_IN_DIALOGUE = ("Sara", "Eva", "Mama", "Papa", "Joe", "Ginger", "Isabel", "Leo", "Lisa")
    # Find all quoted dialogue blocks
    for m in re.finditer(r'"([^"]{2,})"', prompt):
        spoken = m.group(1)
        for name in KNOWN_NAMES_IN_DIALOGUE:
            if re.search(rf"\b{re.escape(name)}\b", spoken) and name not in subjects:
                findings.append(("warn",
                    f"R18 dialogue mentions {name!r} but {name} not in subjects[] — "
                    f"Kling may spawn {name} as a phantom render. Use pronoun (she/her/your mom) "
                    f"or add {name} to subjects with bound element_id for controlled identity."))
                break

    # R19. nativeAudio=true requires dialogue OR a STRONG silence directive.
    # ep14 clip 6 (v2): no dialogue + sound:on → unclear mumble.
    # ep14 clip 20 (Rome): WEAK silence "No dialogue, only soft ambient sounds" → Kling
    # generated foreign-language (Italian) babble anyway because of the location scene.
    # Strong directive must mention "no speech in any language" + "no foreign-language babble".
    if clip.get("nativeAudio"):
        has_dialogue = bool(re.search(r'"[^"]{2,}"', prompt))
        # Strong silence: must mention either "no speech in any language" OR similar foreign-block
        has_strong_silence = bool(re.search(
            r"\bno\s+(?:speech|voices?|dialogue)\s+in\s+any\s+language\b|"
            r"\bno\s+foreign[\s\-]language\b|"
            r"\bsilent\b",
            prompt, re.I))
        has_weak_silence = bool(re.search(
            r"\b(?:no\s+dialogue|only\s+ambient|ambient\s+only|no\s+speech)\b",
            prompt, re.I))
        if not has_dialogue and not has_strong_silence and not has_weak_silence:
            findings.append(("warn",
                "R19 nativeAudio=true but NO dialogue or silence directive — "
                "Kling will auto-generate mumble. Add explicit dialogue OR strong silence "
                "directive: 'Absolutely NO dialogue, NO voices, NO speech in any language. "
                "Only soft music and ambient sound effects.'"))
        elif not has_dialogue and has_weak_silence and not has_strong_silence:
            # Foreign-location scenes especially need the strong version
            FOREIGN_SCENES = {"ep14-cafe-mams-country", "ep14-german-autumn-road",
                              "ep14-rome-colosseum", "ep14-bulgaria-ski-slope",
                              "ep14-disney-paris-castle"}
            if clip.get("scene") in FOREIGN_SCENES:
                findings.append(("warn",
                    f"R19 weak silence directive in foreign-location scene {clip.get('scene')!r} — "
                    f"Kling may still generate foreign-language babble. Use strong form: "
                    f"'no speech in any language, no foreign-language babble'."))

    # R29. Multi-character hard cap — 3 chars max per shot in dynamic pose.
    # ep14 clip 28 (2026-05-08): 4 chars in "arms wide open celebration" cloned Eva.
    # 6 chars produced ghost-Papa + ghost-Ginger. Splitting into 1+3 char beats
    # eliminates drift entirely.
    # Memory: lesson_kling_multi_character_drift.md + lesson_split_complex_shots.md.
    # Exception: clip uses an audited Pattern E group still in image_list (image_list URL
    # contains 'group_*' filename matching the same chars).
    n_subj = len(subjects)
    has_group_still = False
    # Detect Pattern E reference: spec.scene tag starts with 'ep<NN>-' and points to a
    # `group_*` filename in episode.json's newSceneElements
    if clip.get("scene"):
        # Easy heuristic: if scene tag contains "surprise"/"group"/"selfie"/"hug"
        # OR scene's asset is group_*.png, treat as Pattern E
        scene_tag = clip.get("scene", "")
        if any(kw in scene_tag.lower() for kw in ("group", "surprise", "selfie", "family-shot", "ensemble")):
            has_group_still = True
    if n_subj > 3 and not has_group_still:
        # Detect dynamic pose keywords — drift is much worse on dynamic vs static
        DYNAMIC_KEYWORDS = [
            r"\barms\s+wide\b", r"\bjump(?:s|ing)?\b", r"\brun(?:s|ning)?\b",
            r"\bdanc(?:e|ing)\b", r"\bcelebrat(?:e|ing|ion)\b", r"\bspin(?:s|ning)?\b",
            r"\bleap(?:s|ing)?\b", r"\bbouncing\b", r"\bcheering\b",
        ]
        is_dynamic = any(re.search(pat, prompt, re.I) for pat in DYNAMIC_KEYWORDS)
        if is_dynamic:
            findings.append(("error",
                f"R29 {n_subj} subjects in dynamic-pose composition — Kling drifts hard at 4+ "
                f"chars (ep14 clip 28: cloned Eva, ghost Papa). Split into multiple ≤3-char beats "
                f"OR generate verified Pattern E group still (auditScenePNG-passed) and reference "
                f"in scene field."))
        elif n_subj >= 5:
            findings.append(("warn",
                f"R29 {n_subj} subjects (no dynamic pose) — even static 5+ char shots may drift. "
                f"Consider splitting into 2 beats OR using audited Pattern E group still."))

    # R28. Body-part action density — too many hand/arm/finger mentions causes anatomy errors.
    # ep14 clip 21 (2026-05-08): Mama rendered with 3 hands. Prompt had 5+ hand/arm references
    # spread across young_Mama, young_Papa, baby_Sara → Kling consolidated extra limbs onto one
    # character. Limit to ≤4 body-part action verbs per clip.
    body_part_verbs = re.findall(
        r"\b(?:hand|arm|fist|finger|leg|foot|knee|elbow|shoulder|palm|wrist|thumb)s?\b",
        prompt, re.I
    )
    if len(body_part_verbs) > 5:
        findings.append(("error",
            f"R28 too many body-part references ({len(body_part_verbs)}: {body_part_verbs[:8]}). "
            f"Kling renders extra limbs (e.g. Mama with 3 hands). Reduce to ≤3."))
    elif len(body_part_verbs) > 3:
        findings.append(("warn",
            f"R28 elevated body-part density ({len(body_part_verbs)} mentions: {body_part_verbs[:6]}). "
            f"Risk of anatomy errors (extra arm, 3 hands). Consider consolidating actions."))

    # R25. durationSec must be a Kling-supported value.
    # Kling Omni v3 accepts: 5, 10, 15 (15 = parent-active extended duration).
    # Anything else may fail or get coerced. ep14 clip 7.5 was drafted as 3s — had to be 5s.
    valid_durations = {5, 10, 15}
    dur = clip.get("durationSec")
    if dur is not None and dur not in valid_durations:
        findings.append(("error",
            f"R25 durationSec={dur} is not a Kling-supported value. "
            f"Allowed: {sorted(valid_durations)}. (Trim shorter in post if needed.)"))

    # R26. Manual-eyeball-required flag for clips with 2+ same-age similar-looking subjects.
    # Gemini character ID is unreliable when 2+ subjects share age range / silhouette
    # (e.g. Sara+Eva both little blonde girls; baby_Sara+baby_Eva both newborns).
    # Surface a warn so operator knows audit alone isn't enough.
    SIMILAR_GROUPS = [
        {"Sara", "Eva"},                                  # 7yo + 3yo, both blonde
        {"baby_Sara", "baby_Eva"},                        # both newborns
        {"young_Mama", "Mama"},                            # both blonde adults
        {"young_Papa", "Papa"},                            # both bald + beard
    ]
    s_set = set(subjects)
    for grp in SIMILAR_GROUPS:
        if len(s_set & grp) >= 2:
            findings.append(("warn",
                f"R26 subjects {sorted(s_set & grp)} are visually similar — Gemini audit may "
                f"misidentify them. Manual eyeball verification REQUIRED before accepting render."))
            break

    # R23. Scene context required in prompt body.
    # ep14 clip 3 v3 (2026-05-08): spec.scene='ep14-anniversary-living-room' but prompt body
    # had ZERO scene-context words (no "couch", "lamp", "fairy lights", "balloons"). Kling had
    # to invent the setting. The image_list provides visual but the prompt body needs verbal
    # anchor too. Working ep03 pattern: open with "Medium shot in @Scene — <description>".
    SCENE_CONTEXT_KEYWORDS = {
        "ep14-anniversary-living-room": ["anniversary", "living room", "couch", "fairy", "balloons", "mantel", "lamp"],
        "ep14-cafe-mams-country": ["cafe", "wood", "marble", "brass", "pendants", "coffee"],
        "ep14-german-autumn-road": ["german", "vineyards", "cobblestone", "castle", "autumn"],
        "ep14-rome-colosseum": ["colosseum", "rome", "roman", "gelato", "piazza"],
        "ep14-bulgaria-ski-slope": ["ski", "snow", "slope", "pirin", "bansko", "pine"],
        "ep14-disney-paris-castle": ["castle", "fireworks", "disney", "paris", "sleeping beauty"],
        "ep14-wedding-garden": ["wedding", "garden", "archway", "peonies", "ivy"],
        "ep14-hospital-birth-room": ["hospital", "bed", "swaddle", "balloons", "blanket"],
    }
    # Cross-scene contradictions — words that imply a DIFFERENT scene than spec.scene
    WRONG_SCENE_KEYWORDS = {
        "ep14-cafe-mams-country": ["airport", "kitchen", "bedroom", "outdoors", "street",
                                     "ski", "snow", "castle", "wedding"],
        "ep14-anniversary-living-room": ["cafe", "airport", "ski", "snow", "wedding",
                                          "outdoors", "ocean", "beach", "park"],
        "ep14-german-autumn-road": ["cafe", "indoor", "kitchen", "hospital", "ski"],
        "ep14-rome-colosseum": ["cafe interior", "indoor", "hospital", "ski"],
        "ep14-bulgaria-ski-slope": ["cafe", "hospital", "wedding", "indoor", "ocean"],
        "ep14-disney-paris-castle": ["cafe", "hospital", "ski", "indoor"],
        "ep14-wedding-garden": ["cafe", "hospital", "ski", "kitchen"],
        "ep14-hospital-birth-room": ["cafe", "outdoor", "ski", "wedding"],
    }
    scene = clip.get("scene")
    if scene:
        kws = SCENE_CONTEXT_KEYWORDS.get(scene)
        if kws:
            hits = [k for k in kws if re.search(rf"\b{re.escape(k)}\b", prompt, re.I)]
            if len(hits) < 2:
                findings.append(("warn",
                    f"R23 spec.scene={scene!r} but prompt has fewer than 2 scene-context "
                    f"keywords (found {hits or 'NONE'}; expected ≥2 from {kws[:5]}). "
                    f"Kling will invent the setting. Add a verbal anchor like 'Medium shot "
                    f"in {scene} — <description with scene words>'."))
        # Cross-scene contradiction: words that imply a DIFFERENT scene.
        # Only flag the word if it appears in ACTION context, not in dialogue (within quotes).
        # Strip dialogue first so e.g. Papa narrating "It started in a little cafe" doesn't
        # falsely trigger R23b on a present-day living-room clip.
        prompt_action_only = re.sub(r'"[^"]*"', "", prompt)
        wrong_kws = WRONG_SCENE_KEYWORDS.get(scene, [])
        for wkw in wrong_kws:
            if re.search(rf"\b{re.escape(wkw)}\b", prompt_action_only, re.I):
                findings.append(("warn",
                    f"R23b prompt contains '{wkw}' (in action context, not dialogue) but "
                    f"spec.scene={scene!r} — contradicting scene + image_list MAY produce "
                    f"drift/stock-footage. Consider: change spec.scene to fit, drop scene "
                    f"(no image_list), or generate a new scene PNG that matches."))

    # R22. Every subject MUST have ≥1× @-placement in the prompt.
    # ep14 clip 3 v3 (2026-05-08): subjects=[Sara, Eva, Papa] but my Pattern Z rewrite
    # only @-placed @Eva and @Papa. Sara had no @-tag → Kling rendered without her.
    # Element binding (element_list) gives Kling the IDENTITY but not the PLACEMENT.
    # Without an @-anchor in the prompt, Kling has no reason to render the character.
    for char in subjects:
        c = re.escape(char)
        n_at = len(re.findall(rf"@{c}\b", prompt))
        if n_at == 0:
            findings.append(("error",
                f"R22 '{char}' is in subjects[] but has 0× @-placement in prompt — "
                f"Kling won't render the character. Pattern Z requires exactly 1× @{char} "
                f"in action context (e.g. '@{char} on the LEFT', '@{char} curled at his side')."))

    # R20. Scene-density triggers that spawn ambient extras.
    # ep14 clip 5 (v2): subjects=[young_Papa] alone, but prompt said "Charming European cafe
    # storefronts framing both sides" → Kling rendered ~3 ambient pedestrians (4 humans total).
    # Acceptable for some shots but flag so drafter can choose.
    DENSITY_TRIGGERS = [
        r"\bstorefronts?\s+framing\b",
        r"\bbustling\b",
        r"\bcrowded\b",
        r"\bpassers?-?by\b",
        r"\bcafe\s+patrons?\b",
        r"\bpedestrians?\b",
        r"\bbusy\s+street\b",
    ]
    for pat in DENSITY_TRIGGERS:
        m = re.search(pat, prompt, re.I)
        if m:
            findings.append(("warn",
                f"R20 scene-density trigger '{m.group(0)}' may spawn ambient extras. "
                f"For solo/duo shots use 'single quiet alley' / 'empty cafe' / 'no other people' instead."))
            break

    # R12. Phantom Cast LOCK — character with visual description in prompt body but NOT in subjects[].
    # Kling reads `<Name>: <hair> <skin> <clothing> ...` as a positive render instruction and will
    # spawn the character even though they're not in element_list. Negative-prompt removal is
    # unreliable against an explicit positive lock. Lesson: lesson_kling_phantom_character_from_lock.md.
    # ep14 retrospective: clip 3 had "Mama: straight blonde hair, sage sweater..." in Cast LOCKS
    # while subjects=[Sara,Eva,Papa]. Mama spawned. This rule catches it pre-submit.
    subject_set_norm = {s.replace(" ", "").replace(".", "").replace("_", "").lower() for s in subjects}
    seen_phantoms = set()
    for m in KNOWN_CHARS_PAT.finditer(prompt):
        name = m.group(2).strip()
        # Normalize for subject comparison (drop spaces, underscores, dots)
        name_norm = name.replace(" ", "").replace(".", "").replace("_", "").lower()
        if name_norm in subject_set_norm or name in seen_phantoms:
            continue
        # Look at next 120 chars
        after = prompt[m.end():m.end() + 120]
        # If a quote starts within 30 chars, it's dialogue (e.g. `Papa: "Hello"`) — only flag
        # if 2+ visual keywords appear BEFORE the quote.
        quote_pos = after.find('"')
        scan_window = after[:quote_pos] if 0 <= quote_pos < 30 else after
        kws = VISUAL_KEYWORDS_PAT.findall(scan_window)
        if len(kws) >= 2:
            seen_phantoms.add(name)
            findings.append(("error",
                f"R12 phantom Cast LOCK: '{name}: ...{scan_window[:50].strip()}...' "
                f"but {name!r} not in subjects[]={subjects}. Kling will spawn this character "
                f"even though not in element_list. Strip the visual lock or add {name} to subjects."))

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

    # E9. Bubble Guppies-style multiple-choice question beat — mandatory ≥1 per episode.
    # User directive 2026-05-08: every Sara&Eva episode must engage kids with an
    # interactive Q&A beat (3 options, suspense pause, highlight correct answer).
    # Memory: lesson_bubble_guppies_questions.md.
    n_question_beats = sum(1 for c in clips if c.get("questionBeat"))
    if n_question_beats == 0:
        findings.append(("error",
            "E9 episode has 0 multiple-choice question beats — MANDATORY ≥1 per episode. "
            "Add a clip with `questionBeat: {question, options[3], correctIndex, "
            "displayHighlightAtSec}`. See lesson_bubble_guppies_questions.md."))
    elif n_question_beats > 4:
        findings.append(("warn",
            f"E9 episode has {n_question_beats} question beats — recommended 1-3. "
            f"Too many may slow narrative pace."))

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

    # ─── E17-E23: YouTube title/description SEO + MfK strategy rules (2026-05-11) ─
    # See: saraandeva/docs/lessons/lesson_title_seo_formula_2026_05.md
    #      saraandeva/docs/lessons/lesson_made_for_kids_classifier_triggers.md
    yt_meta = episode.get("youtubeMetadata", {}) or {}
    yt_title = yt_meta.get("title", "") or episode.get("title", "")
    yt_desc = yt_meta.get("description", "") or ""
    yt_tags = yt_meta.get("tags", []) or []

    # E17 (WARN). Title contains "Ep N" / "Episode N" — competitor channels never do this.
    if re.search(r"\b(Ep|Episode)\s*\d+\b", yt_title, re.I):
        findings.append(("warn",
            f"E17 title contains 'Ep N' / 'Episode N' — top kid channels (Like Nastya, "
            f"Vlad & Niki, Cocomelon) never use episode numbers in titles. Move ep# to "
            f"description body. See lesson_title_seo_formula_2026_05.md. Title: {yt_title!r}"))

    # E18 (WARN). Title doesn't start with a high-volume keyword
    HIGH_VOLUME_FIRST_WORDS = (
        "tooth", "dentist", "father", "mother", "birthday", "magic", "first",
        "bedtime", "bath", "playground", "doctor", "pancake", "puppy", "joe", "ginger",
        "sara", "eva", "halloween", "christmas", "easter", "thanksgiving", "soccer",
        "library", "swimming", "beach", "splash", "camping", "lemonade", "cooking",
        "breakfast", "sleepover",
    )
    # Skip articles/stopwords at the start ("The", "A", "An")
    STOP_WORDS = {"the", "a", "an", "and", "or"}
    title_words = [w.strip("'\"!?.,#@").lower() for w in yt_title.split() if w.strip("'\"!?.,#@")]
    first_word = next((w for w in title_words if w not in STOP_WORDS), "")
    if first_word and first_word not in HIGH_VOLUME_FIRST_WORDS:
        findings.append(("warn",
            f"E18 title doesn't start with a high-volume keyword. First word: {first_word!r}. "
            f"See reference_youtube_kids_search_keywords_2026.md for the list."))

    # E19 (ERROR). Banned Made-for-Kids classifier hashtags
    BANNED_HASHTAGS = ("#KidsCartoon", "#CartoonsForKids", "#PreschoolLearning",
                       "#KidsShow", "#kidscartoon", "#cartoonsforkids",
                       "#preschoollearning", "#kidsshow")
    desc_lower = yt_desc.lower()
    for h in BANNED_HASHTAGS:
        if h.lower() in desc_lower:
            findings.append(("error",
                f"E19 description contains banned MfK-classifier hashtag {h!r}. "
                f"Strip per lesson_made_for_kids_classifier_triggers.md. "
                f"Triggers YouTube's classifier to flip madeForKids=True even when "
                f"selfDeclaredMadeForKids=False."))
    BANNED_TAGS = {"kidscartoon", "cartoonsforkids", "preschoollearning", "kidsshow",
                   "kids cartoon", "cartoons for kids", "preschool learning"}
    for t in yt_tags:
        if t.lower().strip() in BANNED_TAGS:
            findings.append(("error",
                f"E19 tags contain banned MfK-classifier tag {t!r}. Strip per "
                f"lesson_made_for_kids_classifier_triggers.md."))

    # E20 (WARN). Description's first 150 chars should contain a high-volume keyword
    if yt_desc:
        first_150 = yt_desc[:150].lower()
        if not any(k in first_150 for k in HIGH_VOLUME_FIRST_WORDS):
            findings.append(("warn",
                f"E20 description first 150 chars lack any high-volume keyword. "
                f"Front-load SEO terms in the first line. See lesson_title_seo_formula_2026_05.md."))

    # E21 (ERROR). Title exceeds 100 chars (YouTube hard limit)
    if len(yt_title) > 100:
        findings.append(("error",
            f"E21 title length {len(yt_title)} > 100 char hard cap. Trim. Title: {yt_title!r}"))

    # E22 (ERROR). Description should start with playlist link
    PLAYLIST_ID = "PLMLz_1vaheL7MwZ8OdmSPd1qftZ_WRwvS"
    if yt_desc and PLAYLIST_ID not in yt_desc[:200]:
        findings.append(("error",
            f"E22 description doesn't include 'Watch in Order' playlist URL in first 200 chars. "
            f"Expected playlist ID {PLAYLIST_ID}. Front-load it per the description template."))

    # E23 (WARN). Description contains MfK-classifier phrase
    MFK_PHRASES = (
        "kids' show", "animated kids' show", "kids show", "animated kids show",
        "for kids", "preschool-safe", "toddler-safe", "made for kids",
    )
    desc_lower2 = yt_desc.lower()
    for phrase in MFK_PHRASES:
        if phrase.lower() in desc_lower2:
            findings.append(("warn",
                f"E23 description contains MfK-classifier phrase {phrase!r}. "
                f"Replace with 'family series', 'for families', 'family-safe', 'made for families'. "
                f"See lesson_made_for_kids_classifier_triggers.md."))

    return findings


# ─── Main ──────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--strict", action="store_true", help="exit 2 on warnings")
    ap.add_argument("--skip-submitted", action="store_true",
                    help="exclude clips with task_id in state (already-rendered clips don't block re-submits of others)")
    args = ap.parse_args()

    episode, clips = load_episode(args.episode)
    if args.skip_submitted:
        ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
        sp = ep_dir / "_pipeline_state.json"
        if sp.is_file():
            try:
                state = json.loads(sp.read_text())
                submitted = {k for k, v in (state.get("clipTasks") or {}).items() if v.get("task_id")}
                # Filter: keep only clips whose `clip_<stem>` is NOT in submitted
                clips = [c for c in clips if f"clip_{c['_file'].replace('.json', '')}" not in submitted]
                print(f"  (--skip-submitted: linting {len(clips)} unsubmitted clips)")
            except Exception: pass
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

    if not args.skip_submitted:
        # Episode-level rules (E1-E8) only run when linting the FULL episode;
        # in --skip-submitted mode the clip set is partial and these would
        # false-fire (e.g. E1 'no audience-ask beats' because they're filtered out).
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
