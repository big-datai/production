#!/usr/bin/env python3
"""
Preview EXACTLY what will be submitted to Kling for an episode, side-by-side
with the spec intent. No actual submission. Run this BEFORE mass-submit.

Shows for each unsubmitted clip:
  - INTENT  (spec.subjects, scene, dialogue summary)
  - SUBMISSION (translated prompt with <<<element_N>>>, element_list with names+IDs,
                image_list URLs, sound, duration)
  - Lint findings inline

Usage:
  python3 previewSubmission.py --episode 14
  python3 previewSubmission.py --episode 14 --clip 7   # one clip only
  python3 previewSubmission.py --episode 14 --pending  # only unsubmitted clips

Exit code 0 = clean, 1 = lint errors present.
"""
import argparse
import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
sys.path.insert(0, str(Path(__file__).parent))
from kling_pipeline import (
    coerce_prompt, translate_prompt, build_scene_map, get_registry,
    resolve_element_id, BUCKET,
)


def preview_clip(spec: dict, ep_num: int, state: dict) -> dict:
    """Reconstruct exactly what kling_pipeline.py phase_submit would build."""
    n = spec.get("clip", spec.get("beat", "?"))
    subjects = spec.get("subjects", []) or []

    # Element list (mirrors phase_submit logic exactly)
    element_list, element_order, missing = [], [], []
    for char in subjects:
        if char in element_order: continue
        eid = resolve_element_id(char, ep_num)
        if not eid:
            missing.append(char); continue
        element_order.append(char)
        element_list.append({"element_id": eid})

    # Translated prompt
    raw_prompt = coerce_prompt(spec.get("prompt"), sep="\n\n")
    translated = translate_prompt(raw_prompt, element_order)

    # Image list
    bucket_https = f"https://storage.googleapis.com/{BUCKET}/ep{ep_num:02d}"
    image_urls = []
    scene_map = build_scene_map(ep_num)
    if spec.get("scene") and scene_map.get(spec["scene"]):
        image_urls.append(f"{bucket_https}/{scene_map[spec['scene']]}")

    # Continuity start_image (last frame of previous clip)
    prev_key = f"clip_{int(n) - 1}" if isinstance(n, int) else None
    start_image = None
    if prev_key:
        start_image = state.get("lastFrames", {}).get(prev_key, {}).get("httpsUrl")

    return {
        "clip": n,
        "subjects": subjects,
        "scene": spec.get("scene"),
        "duration": spec.get("durationSec", 10),
        "sound_on": bool(spec.get("nativeAudio")),
        "element_list": element_list,
        "element_order_with_ids": [(c, resolve_element_id(c, ep_num)) for c in element_order],
        "image_urls": image_urls,
        "start_image": start_image,
        "missing_elements": missing,
        "raw_prompt": raw_prompt,
        "translated_prompt": translated,
        "negative_prompt": coerce_prompt(spec.get("negativePrompt"), sep=", "),
        "title": spec.get("title", ""),
    }


def render_preview(p: dict) -> str:
    lines = []
    lines.append(f"\n{'═' * 78}")
    lines.append(f"CLIP {p['clip']}  —  {p['title']}")
    lines.append("═" * 78)
    # Two-column header
    lines.append(f"\n  📋 INTENT (from spec):")
    lines.append(f"     subjects:  {p['subjects']}")
    lines.append(f"     scene:     {p['scene']}")
    lines.append(f"     duration:  {p['duration']}s, sound={'on' if p['sound_on'] else 'off'}")
    lines.append(f"\n     dialogue lines from prompt:")
    for q in re.findall(r'"([^"]+)"', p["raw_prompt"]):
        lines.append(f"       • \"{q}\"")
    lines.append(f"\n  📤 SUBMISSION TO KLING:")
    lines.append(f"     element_list ({len(p['element_list'])}):")
    for idx, (name, eid) in enumerate(p["element_order_with_ids"], 1):
        lines.append(f"       <<<element_{idx}>>>  =  {name} (id {eid})")
    if p["missing_elements"]:
        lines.append(f"     ⚠ MISSING ELEMENTS (not in registry): {p['missing_elements']}")
    lines.append(f"     image_list ({len(p['image_urls'])}):")
    for u in p["image_urls"]:
        lines.append(f"       • {u}")
    if p["start_image"]:
        lines.append(f"     🎬 continuity start_image: {p['start_image'][:80]}...")
    lines.append(f"\n     translated prompt ({len(p['translated_prompt'])} chars):")
    # indent each line of translated prompt
    for line in p["translated_prompt"].split("\n"):
        if line.strip():
            lines.append(f"       {line}")
    lines.append(f"\n     negative prompt: {p['negative_prompt'][:200]}...")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--clip", "-c", default=None, help="single clip number (preview just one)")
    ap.add_argument("--pending", action="store_true", help="only clips not yet submitted")
    args = ap.parse_args()

    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
    state = json.loads((ep_dir / "_pipeline_state.json").read_text())
    submitted_clips = set(state.get("clipTasks", {}).keys())

    # Find clip JSON files
    clip_files = []
    for f in sorted(ep_dir.iterdir(), key=lambda p: (0 if p.stem.isdigit() else 1, int(p.stem) if p.stem.isdigit() else p.stem)):
        if not (re.fullmatch(r"\d+(\.\d+)?\.json", f.name) or re.fullmatch(r"[A-Z]\.json", f.name)):
            continue
        cid = f.stem
        if args.clip and cid != args.clip: continue
        if args.pending and f"clip_{cid}" in submitted_clips: continue
        clip_files.append(f)

    print(f"\n=== Preview: ep{args.episode:02d} — {len(clip_files)} clip(s) ===")
    n_with_missing = 0
    for f in clip_files:
        spec = json.loads(f.read_text())
        spec["clip"] = f.stem
        p = preview_clip(spec, args.episode, state)
        print(render_preview(p))
        if p["missing_elements"]: n_with_missing += 1

    print(f"\n{'═' * 78}")
    print(f"Summary: {len(clip_files)} clip(s) previewed, {n_with_missing} with missing elements")
    if n_with_missing > 0: sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
