---
name: Strategy — single deterministic Python pipeline (one command, prompt → final mp4)
description: User feedback 2026-05-07: "i want whole proces from prompt to final video be python code deterministic - your job is to make sure it doesnt fail if fails fix and improve". The pipeline architecture: every phase is idempotent + verified + retried + logged. `runEpisodePipeline.py` is the one entry point. Existing .mjs scripts are kept (no rewrite — see strategy_skill_to_python_migration.md) and called as subprocesses; the Python orchestrator owns retry/verify/log/diagnose. What this strategy CANNOT make deterministic: Kling/Suno/Gemini outputs themselves (LLM/diffusion non-determinism). For those: cache aggressively + auto-classify+resubmit on defect (autoFixDefects.py).
type: strategy
severity: hard-rule
appliedTo: every episode production from ep16 forward; the single-command orchestrator is the contract
---

# The contract

**One command, prompt → final mp4.** No phase-by-phase babysitting. Every phase:

1. **Idempotent** — re-running picks up at next unfinished phase
2. **Verified** — output is checked (file exists, size > 0, expected JSON keys present) before moving on
3. **Retried** — transient failures retry 3× with exponential backoff (5s/15s/45s)
4. **Logged** — every attempt recorded as JSON entry in `<ep>/_pipeline_log.json`
5. **Diagnosed** — failure mode classified + remedy printed, no opaque exits

# What this CANNOT make deterministic

The script enforces determinism for OUR code. The model APIs are not deterministic:

- **Kling render** — same prompt → different output each call
- **Gemini audit** — LLM text varies per call
- **Suno song gen** — diffusion-style variance

For these we use a different lever: **cache aggressively + auto-classify + resubmit**. After audit, `autoFixDefects.py` reads the Gemini findings, classifies each defect (8 categories), applies prompt-tightening heuristics, and emits fixed clip JSONs to `<ep>/_fix_v<N>/`. The submit phase can be re-run pointing at the fix dir.

# Phase list (16 phases)

```
 0   lint        — lintEpisode.py (deterministic rule check, hard-fail)
 0.5 budget      — trackEpisodeBudget.py (warn-only by default; --enforce-budget for hard)
 1   scenes      — generateScenes.py (newBoundElements PNGs)
 2   groupshot   — generateGroupShot.py (4+ char clips)
 3   upload      — kling_ep15_pipeline.mjs upload (PNGs → GCS)
 4   elements    — kling_ep15_pipeline.mjs elements (create + register)
 5   submit      — kling_ep15_pipeline.mjs submit (POST omni-video)
 6   download    — kling_ep15_pipeline.mjs download (poll + pull)
 7   normalize   — normalizeClipFilenames.mjs (clip_<N>.mp4 → <N>.mp4)
 8   audit       — auditClipsWithGemini.mjs (Gemini Flash QA)
 8.5 autofix     — autoFixDefects.py (classify + emit fixed specs)
 8.6 resubmit    — re-submit fixed clips, re-download, re-audit (1 cycle, TODO)
 9   music       — loopVideoWithSong.mjs (TODO)
 10  assemble    — assembleEpisode.mjs (TODO)
 11  thumbnail   — generateThumbnail.mjs (TODO)
 12  short       — generateShort.mjs (TODO)
 13  validate    — validateEpisode.mjs (TODO)
 14  eyeball     — STOP — open mp4 in QuickTime, scrub
 15  upload-yt   — uploadEpisodeToSaraAndEva.mjs UNLISTED (TODO)
```

Phases 9-15 are wired but not yet auto-tested in this orchestrator — left as manual `node` calls until each is validated end-to-end.

# Usage

```bash
# Full run
python3 .claude/skills/saraandeva-episode/scripts/runEpisodePipeline.py --episode 16 --autorun

# Resume after a failure
python3 ... --episode 16 --start-from 5  # picks up from submit

# What broke last time?
python3 ... --episode 16 --diagnose

# Dry-run (list phases, no execution)
python3 ... --episode 16 --dry-run

# Treat budget over-threshold as hard failure
python3 ... --episode 16 --enforce-budget
```

# Exit code semantics

| code | meaning | recovery |
|---|---|---|
| 0 | full pipeline OK | — |
| 1 | phase failed after retries | run `--diagnose`; fix; re-run with `--start-from <idx>` |
| 2 | user gate hit (eyeball) | review mp4, then `--start-from <next>` |
| 3 | lint blocked | fix clip JSONs flagged by lintEpisode |
| 4 | budget over threshold | trim clips OR drop `--enforce-budget` |
| 5 | audit found critical defects auto-fix can't resolve | manual edit + re-submit |

# Determinism debugging recipe

When the user says "small prompt change broke everything":

1. `python3 runEpisodePipeline.py --episode <N> --diagnose` — what was last failure?
2. `cat <ep>/_pipeline_log.json | jq '.[] | select(.verified == false or .exit_code != 0)'` — every failed attempt
3. Look at audit_v<N>.json defects to see what Kling produced
4. Run `autoFixDefects.py --audit ... --emit-fixed-specs` to see what tightening would help
5. Compare prompt diff in `_fix_v<N>/<N>.json` vs `<N>.json` — *that's* what changes the render
6. If a single word triggered defect, add to `lintEpisode.py` `BANNED_INTENSITY_WORDS` list

# Anti-patterns

- ❌ "let me just re-run the failed clip manually" → makes pipeline non-idempotent. Always go through orchestrator.
- ❌ "I'll edit the clip JSON in place" → loses the fix-version trail. Edit in `_fix_v<N>/`.
- ❌ "skip the eyeball gate" without `--skip-eyeball` flag → bypasses the only QA gate.
- ❌ Adding new behavior to a phase without verification predicate → silent partial completion.

# When to add a new phase

Adding phase X requires:

1. A subprocess command (Python or .mjs)
2. A `verify_X(ep_dir, args) -> bool` that confirms the output exists
3. An entry in `DIAGNOSIS_TABLE` mapping the phase name to (cause, fix)
4. A test run on a finished episode to verify the verify predicate

# Linked memory

- `strategy_skill_to_python_migration.md` — Python-only rule for new code
- `strategy_prefer_code_over_skill_prose.md` — code is contract; prose is suggestion
- `lesson_kling_omni_api_schema.md` — element_list/<<<element_N>>> schema
- `lesson_kling_continuity_locks.md` — anti-morph negatives the linter enforces
- `lesson_no_red_splatter_kids_show.md` — banned word the linter enforces
- `lesson_kling_papa_active_prompt_template.md` — body-part-CAPS verb pattern lint should encourage
