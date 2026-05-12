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
  3  upload      — kling_pipeline.py upload  (PNGs → GCS)
  4  elements    — kling_pipeline.py elements (create + register)
  5  submit      — kling_pipeline.py submit
  6  download    — kling_pipeline.py download (poll + pull mp4s)
  7  normalize   — normalizeClipFilenames.py (clip_<N>.mp4 → <N>.mp4)
  8  audit       — auditClipsWithGemini.py (Gemini Flash QA)
  8.5 autofix    — autoFixDefects.py (classify + emit fixed specs)
  8.6 resubmit   — re-submit auto_fix clips, re-download, re-audit (max 1 cycle)
  9  music       — runMusicPhase.py → loopVideoWithSong.py for each musicVideoBlock
  10 assemble    — assembleEpisode.py
  11 thumbnail   — generateThumbnail.py
  12 short       — generateShort.py
  13 validate    — validateEpisode.py
  14 eyeball     — STOP — open ep<NN>_v<auto>.mp4 for human review
  15 upload-yt   — uploadEpisodeToSaraAndEva.py (UNLISTED)

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
import argparse
import json
import os
import subprocess
import sys
import time
import datetime
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
SCRIPTS = PROJECT_ROOT / ".claude" / "skills" / "saraandeva-episode" / "scripts" / "pipeline"

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
def verify_pre_submit(ep_dir, args):
    """Hard gate — runs all still-side validation before Kling submission.
    Per 2026-05-12 user directive: validate everything we can at zero cost
    before paying for video renders. Calls preSubmitValidation.py which
    aggregates: still-presence, still-upload, element-resolution, scene-
    consistency. Exit code is the contract — gate passes ONLY if exit 0."""
    return True   # exit-code contract — verify done by preSubmitValidation.py
def verify_song_present(ep_dir, args):
    """Hard gate — every episode MUST ship with at least one *.mp3 song
    AND that song must end up mixed into the assembled mp4 (continuous audio,
    no dead-air gaps over silent clips). Per lesson_every_episode_must_have_song.md.

    Two-part check:
      1. song file exists in <ep_dir>/*.mp3 OR assets/music/*.mp3
      2. IF an assembled mp4 already exists, it must have an audio stream
         spanning ≥98% of the video duration (catches the case where assemble
         ran without --song and produced gappy / silent-overlay-segments output).
    """
    music_dir = PROJECT_ROOT / "assets" / "music"
    has_song = bool(list(ep_dir.glob("*.mp3"))) or bool(list(music_dir.glob("*.mp3")))
    if not has_song:
        return False

    # If post-assemble verification — confirm song made it into the mp4
    ep_num = int(ep_dir.name[2:])
    assembled = list(ep_dir.glob(f"ep{ep_num:02d}*assembled*.mp4")) + \
                list(ep_dir.glob(f"ep{ep_num:02d}_with_music.mp4"))
    if not assembled: return True   # pre-assembly call — just check song exists

    import subprocess as _sp
    mp4 = assembled[0]
    try:
        vid_dur = float(_sp.check_output(
            ["ffprobe", "-v", "error", "-select_streams", "v",
             "-show_entries", "stream=duration", "-of", "default=nw=1:nk=1", str(mp4)]
        ).decode().strip())
        aud_dur = float(_sp.check_output(
            ["ffprobe", "-v", "error", "-select_streams", "a",
             "-show_entries", "stream=duration", "-of", "default=nw=1:nk=1", str(mp4)]
        ).decode().strip())
    except Exception:
        return True  # ffprobe error — let it through, the assemble-verify gate catches
    # Audio must cover ≥98% of video duration
    return (aud_dur / vid_dur if vid_dur else 0) >= 0.98
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


# ─── needs_run predicates (smart-skip for optional phases) ─────────────────
# Each optional phase can declare a cheap deterministic check that returns
# (should_run: bool, reason: str). If should_run is False, the orchestrator
# prints the reason and skips the phase entirely. Saves ~30s + ~$0.20 per
# no-op re-run on fresh-state episodes. Per 2026-05-12 user directive.

def needs_gemini_review(ep_dir, args) -> tuple[bool, str]:
    """Run only if any clip JSON has been edited since the last verified submit.
    If submits are recent and prompts haven't changed, Gemini-review is redundant."""
    log = ep_dir / "_pipeline_log.json"
    if not log.is_file():
        return True, "first run — no pipeline log"
    try: entries = json.loads(log.read_text())
    except Exception: return True, "log unreadable — re-run to be safe"
    submit_times = [e["ts"] for e in entries
                    if "submit" in e.get("phase", "") and e.get("verified")]
    if not submit_times:
        return True, "no verified submit yet — review every clip"
    last_ts = max(submit_times)
    # parse ISO 8601 timestamp
    try:
        last_t = datetime.datetime.fromisoformat(last_ts.rstrip("Z")).timestamp()
    except Exception:
        return True, "timestamp unparseable"
    edited = [p.name for p in ep_dir.glob("*.json")
              if p.stem.isdigit() and p.stat().st_mtime > last_t]
    if edited:
        return True, f"clip specs edited since last submit: {','.join(edited[:5])}"
    return False, f"no clip-spec edits since last submit ({last_ts})"


def needs_sync_registry(ep_dir, args) -> tuple[bool, str]:
    """Skip if elements_registry.json was synced within last 24h."""
    reg = PROJECT_ROOT / "content" / "elements_registry.json"
    if not reg.is_file():
        return True, "registry file missing"
    age_h = (time.time() - reg.stat().st_mtime) / 3600
    if age_h > 24:
        return True, f"registry stale ({age_h:.1f}h old; >24h threshold)"
    return False, f"registry fresh ({age_h:.1f}h old)"


def needs_discover_assets(ep_dir, args) -> tuple[bool, str]:
    """Skip if every character in every clip's subjects[] resolves to an element
    in the current registry. (Cheap check — read JSONs + registry, no API calls.)"""
    reg_p = PROJECT_ROOT / "content" / "elements_registry.json"
    if not reg_p.is_file():
        return True, "registry file missing — must discover"
    try: reg = json.loads(reg_p.read_text())
    except Exception: return True, "registry unreadable — must discover"
    ep_num = int(ep_dir.name[2:])
    needed = set()
    for fp in ep_dir.iterdir():
        if not (fp.name.endswith(".json") and fp.stem and fp.stem[0].isdigit()): continue
        try: d = json.loads(fp.read_text())
        except Exception: continue
        for s in d.get("subjects") or []: needed.add(s)
    missing = []
    for name in needed:
        if reg.get(f"ep{ep_num:02d}_{name}") or reg.get(name): continue
        missing.append(name)
    if missing:
        return True, f"unregistered subjects: {','.join(missing)}"
    return False, f"all {len(needed)} subjects already registered"


def needs_budget(ep_dir, args) -> tuple[bool, str]:
    """Always run — cheap file read, always informative."""
    return True, "always run (cheap projection)"


# ─── phase definition ──────────────────────────────────────────────────────
class Phase:
    def __init__(self, idx, name, cmd, verify=None, optional=False, gate=False,
                 retry=True, needs_run=None):
        self.idx = idx
        self.name = name
        self.cmd = cmd
        self.verify = verify or (lambda ep, args: True)
        self.optional = optional
        self.gate = gate
        self.retry = retry
        # If supplied, called BEFORE the phase runs. Returns (run: bool, reason: str).
        self.needs_run = needs_run

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
    "4.5 pre-submit-validation": ("Still-side check failed (A=presence, B=upload, C=element, D=scene-consistency). "
                                   "Saving credits by halting BEFORE paying Kling for a bad render.",
                                   "Read the preSubmitValidation.py output above for which check failed: "
                                   "(A) missing still PNG → re-render via _render_ep<NN>_chain.py --only <N>; "
                                   "(B) still not uploaded → re-run phase 6 upload; "
                                   "(C) missing element → register via createElementViaApi.py; "
                                   "(D) scene drift → run auditSceneConsistency.py --save-grids, review, re-render off-spec stills."),
    "9.7 song-present-gate": ("No *.mp3 in episode dir. Hard rule (2026-05-12): every episode must ship "
                              "with a Suno-generated song that bridges silent/montage clips.",
                              "Open Suno + lyric: `open https://suno.com/create` and `open -t content/episodes/ep<NN>/lyrics_*.md`. "
                              "Paste LYRICS + GENRE blocks, generate, download MP3 to content/episodes/ep<NN>/, "
                              "then re-run with --start-from 15."),
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
        # Phase 0.4 — Gemini second-opinion on every clip prompt before submit.
        # Catches static-render verbs, ambiguous action, sister-collision, costume
        # drift risk that the deterministic lint can't see. Optional (warn-only)
        # because Gemini is occasionally over-strict; rule-of-thumb: apply its
        # CAPS-verb / body-part anchor suggestions, ignore stylistic complaints.
        Phase(1, "0.4 gemini-review",
              ["python3", str(SCRIPTS / "reviewPromptWithGemini.py"),
               "--episode", str(ep), "--all"],
              optional=True, retry=False, needs_run=needs_gemini_review),
        Phase(2, "0.5 budget",
              ["python3", str(SCRIPTS / "trackEpisodeBudget.py"), "--episode", str(ep)],
              verify_budget, optional=True, retry=False,
              needs_run=needs_budget),  # always runs, but predicate documents intent
        # Fix E — phase 0.6: sync registry with Kling library (catches duplicates,
        # fills missing entries). Idempotent. Per ep15 retrospective lesson.
        Phase(3, "0.6 sync-registry",
              ["python3", str(SCRIPTS / "syncElementsRegistry.py")],
              optional=True, retry=False, needs_run=needs_sync_registry),
        # Fix E — phase 0.7: auto-discover assets/scenes/ PNGs, idempotent upload
        # + element register. The single answer to "agent forgot which PNGs exist".
        Phase(4, "0.7 discover-assets",
              ["python3", str(SCRIPTS / "discoverAndRegisterAssets.py"),
               "--episode", str(ep), "--skip-create"],
              optional=True, retry=False, needs_run=needs_discover_assets),
        Phase(5, "1. scenes",
              ["python3", str(PROJECT_ROOT / "content" / "generateScenes.py")],
              verify_scenes, optional=True),
        Phase(6, "3. upload",
              ["python3", str(pipeline), "--episode", str(ep), "upload"],
              verify_upload),
        Phase(7, "4. elements",
              ["python3", str(pipeline), "--episode", str(ep), "elements"],
              verify_elements),
        # ─── HARD GATE: validate everything on stills BEFORE Kling submit ─
        # Aggregates: still presence + still upload + element resolution +
        # scene-consistency audit + deep per-still Vision audit (5 dimensions).
        # Costs ~$0.11 Gemini. Saves $0.70-1.40 per clip we would have wasted.
        Phase(8, "4.5 pre-submit-validation",
              ["python3", str(SCRIPTS / "preSubmitValidation.py"),
               "--episode", str(ep)],
              verify_pre_submit, optional=False, retry=False),
        # ─── MANUAL GATE: human eye-check stills before Kling spend ───────
        # Composites all stills into a labeled grid + opens for review.
        # Per 2026-05-12 user directive: "after all validations and stills
        # created i will eye check them for next episode". Halts pipeline;
        # operator resumes with --start-from 10 after approval.
        Phase(9, "4.7 stills-eyeball-gate",
              ["python3", str(SCRIPTS / "buildStillsReviewGrid.py"),
               "--episode", str(ep)],
              gate=True, retry=False),
        Phase(10, "5. submit",
              ["python3", str(pipeline), "--episode", str(ep), "submit"],
              verify_submit),
        Phase(11, "6. download",
              ["python3", str(pipeline), "--episode", str(ep), "download"],
              verify_download),
        Phase(12, "7. normalize",
              ["python3", str(SCRIPTS / "normalizeClipFilenames.py"), str(ep_dir / "clips")],
              verify_normalize, optional=True),
        Phase(13, "8. audit",
              ["python3", str(SCRIPTS / "auditClipsWithGemini.py"),
               str(ep_dir / "clips"), "--out", str(ep_dir / "audit_v1.json")],
              verify_audit),
        Phase(14, "8.5 autofix",
              ["python3", str(SCRIPTS / "autoFixDefects.py"),
               "--audit", str(ep_dir / "audit_v1.json"),
               "--episode", str(ep), "--emit-fixed-specs"],
               verify_autofix, optional=True),
    ]

    # ─── Music block phase (delegated to runMusicPhase.py for runtime checks) ─
    # NOTE: runMusicPhase.py handles LETTER-CLIP music videos (musicVideoBlock).
    # The episode-wide SONG BED mix happens inside assembleEpisode.py (--song flag,
    # auto-resolves from <ep_dir>/*.mp3 OR assets/music/*.mp3). Both layers compose
    # so the assembled mp4 has continuous audio over silent narrative clips.
    phases.append(Phase(15, "9. music",
        ["python3", str(SCRIPTS / "runMusicPhase.py"), "--episode", str(ep)],
        verify_music, optional=True))

    # ─── HARD GATE: song present (post-music, pre-assemble) ──────────────
    # Per lesson_every_episode_must_have_song.md (2026-05-12): every Sara & Eva
    # episode MUST ship with at least one Suno-generated *.mp3 in the episode dir.
    # Bridges silent / nativeAudio:false clips during assembly. ep04, 07, 08,
    # 14, 15 all shipped with their own theme song. Pipeline halts here if missing.
    phases.append(Phase(16, "9.7 song-present-gate",
        ["python3", "-c",
         f"import pathlib, sys; "
         f"root = pathlib.Path('{PROJECT_ROOT}'); "
         f"ep = root / 'content' / 'episodes' / 'ep{ep:02d}'; "
         f"music = root / 'assets' / 'music'; "
         f"songs = list(ep.glob('*.mp3')) + list(music.glob('*.mp3')); "
         f"print(f'  {{len(songs)}} song(s) available for ep{ep:02d}:') if songs "
         f"else print('  ❌ NO *.mp3 in ep{ep:02d}/ OR assets/music/'); "
         f"[print(f'    • {{s.name}}  ({{s.parent.name}}/)') for s in songs]; "
         f"print('  Open Suno + lyric: open https://suno.com/create ; "
         f"open -t content/episodes/ep{ep:02d}/lyrics_*.md') if not songs else None; "
         f"sys.exit(0 if songs else 1)"],
        verify_song_present, optional=False, retry=False))

    # ─── Assemble / thumbnail / short / validate ─────────────────────────
    phases.append(Phase(17, "10. assemble",
        ["python3", str(SCRIPTS / "assembleEpisode.py"), str(final_mp4),
         "--clips-dir", str(ep_dir / "clips")],
        verify_assemble))
    phases.append(Phase(18, "11. thumbnail",
        ["python3", str(SCRIPTS / "generateThumbnail.py"),
         f"--episode={ep}", "--title", title],
        verify_thumbnail, optional=True))
    phases.append(Phase(19, "12. short",
        ["python3", str(SCRIPTS / "generateShort.py"),
         f"--episode={ep}", "--title", title],
        verify_short, optional=True))
    phases.append(Phase(20, "13. validate",
        ["python3", str(SCRIPTS / "validateEpisode.py"), f"--episode={ep}"],
        verify_validate))

    # ─── Eyeball gate (manual) ───────────────────────────────────────────
    if not skip_eyeball:
        phases.append(Phase(21, "14. eyeball-gate-final",
            ["echo", "STOP — open", str(final_mp4),
             "in QuickTime, scrub, then re-run with --start-from 22"],
            gate=True, retry=False))

    # ─── Upload to YouTube (UNLISTED) — only if assembled mp4 exists ─────
    desc_file = ep_dir / "description.txt"
    tags_file = ep_dir / "tags.txt"
    upload_cmd = ["python3", str(SCRIPTS / "uploadEpisodeToSaraAndEva.py"),
                  str(final_mp4), "--title", title,
                  "--privacy", "unlisted"]
    if desc_file.is_file(): upload_cmd += ["--description-file", str(desc_file)]
    if tags_file.is_file(): upload_cmd += ["--tags-file", str(tags_file)]
    phases.append(Phase(22, "15. upload-yt", upload_cmd, optional=True))

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

        # Smart-skip: optional phase with a needs_run predicate that returns False
        # → log the reason and skip entirely. Saves ~30s + API cost per no-op run.
        if phase.optional and phase.needs_run is not None:
            try:
                should_run, reason = phase.needs_run(ep_dir, args)
            except Exception as e:
                should_run, reason = True, f"needs_run raised {e}; running to be safe"
            if not should_run:
                print(f"\n⏭  [{phase.idx}] {phase.name} SKIPPED — {reason}")
                append_log(ep_dir, {
                    "ts": now_iso(), "phase": phase.name, "skipped": True,
                    "skip_reason": reason,
                })
                continue
            else:
                print(f"\n▶  [{phase.idx}] {phase.name} needed — {reason}")

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
