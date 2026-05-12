#!/usr/bin/env python3
"""
Draft a clip JSON spec to the IDEAL template empirically derived from ep01-ep07
(mean 183-560 chars, single paragraph, no Cast LOCKS, 12-22 neg-prompt entries).

Replaces the old verbose Cast-LOCKS + per-shot-timecodes pattern that produced
ghost characters and live-action drift in ep14/ep15.

Usage (programmatic):
    from draftClipSpec import draft_clip
    spec = draft_clip(
        episode=14, clip=3, title="Story setup",
        subjects=["Sara", "Eva", "Papa"],
        scene="ep14-anniversary-living-room",
        action_paragraph=(
            "Wide cinematic shot in @ep14-anniversary-living-room. "
            "@Sara on the LEFT of the couch, curious face. @Eva on the RIGHT "
            "with hands cupped under chin. @Papa CENTER, warm storyteller smile. "
            "Papa: 'Mama and I met TEN years ago, in a tiny cafe...' "
            "Eva (squeaky): 'How did you MEET her, Papa?' Soft golden lamp light."
        ),
        duration_sec=10, native_audio=True,
        is_costumed=False,  # set True ONLY if a costumed element is bound
        clip_specific_negatives=[],  # extra entries on top of canonical baseline
    )

Usage (CLI for one-off drafting):
    python3 draftClipSpec.py --episode 14 --clip 3 \\
        --subjects Sara,Eva,Papa --scene ep14-anniversary-living-room \\
        --action "..." --out content/episodes/ep14/3.json

Why this template
=================
Empirical research across ep01-ep15 (lesson_kling_prompt_length_research_2026_05_07.md):

- ep01-02 mean 183 chars → rendered clean
- ep14 mean 1041 chars (with Cast LOCKS + Shot 1/Shot 2 timecodes) → ghost chars + live-action drift
- ep15 mean 2138 chars → very broken

Anti-patterns this script forbids:
1. Cast LOCKS section (overrides bound @Element image → drift)
2. Per-shot timecode decomposition Shot 1 (0-3s)... Shot 2 (3-7s)... (Omni is single-shot)
3. Parenthetical costume specs (cream sweater + denim leggings) (redundant w/ element)
4. Negative-prompt sprawl > 22 entries
5. CAPS verb shouting in dialogue beats

Output spec validates against lintEpisode.py R1-R16. R13 (length) caps at 700 chars warn.
"""
import argparse
import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")

# ─── Canonical 18-entry negative prompt baseline ──────────────────────────────
# Picked from the high-signal entries that appeared in the clean ep05-ep07 era.
# One synonym per concept; expanded only with clip-specific adds.
CANONICAL_NEG_BASELINE = [
    # Anti-duplication (1 entry, not 8 synonyms)
    "duplicate character",
    # Anti-ghost (1 entry, not 4 synonyms)
    "ghost figure",
    # Anti-extra-limbs (2 entries — anatomy errors are common)
    "extra arm",
    "anatomy error",
    # Anti-morph (continuity locks per lesson_kling_continuity_locks.md)
    "morphing",
    "flickering",
    "disfigured",
    # Anti-horror (kid-show tone)
    "scary face",
    "horror lighting",
    "blood",
    # Anti-camera-shake (cinematic stability)
    "dutch angle",
    "handheld shake",
    "jump cut",
    # Anti-hair-drift (Eva's blonde curls drift to brown sometimes)
    "eva with brown hair",
    "sara in ponytail",
    # Anti-passive (papa-active rule, only for active beats)
    "papa standing still",
    # Anti-real-life (ep14 clip 4 lesson — Kling sometimes falls back to stock footage)
    "live action footage",
    "photographic realism",
]

# ─── Costumed-clip extra negatives (Halloween / swimsuit / etc) ─────────────
COSTUMED_EXTRA_NEG = [
    "no costume",
    "everyday clothing",
    "costume change mid-shot",
]


def validate_action_paragraph(action: str, subjects: list[str] | None = None,
                              native_audio: bool = True) -> list[str]:
    """Return list of issues. Empty list = OK."""
    subjects = subjects or []
    issues = []
    if len(action) > 700:
        issues.append(f"action paragraph {len(action)} chars > 700 (cap is 650 for clean render)")
    if re.search(r"\bCast\s+LOCKS\s*:", action, re.I):
        issues.append("forbidden: Cast LOCKS section (overrides bound element)")
    if len(re.findall(r"\bShot\s+\d+\s*\(\d", action)) >= 2:
        issues.append("forbidden: per-shot timecode decomposition (Omni is single-shot)")
    # R15b prose multi-shot patterns
    for pat, label in (
        (r"\bmulti[\s\-]?shot\b", "multi-shot prose"),
        (r"\bsplit[\s\-]?screen\b", "split-screen"),
        (r"\bvoice\s+off[\s\-]?(?:screen|camera|frame)\b", "off-screen voice"),
        (r"\bscene\s+cuts?\s+to\b", "scene-cuts-to"),
    ):
        if re.search(pat, action, re.I):
            issues.append(f"forbidden: {label} (Kling renders as separate shots → smear)")
    # R17 transition language
    for pat in (r"\bdissolves?\s+into\b", r"\bclears?\s+to\s+reveal\b",
                r"\bfades?\s+to\b", r"\bcuts?\s+to\b", r"\bswirls?\s+into\b"):
        if re.search(pat, action, re.I):
            issues.append(f"forbidden: scene transition '{re.search(pat, action, re.I).group(0)}'")
            break
    if action.count("(") + action.count(")") > 6:
        issues.append("too many parentheticals; likely costume specs / camera nesting noise")
    if re.search(r"\b(?:fair|tan|pale)\s+skin\b", action, re.I):
        issues.append("redundant skin-color spec (canonical avatar handles it)")
    # R18 bare-name dialogue spawn check
    KNOWN_NAMES = ("Sara", "Eva", "Mama", "Papa", "Joe", "Ginger", "Isabel", "Leo", "Lisa")
    for m in re.finditer(r'"([^"]{2,})"', action):
        for name in KNOWN_NAMES:
            if re.search(rf"\b{re.escape(name)}\b", m.group(1)) and name not in subjects:
                issues.append(
                    f"dialogue mentions '{name}' but {name} not in subjects — Kling may spawn "
                    f"a phantom {name}. Use pronoun OR add {name} to subjects.")
                break
    # R19 audio without dialogue (mumble risk)
    if native_audio:
        has_dialogue = bool(re.search(r'"[^"]{2,}"', action))
        has_silence = bool(re.search(
            r"\b(?:no\s+dialogue|silent|silence|only\s+ambient|ambient\s+only)\b",
            action, re.I))
        if not has_dialogue and not has_silence:
            issues.append(
                "nativeAudio=true requires explicit dialogue in quotes OR a silence directive "
                "(e.g. 'no dialogue, only soft ambient cafe sounds'). Otherwise Kling mumbles.")
    return issues


def draft_clip(
    episode: int,
    clip: int | str,
    title: str,
    subjects: list[str],
    scene: str | None,
    action_paragraph: str,
    duration_sec: int = 10,
    native_audio: bool = True,
    is_costumed: bool = False,
    clip_specific_negatives: list[str] | None = None,
    expected_credits: int = 8,
) -> dict:
    """Build an ideal-template clip spec dict."""
    issues = validate_action_paragraph(action_paragraph, subjects, native_audio)
    if issues:
        msg = "draft_clip rejected: action paragraph violates ideal template:\n  - " + "\n  - ".join(issues)
        raise ValueError(msg)

    bound_elements = [{"tag": s, "source": "library"} for s in subjects]
    if scene:
        bound_elements.append({"tag": scene, "source": "library"})

    # Build negative prompt: canonical baseline + costumed extras + clip-specific
    neg = list(CANONICAL_NEG_BASELINE)
    if is_costumed:
        neg.extend(COSTUMED_EXTRA_NEG)
    if clip_specific_negatives:
        neg.extend(clip_specific_negatives)
    # Cap at 22 (R16 warn threshold)
    if len(neg) > 22:
        neg = neg[:22]

    return {
        "episode": episode,
        "beat": clip if isinstance(clip, int) else 0,
        "clip": clip,
        "title": title,
        "mode": "omni",
        "durationSec": duration_sec,
        "quality": "720p",
        "nativeAudio": native_audio,
        "expectedCredits": expected_credits,
        "subjects": subjects,
        "scene": scene,
        "boundElements": bound_elements,
        # Single-paragraph format. List with ONE element to keep readable JSON convention.
        "prompt": [action_paragraph],
        "negativePrompt": neg,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--clip", "-c", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--subjects", required=True, help="comma-list, e.g. Sara,Eva,Papa")
    ap.add_argument("--scene", default=None)
    ap.add_argument("--action", required=True, help="single-paragraph action description")
    ap.add_argument("--costumed", action="store_true")
    ap.add_argument("--neg-extras", default="", help="comma-list extra negative-prompt entries")
    ap.add_argument("--duration", type=int, default=10)
    ap.add_argument("--out", default=None, help="output path; default content/episodes/ep<NN>/<clip>.json")
    args = ap.parse_args()

    subjects = [s.strip() for s in args.subjects.split(",") if s.strip()]
    extras = [s.strip() for s in args.neg_extras.split(",") if s.strip()]
    clip_id = int(args.clip) if args.clip.isdigit() else args.clip

    try:
        spec = draft_clip(
            episode=args.episode, clip=clip_id, title=args.title,
            subjects=subjects, scene=args.scene,
            action_paragraph=args.action,
            duration_sec=args.duration,
            is_costumed=args.costumed,
            clip_specific_negatives=extras,
        )
    except ValueError as e:
        print(f"!! {e}", file=sys.stderr)
        sys.exit(2)

    out_path = Path(args.out) if args.out else (
        PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}" / f"{args.clip}.json"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(spec, indent=2) + "\n")
    try:
        display = out_path.relative_to(PROJECT_ROOT)
    except ValueError:
        display = out_path
    print(f"✓ {display} ({len(args.action)} chars action, {len(spec['negativePrompt'])} neg entries)")


if __name__ == "__main__":
    main()
