#!/usr/bin/env python3
"""
Deterministic episode-production orchestrator. Runs all pipeline phases in
sequence. Each phase is a discrete subprocess call so Claude (or a human)
can supervise the output and decide whether to continue, retry, or abort.

Phases:
  0. lint        — lintEpisode.py (must pass before spending money)
  1. scenes      — generateScenes.py (any newBoundElements with PNGs missing)
  2. group       — generateGroupShot.py (4+ char clips that need stills)
  3. upload      — kling_ep15_pipeline.mjs upload  (PNGs → GCS bucket)
  4. elements    — kling_ep15_pipeline.mjs elements (create + register)
  5. submit      — kling_ep15_pipeline.mjs submit (POST /v1/videos/omni-video)
  6. download    — kling_ep15_pipeline.mjs download (poll + pull mp4s)
  7. normalize   — normalizeClipFilenames.mjs (clip_<N>.mp4 → <N>.mp4)
  8. audit       — auditClipsWithGemini.mjs (Gemini Flash QA)
  9. music       — loopVideoWithSong.mjs for each musicVideoBlock
  10. assemble    — assembleEpisode.mjs
  11. thumbnail   — generateThumbnail.mjs
  12. short       — generateShort.mjs
  13. validate    — validateEpisode.mjs
  14. eyeball     — STOP — open ep<NN>_v<auto>.mp4 for human review
  15. upload-yt   — uploadEpisodeToSaraAndEva.mjs (UNLISTED)

Usage:
  python3 runEpisodePipeline.py --episode 15
  python3 runEpisodePipeline.py --episode 15 --start-from 5 --stop-after 6
  python3 runEpisodePipeline.py --episode 15 --skip-eyeball  # CI / no human

State persists in `content/episodes/ep<NN>/_pipeline_state.json` (managed by
the kling_ep15_pipeline.mjs phase scripts). Re-running picks up where it left off.

Exit codes:
  0  full pipeline completed
  1  phase failed
  2  user abort at eyeball gate
  3  lint blocked (fix prompts then retry)
"""
import argparse, json, os, subprocess, sys
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
SCRIPTS = PROJECT_ROOT / ".claude" / "skills" / "saraandeva-episode" / "scripts"


class Phase:
    def __init__(self, name: str, cmd: list, optional: bool = False, gate: bool = False):
        self.name = name
        self.cmd = cmd
        self.optional = optional   # log + continue on failure
        self.gate = gate           # stop pipeline + ask human

    def run(self, env=None) -> int:
        print(f"\n{'═' * 70}")
        print(f"▶  PHASE: {self.name}")
        print(f"   {' '.join(self.cmd[:3])} ...")
        print(f"{'═' * 70}")
        return subprocess.call(self.cmd, env=env or os.environ.copy())


def build_phase_list(ep: int, skip_eyeball: bool):
    e = f"{ep:02d}"
    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{e}"
    deliver = PROJECT_ROOT / "season_01" / f"episode_{e}"
    clips = deliver / "clips"
    pipeline = SCRIPTS / "kling_ep15_pipeline.mjs"   # generic enough for ep15+
    phases = [
        Phase("0. lint",      ["python3", str(SCRIPTS / "lintEpisode.py"), "--episode", str(ep)]),
        Phase("1. scenes",    ["python3", str(PROJECT_ROOT / "content" / "generateScenes.py")], optional=True),
        Phase("3. upload",    ["node", str(pipeline), "upload"]),
        Phase("4. elements",  ["node", str(pipeline), "elements"]),
        Phase("5. submit",    ["node", str(pipeline), "submit"]),
        Phase("6. download",  ["node", str(pipeline), "download"]),
        Phase("7. normalize", ["node", str(SCRIPTS / "normalizeClipFilenames.mjs"), str(ep_dir / "clips")], optional=True),
        Phase("8. audit",     ["node", str(SCRIPTS / "auditClipsWithGemini.mjs"),
                               str(ep_dir / "clips"), "--out", str(ep_dir / "audit_v1.json")]),
        # Music / assemble / thumb / short / validate / upload remain manual until they're tested in this orchestrator
        # — surface them as TODO phases the human approves before running.
    ]
    if not skip_eyeball:
        phases.append(Phase("14. eyeball-gate", ["echo", "STOP — review the audit JSON + clips folder, then run remaining phases manually"], gate=True))
    return phases


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--start-from", type=int, default=0, help="phase index to start from")
    ap.add_argument("--stop-after", type=int, default=99, help="phase index to stop after")
    ap.add_argument("--skip-eyeball", action="store_true", help="don't pause at eyeball gate")
    ap.add_argument("--continue-on-fail", action="store_true", help="don't abort on phase failure (use carefully)")
    args = ap.parse_args()

    phases = build_phase_list(args.episode, args.skip_eyeball)
    print(f"Pipeline for ep{args.episode:02d} — {len(phases)} phase(s)")
    for i, p in enumerate(phases):
        marker = " (optional)" if p.optional else " (gate)" if p.gate else ""
        print(f"  [{i}] {p.name}{marker}")

    for i, phase in enumerate(phases):
        if i < args.start_from: continue
        if i > args.stop_after: break

        rc = phase.run()
        if phase.gate:
            print(f"\n🚦 Gate: {phase.name} — review and re-run with --start-from {i + 1}")
            sys.exit(2)
        if rc != 0:
            if phase.optional:
                print(f"⚠ phase {phase.name} returned {rc} (optional, continuing)")
                continue
            if args.continue_on_fail:
                print(f"⚠ phase {phase.name} returned {rc} (continuing per --continue-on-fail)")
                continue
            print(f"✗ phase {phase.name} failed with exit code {rc}. Stopping.")
            print(f"   To resume after fix: --start-from {i}")
            if phase.name.startswith("0. lint"):
                sys.exit(3)
            sys.exit(1)

    print(f"\n✅ Pipeline completed (phases {args.start_from}..{min(args.stop_after, len(phases) - 1)})")


if __name__ == "__main__":
    main()
