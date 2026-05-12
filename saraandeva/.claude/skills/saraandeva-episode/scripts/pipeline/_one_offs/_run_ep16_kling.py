#!/usr/bin/env python3
"""Submit all ep16 clips to Kling via the canonical submitOmniViaApi.mjs.

Loops over content/episodes/ep16/*.json (clips 1-22), writes prompt + negative
to temp files, calls submitOmniViaApi.mjs with --parallel 4 budget.

Skips clip 15 by default (image-to-video first/last-frame mode is a different
submitter — handle separately).

State is tracked in `_kling_state.json` so re-running is idempotent — already-
submitted-or-completed clips are skipped.

Usage:
  python3 _run_ep16_kling.py                 # submit all (canonical 21)
  python3 _run_ep16_kling.py --only 5,7,10   # specific clips
  python3 _run_ep16_kling.py --include-15    # also try clip 15 via omni
  python3 _run_ep16_kling.py --dry-run       # print plan, don't submit
"""
from __future__ import annotations
import argparse
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

PROJECT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
EP = 16
EP_DIR = PROJECT / "content" / "episodes" / f"ep{EP:02d}"
SCRIPT = PROJECT / ".claude" / "skills" / "saraandeva-episode" / "scripts" / "submitOmniViaApi.mjs"
OUT_DIR = PROJECT / "season_01" / f"episode_{EP:02d}" / "clips"
PROMPT_DIR = EP_DIR / "prompts"
STATE_FILE = EP_DIR / "_kling_state.json"
BUCKET = "https://storage.googleapis.com/saraandeva-kling-elements"

# Scene name → public URL anchor
SCENE_URLS = {
    "ep16-bathroom-mirror": f"{BUCKET}/ep16/ep16_bathroom_mirror.png",
    "ep16-evas-bedroom-night": f"{BUCKET}/ep16/ep16_evas_bedroom_night.png",
    "ep16-living-room-detective": f"{BUCKET}/ep16/ep16_living_room_detective.png",
    "kitchen_morning": f"{BUCKET}/scenes/kitchen_morning.png",
}

PARALLEL = 4
SOUND_ON_FOR_DIALOGUE = True  # set --sound on when nativeAudio=true (+33% cost)


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"clips": {}}


def save_state(s: dict):
    STATE_FILE.write_text(json.dumps(s, indent=2))


def write_prompt_files(clip: dict) -> tuple[Path, Path]:
    """Write clip prompt + negative to PROMPT_DIR, return paths."""
    PROMPT_DIR.mkdir(parents=True, exist_ok=True)
    cid = clip["clip"]
    p = PROMPT_DIR / f"clip{cid}.txt"
    n = PROMPT_DIR / f"clip{cid}.neg.txt"
    prompt = clip["prompt"]
    if isinstance(prompt, list):
        prompt = " ".join(prompt)
    p.write_text(prompt.strip() + "\n")
    neg = clip.get("negativePrompt", [])
    n.write_text(", ".join(neg) + "\n" if neg else "")
    return p, n


def submit_clip(clip: dict, dry_run: bool = False) -> dict:
    """Submit one clip via submitOmniViaApi.mjs. Returns status dict."""
    cid = clip["clip"]
    duration = int(clip.get("durationSec", 10))
    subjects = [s for s in clip.get("subjects", []) if s.lower() != "joe"
                or s in clip.get("subjects", [])]  # keep Joe
    elements_csv = ",".join(clip["subjects"])
    scene_tag = clip.get("scene")
    anchor = SCENE_URLS.get(scene_tag)
    if not anchor:
        return {"clip": cid, "status": "skip",
                "reason": f"unknown scene anchor for tag '{scene_tag}'"}

    p_file, n_file = write_prompt_files(clip)
    out = OUT_DIR / f"{cid}.mp4"
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if out.exists():
        return {"clip": cid, "status": "cached", "out": str(out)}

    cmd = [
        "node", str(SCRIPT),
        "--anchor", anchor,
        "--elements", elements_csv,
        "--prompt-file", str(p_file),
        "--negative-file", str(n_file),
        "--duration", str(duration),
        "--mode", "std",
        "--aspect-ratio", "16:9",
        "--external-id", f"ep16-clip{cid}-1",
        "--out", str(out),
    ]
    if SOUND_ON_FOR_DIALOGUE and clip.get("nativeAudio"):
        cmd.extend(["--sound", "on"])

    if dry_run:
        return {"clip": cid, "status": "dry-run",
                "cmd": " ".join(f'"{c}"' if " " in c else c for c in cmd)}

    print(f"  ▶️  clip {cid}: submit (dur={duration}s, chars={elements_csv}, scene={scene_tag})")
    t0 = time.time()
    try:
        res = subprocess.run(cmd, cwd=PROJECT, capture_output=True, text=True,
                              timeout=1200)
    except subprocess.TimeoutExpired:
        return {"clip": cid, "status": "timeout"}

    dt = time.time() - t0
    if res.returncode == 0 and out.is_file():
        return {"clip": cid, "status": "ok", "out": str(out),
                "duration_s": round(dt, 1)}
    return {"clip": cid, "status": "fail",
            "code": res.returncode,
            "stderr": (res.stderr or "")[-500:],
            "stdout": (res.stdout or "")[-300:]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", type=str, help="Comma-separated clip IDs to submit (e.g. 5,7,10)")
    ap.add_argument("--include-15", action="store_true",
                    help="Include clip 15 (default skips it — handle separately as first/last-frame)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--parallel", type=int, default=PARALLEL)
    args = ap.parse_args()

    only_ids: set[int] | None = None
    if args.only:
        only_ids = {int(x) for x in args.only.split(",")}

    # Load clips
    clip_files = sorted(EP_DIR.glob("*.json"),
                        key=lambda p: int(p.stem) if p.stem.isdigit() else 99)
    clips = []
    for f in clip_files:
        try:
            cid = int(f.stem)
        except ValueError:
            continue
        clip = json.loads(f.read_text())
        if only_ids is not None and cid not in only_ids:
            continue
        if cid == 15 and not args.include_15:
            print(f"  ⏭️  clip 15 SKIPPED (Nano first/last-frame — submit separately)")
            continue
        clips.append(clip)

    print(f"━━━ ep16 Kling submit ━━━")
    print(f"  Clips queued:  {len(clips)}")
    print(f"  Parallel:      {args.parallel}")
    print(f"  Mode:          {'DRY-RUN' if args.dry_run else 'LIVE'}")
    print(f"  Output dir:    {OUT_DIR}\n")

    state = load_state()
    results = []

    if args.dry_run:
        for c in clips:
            r = submit_clip(c, dry_run=True)
            print(f"\n━━━ clip {r['clip']}  [{c.get('title', '?')[:55]}] ━━━")
            print(f"  status:     {r['status']}")
            print(f"  duration:   {c.get('durationSec')}s")
            print(f"  subjects:   {c.get('subjects')}")
            print(f"  scene:      {c.get('scene')}")
            # Element mapping table
            import json as _j
            try:
                reg = _j.load(open("/Volumes/Samsung500/goreadling-production/saraandeva/content/elements_registry.json"))
            except Exception:
                reg = {}
            print(f"  @Name → element_N mapping:")
            for i, name in enumerate(c.get("subjects", []), start=1):
                eid = reg.get(name, "❌ NOT IN REGISTRY")
                print(f"     @{name:<8} → element_{i}  (id={eid})")
            prompt = c.get("prompt")
            if isinstance(prompt, list): prompt = " ".join(prompt)
            print(f"  prompt (first 240 chars):")
            print(f"     {prompt[:240]}{'...' if len(prompt) > 240 else ''}")
            if "cmd" in r:
                print(f"  full command:")
                # split each --flag onto its own line for readability
                cmd = r["cmd"]
                for line in cmd.replace(" --", " \\\n     --").split("\n"):
                    print(f"     {line}")
        return

    with ThreadPoolExecutor(max_workers=args.parallel) as ex:
        futs = {ex.submit(submit_clip, c, False): c for c in clips}
        for fut in as_completed(futs):
            r = fut.result()
            cid = r["clip"]
            state["clips"][f"clip_{cid}"] = r
            save_state(state)
            results.append(r)
            icon = {"ok": "✅", "cached": "⏭️", "skip": "🟡",
                    "fail": "❌", "timeout": "⏰"}.get(r["status"], "?")
            extra = ""
            if r["status"] == "fail":
                extra = f" → {r.get('stderr', '')[:120]}"
            print(f"  {icon} clip {cid}: {r['status']}{extra}")

    ok = sum(1 for r in results if r["status"] in ("ok", "cached"))
    print(f"\n━━━ DONE: {ok}/{len(results)} succeeded ━━━")
    if ok < len(results):
        print("  Re-run to retry failed clips (state is preserved).")


if __name__ == "__main__":
    main()
