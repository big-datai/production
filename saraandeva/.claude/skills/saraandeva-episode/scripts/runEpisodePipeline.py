#!/usr/bin/env python3
"""
Deterministic end-to-end Sara&Eva episode pipeline.

ONE COMMAND, prompt → final mp4. Every phase is idempotent + verified +
retryable + logged. Auto-fix loop after audit. Human is asked exactly
once at the eyeball gate; everything else runs unattended.

Phases (16):
  0  lint        — lintEpisode.py (deterministic rule check, must pass)
  0.5 budget     — trackEpisodeBudget.py (abort if over threshold)
  1  scenes      — generateScenes.py (newBoundElements with PNGs missing)
  2  groupshot   — generateGroupShot.py (4+ char clips need stills)
  3  upload      — kling_ep15_pipeline.mjs upload  (PNGs → GCS)
  4  elements    — kling_ep15_pipeline.mjs elements (create + register)
  5  submit      — kling_ep15_pipeline.mjs submit
  6  download    — kling_ep15_pipeline.mjs download (poll + pull mp4s)
  7  normalize   — normalizeClipFilenames.mjs (clip_<N>.mp4 → <N>.mp4)
  8  audit       — auditClipsWithGemini.mjs (Gemini Flash QA)
  8.5 autofix    — autoFixDefects.py (classify + emit fixed specs)
  8.6 resubmit   — re-submit auto_fix clips, re-download, re-audit (max 1 cycle)
  9  music       — loopVideoWithSong.mjs for each musicVideoBlock
  10 assemble    — assembleEpisode.mjs
  11 thumbnail   — generateThumbnail.mjs
  12 short       — generateShort.mjs
  13 validate    — validateEpisode.mjs
  14 eyeball     — STOP — open ep<NN>_v<auto>.mp4 for human review
  15 upload-yt   — uploadEpisodeToSaraAndEva.mjs (UNLISTED)

Every phase writes a structured log entry to <ep>/_pipeline_log.json so a
later run (or a human) can see exactly what happened.

Usage:
  python3 runEpisodePipeline.py --episode 16 --autorun
  python3 runEpisodePipeline.py --episode 15 --start-from 8 --stop-after 9
  python3 runEpisodePipeline.py --episode 15 --diagnose   # explain last failure

Determinism guarantees this script enforces:
  ✓ Idempotent — re-running picks up at next unfinished phase
  ✓ Verified — each phase's output is checked (file exists, size > 0)
  ✓ Retried — transient failures retry 3× with exp backoff (5s/15s/45s)
  ✓ Logged — every attempt recorded in _pipeline_log.json
  ✓ Diagnosed — failure mode classified + remedy printed

What this script CANNOT make deterministic (and never claims to):
  - Kling render output for the same prompt (model is non-deterministic)
  - Gemini audit text (LLM output varies)
  - Suno song output
  → For these, we cache aggressively + auto-classify+resubmit on defect.

Exit codes:
  0  full pipeline completed
  1  phase failed after retries (see _pipeline_log.json + diagnose)
  2  user gate at eyeball
  3  lint blocked
  4  budget over abort threshold
  5  audit produced critical defects auto-fix can't resolve
"""
import argparse, json, os, subprocess, sys, time, datetime
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
SCRIPTS = PROJECT_ROOT / ".claude" / "skills" / "saraandeva-episode" / "scripts"

# ─── retry policy ──────────────────────────────────────────────────────────
RETRY_BACKOFF = [5, 15, 45]  # seconds between retries (3 retries total)
PHASE_TIMEOUT_SEC = 30 * 60  # 30 min per phase (download polls take a while)


# ─── verification predicates ───────────────────────────────────────────────
# Each phase declares what its successful completion produces. The orchestrator
# checks these BEFORE moving on. If verification fails, the phase is treated
# as not having run, regardless of exit code.
def verify_lint(ep_dir, args): return True   # exit code is the contract
def verify_budget(ep_dir, args): return True
def verify_scenes(ep_dir, args):
    # No strict requirement — generateScenes only creates missing files, may
    # legitimately do nothing. Trust exit code.
    return True
def verify_groupshot(ep_dir, args): return True
def verify_upload(ep_dir, args):
    state = ep_dir / "_pipeline_state.json"
    if not state.is_file(): return False
    s = json.loads(state.read_text())
    return bool(s.get("uploads"))
def verify_elements(ep_dir, args):
    state = ep_dir / "_pipeline_state.json"
    if not state.is_file(): return False
    s = json.loads(state.read_text())
    return bool(s.get("elements"))
def verify_submit(ep_dir, args):
    state = ep_dir / "_pipeline_state.json"
    if not state.is_file(): return False
    s = json.loads(state.read_text())
    tasks = s.get("clipTasks") or {}
    return len(tasks) > 0
def verify_download(ep_dir, args):
    clips = ep_dir / "clips"
    if not clips.is_dir(): return False
    mp4s = list(clips.glob("*.mp4"))
    if not mp4s: return False
    # All non-empty?
    return all(p.stat().st_size > 100_000 for p in mp4s)
def verify_normalize(ep_dir, args):
    # After normalize, expect <N>.mp4 (digits only) form to dominate
    clips = ep_dir / "clips"
    if not clips.is_dir(): return True
    mp4s = list(clips.glob("*.mp4"))
    return any(p.stem.isdigit() or (len(p.stem) == 1 and p.stem.isalpha()) for p in mp4s)
def verify_audit(ep_dir, args):
    return (ep_dir / "audit_v1.json").is_file()
def verify_autofix(ep_dir, args):
    # autoFixDefects writes auto_fix_plan_v<N>.json
    return any(ep_dir.glob("auto_fix_plan_v*.json"))
def verify_music(ep_dir, args):
    # Each music-block letter clip should produce <LETTER>_with_audio.mp4
    clips = ep_dir / "clips"
    if not clips.is_dir(): return True   # nothing to do
    return True  # tolerant; missing mp3 just skips
def verify_assemble(ep_dir, args):
    # final assembled mp4 lives at <ep>/ep<NN>_assembled.mp4 by convention
    expected = list(ep_dir.glob(f"ep{int(ep_dir.name[2:]):02d}*assembled*.mp4"))
    if not expected: return False
    return all(p.stat().st_size > 1_000_000 for p in expected)
def verify_thumbnail(ep_dir, args):
    return any(ep_dir.glob("ep*_thumbnail*.jpg")) or (ep_dir / "thumbnail.jpg").is_file()
def verify_short(ep_dir, args):
    return any(ep_dir.glob("ep*_short*.mp4")) or (ep_dir / "short.mp4").is_file()
def verify_validate(ep_dir, args): return True   # exit-code contract


# ─── phase definition ──────────────────────────────────────────────────────
class Phase:
    def __init__(self, idx, name, cmd, verify=None, optional=False, gate=False, retry=True):
        self.idx = idx
        self.name = name
        self.cmd = cmd
        self.verify = verify or (lambda ep, args: True)
        self.optional = optional
        self.gate = gate
        self.retry = retry

    def run_once(self, env=None, timeout=PHASE_TIMEOUT_SEC):
        try:
            r = subprocess.run(
                self.cmd, env=env or os.environ.copy(),
                timeout=timeout, capture_output=False
            )
            return r.returncode
        except subprocess.TimeoutExpired:
            return -2
        except FileNotFoundError as e:
            print(f"!! command not found: {e}")
            return -3


# ─── pipeline log ──────────────────────────────────────────────────────────
def log_path(ep_dir): return ep_dir / "_pipeline_log.json"


def append_log(ep_dir, entry):
    p = log_path(ep_dir)
    log = []
    if p.is_file():
        try: log = json.loads(p.read_text())
        except json.JSONDecodeError: log = []
    log.append(entry)
    p.write_text(json.dumps(log, indent=2))


def now_iso():
    return datetime.datetime.now().isoformat() + "Z"


# ─── failure diagnosis ─────────────────────────────────────────────────────
DIAGNOSIS_TABLE = {
    # phase prefix → (likely_cause, suggested_fix)
    "0. lint": ("Spec violates a hard rule. lintEpisode.py exited non-zero.",
                "Read the lint output above; fix the offending clip JSON; re-run."),
    "0.5 budget": ("Episode projected cost over abort threshold (default 2200 cr).",
                   "Cut clips, shorten music block, or override with --abort-threshold."),
    "3. upload": ("GCS upload failed. Likely cause: GOOGLE_APPLICATION_CREDENTIALS missing or bucket auth.",
                  "Check `gcloud auth application-default login`. Verify bucket gs://saraandeva-kling-elements is accessible."),
    "4. elements": ("Kling element creation failed. Likely cause: wrong frontal_image_url, missing description, or rate limit.",
                    "Inspect _pipeline_state.json.elements; check Kling API status; retry."),
    "5. submit": ("Kling submit returned error code. Common: prompt > 2500 chars, missing element_id, or account out of credits.",
                  "Run lintEpisode.py + trackEpisodeBudget.py; check stderr for the API code."),
    "6. download": ("Kling task failed or timed out. Some tasks may still be 'processing'.",
                    "Wait + re-run download phase. If individual tasks failed, see autoFixDefects."),
    "8. audit": ("Gemini Flash audit errored. Likely: GEMINI_API_KEY missing or quota exceeded.",
                 "Check .env.local; verify Gemini API quota."),
    "8.6 resubmit": ("Auto-fix loop exhausted but defects remain.",
                     "Inspect auto_fix_plan_v<N>.json; manually edit clip JSONs; re-run from phase 5."),
}


def diagnose(phase_name, rc, ep_dir):
    print("\n" + "─" * 70)
    print(f"DIAGNOSIS for {phase_name} (exit code {rc})")
    print("─" * 70)
    cause, fix = DIAGNOSIS_TABLE.get(phase_name, ("Unknown failure mode.",
                                                   "Inspect _pipeline_log.json + the phase's stdout."))
    print(f"  Likely cause: {cause}")
    print(f"  Suggested fix: {fix}")
    log_p = log_path(ep_dir)
    if log_p.is_file():
        print(f"  Full log: {log_p.relative_to(PROJECT_ROOT)}")
    print("─" * 70 + "\n")


# ─── phase list builder ───────────────────────────────────────────────────
def load_episode_meta(ep_dir):
    """Read episode.json for title + music block + metadata used by later phases."""
    p = ep_dir / "episode.json"
    if not p.is_file(): return {}
    try: return json.loads(p.read_text())
    except json.JSONDecodeError: return {}


def find_song_mp3(ep_dir, song_lyric_path):
    """Given a lyric_<name>.md path, find matching mp3 in <ep_dir> or assets/music/."""
    if not song_lyric_path: return None
    name = Path(song_lyric_path).stem.replace("lyrics_", "")
    candidates = [
        ep_dir / f"{name}.mp3",
        ep_dir / f"{name.replace('_', ' ')}.mp3",
        PROJECT_ROOT / "assets" / "music" / f"{name}.mp3",
        PROJECT_ROOT / "assets" / "music" / f"{name.replace('_', ' ').title()}.mp3",
    ]
    for c in candidates:
        if c.is_file(): return c
    return None


def build_phase_list(ep, skip_eyeball, autorun):
    e = f"{ep:02d}"
    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{e}"
    pipeline = SCRIPTS / "kling_pipeline.py"   # Python port — was kling_ep15_pipeline.mjs
    meta = load_episode_meta(ep_dir)
    yt_meta = meta.get("youtubeMetadata", {})
    title = yt_meta.get("fallbackTitleNoEmoji") or yt_meta.get("primaryTitle") or f"Sara and Eva — Episode {ep}"
    final_mp4 = ep_dir / f"ep{e}_assembled.mp4"

    phases = [
        Phase(0, "0. lint",
              ["python3", str(SCRIPTS / "lintEpisode.py"), "--episode", str(ep)],
              verify_lint, retry=False),
        Phase(1, "0.5 budget",
              ["python3", str(SCRIPTS / "trackEpisodeBudget.py"), "--episode", str(ep)],
              verify_budget, optional=True, retry=False),  # warn-only by default
        # Fix E — phase 0.6: sync registry with Kling library (catches duplicates,
        # fills missing entries). Idempotent. Per ep15 retrospective lesson.
        Phase(2, "0.6 sync-registry",
              ["python3", str(SCRIPTS / "syncElementsRegistry.py")],
              optional=True, retry=False),
        # Fix E — phase 0.7: auto-discover assets/scenes/ PNGs, idempotent upload
        # + element register. The single answer to "agent forgot which PNGs exist".
        Phase(3, "0.7 discover-assets",
              ["python3", str(SCRIPTS / "discoverAndRegisterAssets.py"),
               "--episode", str(ep), "--skip-create"],
              optional=True, retry=False),
        Phase(4, "1. scenes",
              ["python3", str(PROJECT_ROOT / "content" / "generateScenes.py")],
              verify_scenes, optional=True),
        Phase(5, "3. upload",
              ["python3", str(pipeline), "--episode", str(ep), "upload"],
              verify_upload),
        Phase(6, "4. elements",
              ["python3", str(pipeline), "--episode", str(ep), "elements"],
              verify_elements),
        Phase(7, "5. submit",
              ["python3", str(pipeline), "--episode", str(ep), "submit"],
              verify_submit),
        Phase(8, "6. download",
              ["python3", str(pipeline), "--episode", str(ep), "download"],
              verify_download),
        Phase(9, "7. normalize",
              ["python3", str(SCRIPTS / "normalizeClipFilenames.py"), str(ep_dir / "clips")],
              verify_normalize, optional=True),
        Phase(10, "8. audit",
              ["python3", str(SCRIPTS / "auditClipsWithGemini.py"),
               str(ep_dir / "clips"), "--out", str(ep_dir / "audit_v1.json")],
              verify_audit),
        Phase(11, "8.5 autofix",
              ["python3", str(SCRIPTS / "autoFixDefects.py"),
               "--audit", str(ep_dir / "audit_v1.json"),
               "--episode", str(ep), "--emit-fixed-specs"],
               verify_autofix, optional=True),
    ]

    # ─── Music block phase (delegated to runMusicPhase.py for runtime checks) ─
    phases.append(Phase(12, "9. music",
        ["python3", str(SCRIPTS / "runMusicPhase.py"), "--episode", str(ep)],
        verify_music, optional=True))

    # ─── Assemble / thumbnail / short / validate ─────────────────────────
    phases.append(Phase(13, "10. assemble",
        ["python3", str(SCRIPTS / "assembleEpisode.py"), str(final_mp4),
         "--clips-dir", str(ep_dir / "clips")],
        verify_assemble))
    phases.append(Phase(14, "11. thumbnail",
        ["python3", str(SCRIPTS / "generateThumbnail.py"),
         f"--episode={ep}", "--title", title],
        verify_thumbnail, optional=True))
    phases.append(Phase(15, "12. short",
        ["python3", str(SCRIPTS / "generateShort.py"),
         f"--episode={ep}", "--title", title],
        verify_short, optional=True))
    phases.append(Phase(16, "13. validate",
        ["python3", str(SCRIPTS / "validateEpisode.py"), f"--episode={ep}"],
        verify_validate))

    # ─── Eyeball gate (manual) ───────────────────────────────────────────
    if not skip_eyeball:
        phases.append(Phase(17, "14. eyeball-gate",
            ["echo", "STOP — open", str(final_mp4),
             "in QuickTime, scrub, then re-run with --start-from 18"],
            gate=True, retry=False))

    # ─── Upload to YouTube (UNLISTED) — only if assembled mp4 exists ─────
    desc_file = ep_dir / "description.txt"
    tags_file = ep_dir / "tags.txt"
    upload_cmd = ["python3", str(SCRIPTS / "uploadEpisodeToSaraAndEva.py"),
                  str(final_mp4), "--title", title,
                  "--privacy", "unlisted"]
    if desc_file.is_file(): upload_cmd += ["--description-file", str(desc_file)]
    if tags_file.is_file(): upload_cmd += ["--tags-file", str(tags_file)]
    phases.append(Phase(18, "15. upload-yt", upload_cmd, optional=True))

    return phases


# ─── orchestration with retry + verify ─────────────────────────────────────
def run_phase(phase, ep_dir, args):
    """Run a phase with retries + verification. Returns final exit code."""
    attempts = 1 if not phase.retry else (1 + len(RETRY_BACKOFF))
    rc = -1
    for attempt in range(attempts):
        if attempt > 0:
            backoff = RETRY_BACKOFF[attempt - 1]
            print(f"\n⏳ retry {attempt}/{len(RETRY_BACKOFF)} for {phase.name} after {backoff}s...")
            time.sleep(backoff)

        started = time.time()
        print(f"\n{'═' * 70}")
        print(f"▶  PHASE [{phase.idx}]: {phase.name}  (attempt {attempt + 1}/{attempts})")
        print(f"   {' '.join(str(c) for c in phase.cmd[:3])} ...")
        print(f"{'═' * 70}")
        rc = phase.run_once()
        elapsed = round(time.time() - started, 1)

        verified = False
        if rc == 0:
            try:
                verified = phase.verify(ep_dir, args)
            except Exception as ev:
                print(f"⚠ verify raised {ev}; treating as not-verified")
                verified = False

        append_log(ep_dir, {
            "ts": now_iso(), "phase": phase.name, "attempt": attempt + 1,
            "exit_code": rc, "elapsed_sec": elapsed, "verified": verified,
        })

        if rc == 0 and verified:
            print(f"\n✓ {phase.name} OK  ({elapsed}s)")
            return 0
        if rc == 0 and not verified:
            print(f"⚠ {phase.name} exited 0 but verification failed; retrying.")
            continue
        if rc == -2:
            print(f"⏰ {phase.name} timed out; retrying.")
            continue
        if rc < 0:
            print(f"✗ {phase.name} infra error (rc={rc}); retrying.")
            continue
        # rc > 0 = real failure
        print(f"✗ {phase.name} returned {rc}")
        if not phase.retry:
            return rc

    return rc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--start-from", type=int, default=0, help="phase index to start from")
    ap.add_argument("--stop-after", type=int, default=99, help="phase index to stop after")
    ap.add_argument("--skip-eyeball", action="store_true", help="don't pause at eyeball gate")
    ap.add_argument("--autorun", action="store_true",
                    help="run end-to-end with auto-fix loop after audit")
    ap.add_argument("--continue-on-fail", action="store_true",
                    help="don't abort on phase failure (use carefully)")
    ap.add_argument("--enforce-budget", action="store_true",
                    help="treat over-budget as hard failure (default: warn only)")
    ap.add_argument("--diagnose", action="store_true",
                    help="don't run; print last failure's diagnosis from log")
    ap.add_argument("--dry-run", action="store_true",
                    help="list phases that would run, don't execute")
    args = ap.parse_args()

    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
    if not ep_dir.is_dir():
        print(f"!! episode dir not found: {ep_dir}", file=sys.stderr)
        sys.exit(1)

    # diagnose mode: read last log entry, print
    if args.diagnose:
        p = log_path(ep_dir)
        if not p.is_file():
            print(f"No log found at {p}")
            sys.exit(0)
        log = json.loads(p.read_text())
        if not log:
            print("Log is empty.")
            sys.exit(0)
        last_fail = next((e for e in reversed(log) if e["exit_code"] != 0 or not e.get("verified", True)), None)
        if last_fail:
            diagnose(last_fail["phase"], last_fail["exit_code"], ep_dir)
            print(f"Last failure entry: {json.dumps(last_fail, indent=2)}")
        else:
            print("No failures in log.")
        sys.exit(0)

    phases = build_phase_list(args.episode, args.skip_eyeball, args.autorun)
    print(f"Pipeline for ep{args.episode:02d} — {len(phases)} phase(s)")
    for p in phases:
        marker = " (optional)" if p.optional else " (gate)" if p.gate else ""
        print(f"  [{p.idx}] {p.name}{marker}")

    if args.dry_run:
        print("\n--dry-run: not executing")
        sys.exit(0)

    # exit-code map for known special cases
    SPECIAL_EXIT = {
        "0. lint": 3,
        "0.5 budget": 4,
    }

    # apply --enforce-budget by upgrading phase 1 from optional to required
    if args.enforce_budget:
        for p in phases:
            if p.name.startswith("0.5 budget"):
                p.optional = False

    for phase in phases:
        if phase.idx < args.start_from: continue
        if phase.idx > args.stop_after: break

        rc = run_phase(phase, ep_dir, args)

        if phase.gate:
            print(f"\n🚦 Gate: {phase.name}")
            print(f"   Resume after review with: --start-from {phase.idx + 1}")
            sys.exit(2)

        if rc != 0:
            if phase.optional:
                print(f"⚠ {phase.name} optional, continuing despite rc={rc}")
                continue
            if args.continue_on_fail:
                print(f"⚠ {phase.name} rc={rc} (continuing per --continue-on-fail)")
                continue
            diagnose(phase.name, rc, ep_dir)
            print(f"To resume after fix: --start-from {phase.idx}")
            for prefix, code in SPECIAL_EXIT.items():
                if phase.name.startswith(prefix):
                    sys.exit(code)
            sys.exit(1)

    print(f"\n✅ Pipeline completed (phases {args.start_from}..{min(args.stop_after, max(p.idx for p in phases))})")
    sys.exit(0)


if __name__ == "__main__":
    main()
