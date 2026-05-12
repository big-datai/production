#!/usr/bin/env python3
"""
A/B test: Nano-Banana first-AND-last-frame workflow vs canonical text-to-video.

Per user (Kling rep + Upwork contractor recommendation 2026-05-11):
  - Generate TWO Nano Banana stills: scene BEGINNING + scene END
  - Write a 1-2 sentence action description for what happens between
  - Kling takes (start image + end image + action) → interpolates motion

This is the proven workflow for storytelling animation — Kling's first/last
frame mode produces much more controlled motion than text-to-video alone.

THIS SCRIPT IS A SANDBOX. It does NOT touch the canonical submitOmniViaApi
pipeline. It just:
  1. Reads an existing clip JSON spec
  2. Splits the canonical prompt into START state, ACTION sequence, END state
  3. Generates 2 Nano Banana stills (start pose + end pose) via existing generateGroupShot.py
  4. Distills the action sentences to a short Kling animation prompt
  5. Writes all outputs to a sandbox dir under content/episodes/epNN/_test_nano/

You then manually submit to Kling (UI or API) with:
  - First frame: clip<N>_start.png
  - Last frame: clip<N>_end.png
  - Animation prompt: clip<N>_action.txt
And compare against the same clip already rendered via canonical pipeline.

Usage:
  # Test ep14 clip 5 (Papa-active scene from a proven-working episode)
  python3 _test_nano_first_workflow.py --episode 14 --clip 5

  # Cheap dry-run (skip Nano API calls)
  python3 _test_nano_first_workflow.py --episode 14 --clip 5 --no-render

Output:
  content/episodes/epNN/_test_nano/clipN_start.png
  content/episodes/epNN/_test_nano/clipN_end.png
  content/episodes/epNN/_test_nano/clipN_action.txt
  content/episodes/epNN/_test_nano/clipN_comparison.md
"""
from __future__ import annotations
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
GENERATE_GROUP_SHOT = PROJECT / "content" / "generateGroupShot.py"


def load_clip(ep: int, clip_id) -> dict:
    """Read the per-clip spec JSON."""
    ep_dir = PROJECT / "content" / "episodes" / f"ep{ep:02d}"
    for p in [ep_dir / f"{clip_id}.json",
              ep_dir / f"clip_{clip_id}.json"]:
        if p.is_file():
            return json.loads(p.read_text())
    sys.exit(f"❌ clip spec not found in {ep_dir}/ for clip {clip_id}")


def coerce_prompt(p) -> str:
    if isinstance(p, list):
        return " ".join(p)
    return str(p)


# Production-meta phrases that are NOT pose/motion content — filtered before
# state extraction. These are instructions to the renderer / post-production
# pipeline, not part of the actual scene description.
META_PHRASES = re.compile(
    r"(NO LIP-SYNC|NO voices?|NO speech|Suno song|overlaid in post|"
    r"will be (rendered|added|inserted) in post|"
    r"Static formation|continuous gentle sway only|"
    r"Only (soft|background) music|"
    r"Camera (move|push|pull|pan|tilt)|"
    r"Slow circular camera|"
    r"^[A-Z]\w+ song |^Music|^Audio:|"
    r"render at \d+s)",
    re.I,
)

SUSTAINED_POSE_HINTS = re.compile(
    r"\b(static formation|sustained|same pose throughout|holding pose|"
    r"slow continuous sway|gentle sway only|no major motion|"
    r"locked formation|all in same position)\b",
    re.I,
)


def split_into_states(canonical_prompt: str) -> tuple[str, str, str]:
    """Parse the canonical prompt into (start_state, action_sequence, end_state).

    Heuristic:
      - Strip Cast LOCKS + @anchors + production-meta sentences
      - For sustained-pose shots (e.g. music video slow-dance): start == end,
        with subtle micro-motion in action
      - For motion transitions: first sentences = opening pose, last sentences =
        closing pose, middle = action sequence
    """
    text = re.sub(r"@(\w+)", r"\1", canonical_prompt).strip()
    text = re.sub(r"Cast LOCKS:[^.]+\.", "", text).strip()

    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    # Filter meta sentences
    non_meta = [s for s in sentences if not META_PHRASES.search(s)]
    if not non_meta:
        non_meta = sentences  # fallback if everything looked like meta

    is_sustained = bool(SUSTAINED_POSE_HINTS.search(text))

    if not non_meta:
        return text, text, text

    if len(non_meta) <= 2:
        # Single/double-sentence pose: use whole as both start + end
        full = " ".join(non_meta)
        return full, full, full

    # Identify pose-anchor sentences (positional language) vs verb-only sentences
    pose_re = re.compile(r"\b(center|left|right|behind|front|background|"
                          r"holding|sitting|standing|kneeling|leaning|"
                          r"watching|posing|gathered|on the|at the|by the)\b", re.I)
    pose_sentences = [s for s in non_meta if pose_re.search(s)]
    verb_only = [s for s in non_meta if s not in pose_sentences
                  and re.search(r"\b[A-Z]{3,}\b", s)]

    # Detect "piecemeal composition" — when pose sentences are SHORT fragments
    # (each describing one character's position), they collectively describe
    # ONE composition, not a transition. Treat as sustained.
    short_pose_fragments = [s for s in pose_sentences if len(s) < 35]
    is_piecemeal = len(short_pose_fragments) >= 2

    if is_sustained or is_piecemeal or (len(pose_sentences) >= 2 and not verb_only):
        # Sustained shot — pose anchors describe the whole frame; no real
        # before/after. Use combined pose as both start and end.
        full_pose = " ".join(pose_sentences)
        action_sentences = verb_only or [s for s in non_meta if s not in pose_sentences]
        return full_pose, " ".join(action_sentences) or full_pose, full_pose

    # Motion-transition shot: first pose-anchor = start, last pose-anchor = end
    if pose_sentences:
        start = pose_sentences[0]
        end = pose_sentences[-1] if len(pose_sentences) > 1 else pose_sentences[0]
    else:
        start = non_meta[0]
        end = non_meta[-1]
    action = " ".join([s for s in non_meta if s not in (start, end)])
    return start, action or " ".join(non_meta), end


def distill_action(action_text: str, max_chars: int = 280) -> str:
    """Reduce action description to a 1-2 sentence Kling motion prompt.

    Strategy: keep sentences with CAPS verbs / body parts / action words,
    drop scene-descriptor padding.
    """
    if not action_text:
        return "Subjects perform the actions described in the scene."

    sentences = re.split(r"(?<=[.!?])\s+", action_text)
    motion_sentences = []
    for s in sentences:
        # Sentences with CAPS verbs (KNOCKS, TURNS, REACHES) or body parts
        if (re.search(r"\b[A-Z]{4,}\b", s)
                or re.search(r"\b(hands?|eyes?|mouth|head|arms?|legs?|feet|fingers?|chest|shoulders?)\b", s, re.I)):
            cleaned = re.sub(r"\s+", " ", s).strip()
            if cleaned:
                motion_sentences.append(cleaned)

    if not motion_sentences:
        # Fallback: first 1-2 substantive sentences
        for s in sentences:
            cleaned = re.sub(r"\s+", " ", s).strip()
            if cleaned and 20 < len(cleaned) < 200:
                motion_sentences.append(cleaned)
            if len(motion_sentences) >= 2:
                break

    # Concatenate up to max_chars
    out = ""
    for s in motion_sentences:
        candidate = (out + " " + s).strip() if out else s
        if len(candidate) > max_chars:
            break
        out = candidate
    return out or "Subjects move naturally."


def call_nano(out_id: str, chars: list[str], pose: str, scene: str | None,
              n_candidates: int = 2) -> Path | None:
    """Invoke existing generateGroupShot.py for one Nano Banana render."""
    chars_arg = ",".join(c.lower() for c in chars) if chars else "sara,eva"
    cmd = [
        "python3", str(GENERATE_GROUP_SHOT),
        out_id,
        "--chars", chars_arg,
        "--pose", pose[:500],
        "--n", str(n_candidates),
    ]
    if scene:
        cmd.extend(["--scene", scene])
    print(f"$ python3 generateGroupShot.py {out_id} --chars {chars_arg} --pose '...' --n {n_candidates}")
    try:
        subprocess.run(cmd, cwd=PROJECT, check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode() if e.stderr else ""
        print(f"❌ generateGroupShot.py failed:\n{stderr[-800:]}")
        return None
    expected = PROJECT / "assets" / "scenes" / f"group_{out_id}.png"
    return expected if expected.is_file() else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--clip", "-c", required=True,
                    help="Clip ID (e.g. 5 or 7.5 or A)")
    ap.add_argument("--no-render", action="store_true",
                    help="Skip Nano calls; just distill prompts")
    ap.add_argument("--candidates", type=int, default=2,
                    help="Number of Nano candidates per frame (default 2)")
    args = ap.parse_args()

    try:
        clip_id = int(args.clip)
    except ValueError:
        clip_id = args.clip

    clip = load_clip(args.episode, clip_id)
    canonical_text = coerce_prompt(clip.get("prompt"))
    subjects = clip.get("subjects", [])
    scene = clip.get("scene")

    print(f"━━━ ep{args.episode:02d} clip {clip_id} ━━━")
    print(f"Subjects: {', '.join(subjects)}")
    print(f"Scene: {scene or 'n/a'}")
    print(f"Duration: {clip.get('durationSec', 'n/a')}s")
    print(f"Canonical prompt: {len(canonical_text)} chars\n")

    # Parse into start / action / end
    start_state, action_text, end_state = split_into_states(canonical_text)
    action_prompt = distill_action(action_text)

    print(f"━━━ START FRAME pose ({len(start_state)} chars) ━━━")
    print(start_state)
    print(f"\n━━━ END FRAME pose ({len(end_state)} chars) ━━━")
    print(end_state)
    print(f"\n━━━ ACTION PROMPT ({len(action_prompt)} chars vs canonical {len(canonical_text)}) ━━━")
    print(action_prompt)

    # Sandbox output dir
    sandbox = PROJECT / "content" / "episodes" / f"ep{args.episode:02d}" / "_test_nano"
    sandbox.mkdir(parents=True, exist_ok=True)
    start_img = sandbox / f"clip{clip_id}_start.png"
    end_img = sandbox / f"clip{clip_id}_end.png"
    action_path = sandbox / f"clip{clip_id}_action.txt"
    comparison_path = sandbox / f"clip{clip_id}_comparison.md"

    action_path.write_text(action_prompt + "\n")
    print(f"\n📝 Action prompt → {action_path.relative_to(PROJECT)}")

    comparison_path.write_text(
        f"# ep{args.episode:02d} clip {clip_id} — Workflow A/B comparison\n\n"
        f"**Subjects:** {', '.join(subjects)}  \n"
        f"**Scene:** {scene or 'n/a'}  \n"
        f"**Duration:** {clip.get('durationSec', 'n/a')}s  \n"
        f"**Canonical prompt length:** {len(canonical_text)} chars  \n"
        f"**New action prompt length:** {len(action_prompt)} chars  \n\n"
        f"## A. Canonical workflow (text-to-video, current)\n\n"
        f"```\n{canonical_text}\n```\n\n"
        f"## B. New workflow (start-frame + end-frame + short action)\n\n"
        f"### B1. START FRAME pose ({len(start_state)} chars)\n\n"
        f"```\n{start_state}\n```\n\n"
        f"### B2. END FRAME pose ({len(end_state)} chars)\n\n"
        f"```\n{end_state}\n```\n\n"
        f"### B3. ACTION PROMPT ({len(action_prompt)} chars)\n\n"
        f"```\n{action_prompt}\n```\n\n"
        f"## How to test in Kling\n\n"
        f"1. Submit to Kling via UI or API in first/last-frame mode:\n"
        f"   - First frame: `{start_img.name}`\n"
        f"   - Last frame: `{end_img.name}`\n"
        f"   - Animation prompt: paste contents of `{action_path.name}`\n"
        f"2. Render → compare against the canonical-pipeline mp4 already in `season_01/episode_{args.episode:02d}/clips/{clip_id}.mp4`\n"
        f"3. Score on: identity preservation, motion fidelity, smoothness, cost\n"
    )
    print(f"📝 Comparison doc → {comparison_path.relative_to(PROJECT)}")

    if args.no_render:
        print(f"\n💡 --no-render set; skipping Nano calls.")
        print(f"   Re-run without --no-render to generate both frames.")
        return

    # Generate start frame
    print(f"\n━━━ Generating START frame via Nano Banana ({args.candidates} candidates) ━━━")
    start_id = f"ep{args.episode:02d}_clip{clip_id}_start"
    start_out = call_nano(start_id, subjects, start_state, scene, args.candidates)
    if start_out:
        shutil.copy(start_out, start_img)
        print(f"✅ Start frame: {start_img.relative_to(PROJECT)}")

    # Generate end frame
    print(f"\n━━━ Generating END frame via Nano Banana ({args.candidates} candidates) ━━━")
    end_id = f"ep{args.episode:02d}_clip{clip_id}_end"
    end_out = call_nano(end_id, subjects, end_state, scene, args.candidates)
    if end_out:
        shutil.copy(end_out, end_img)
        print(f"✅ End frame: {end_img.relative_to(PROJECT)}")

    print(f"\n━━━ NEXT STEP (manual) ━━━")
    print(f"  1. Eyeball both frames in {sandbox.relative_to(PROJECT)}/")
    print(f"  2. In Kling, use first/last-frame mode:")
    print(f"       First frame: {start_img.name}")
    print(f"       Last frame:  {end_img.name}")
    print(f"       Prompt:      {action_path.name}")
    print(f"  3. Render → compare to canonical at season_01/episode_{args.episode:02d}/clips/{clip_id}.mp4")
    print(f"  4. Document outcome in {comparison_path.name}")


if __name__ == "__main__":
    main()
