---
name: Skill-to-Python migration plan + Python-only rule for new code
description: User feedback 2026-05-07: "I want all new code is Python — don't write anything but Python." Going forward NO new .mjs / JavaScript scripts; everything is `.py` under `saraandeva/.claude/skills/saraandeva-episode/scripts/` or `saraandeva/content/`. Existing .mjs scripts stay (don't rewrite). Plus a section-by-section analysis of which parts of the SKILL.md prose can be replaced with Python scripts, ranked by leverage.
type: strategy
severity: hard-rule
appliedTo: every new script written for this project from 2026-05-07 forward
---

# Hard rule

**All new scripts in Python.** No new `.mjs` files unless absolutely required (e.g. Playwright orchestration where Python is awkward). Default = `.py`.

Why: the user's preference. Stack consistency — Python is already used for asset generation (`generateScenes.py` etc). Mixing JS + Python forces context switches and split tooling.

Existing `.mjs` scripts (the API-side toolkit + audit + pipeline) stay as-is. Only NEW work is Python.

# Skill prose → Python migration map (saraandeva-episode-from-prompt/SKILL.md, 560 lines)

| SKILL section | Lines | Replace with | Effort |
|---|---|---|---|
| Step 1: Read context files | 11 | `loadEpisodeContext.py` (loads canon, registry, last-ep) | 30min |
| Step 2: Identify cast/scenes/bound elements | 10 | `extractCastFromParagraph.py` (Anthropic API call, returns JSON) | 1h |
| Step 2.5: Scenario quality bar | 24 | `lintScenarioBeats.py` — checks hook/cliffhanger/parent-activity beats | 30min |
| Step 2.55: Fourth-wall beats (2-4 per ep) | 29 | part of `lintEpisode.py` | 15min |
| Step 2.6: Music-video loop block planning | 48 | `planMusicVideoBlocks.py` — places A/B/C/D blocks at clip N.5 positions | 45min |
| Step 3: Draft arc (8-11 beats, 1-3 clips/beat) | 20 | `draftArcStructure.py` (Anthropic API) | 45min |
| Step 4: Write `episode.json` | 51 | `writeEpisodeJson.py` (template + slots from prior steps) | 30min |
| Step 4.5: Extend Nano Banana catalogs | 13 | `extendSceneCatalog.py` (writes new entries to `generateScenes.py` catalog) | 30min |
| Step 5: Write each clip JSON | 26 | `writeClipJson.py` per clip (template with cast locks + binding pattern) | 1h |
| **Step 5 hard rules (40+ rules!)** | **67** | **`lintEpisode.py`** — the big one, every rule from `docs/lessons/*.md` baked in | **2-3h** |
| Step 6: Sanity-check | 29 | part of `lintEpisode.py` | 15min |
| Step 6.5: Group-shot pre-render | 4 | already exists: `generateGroupShot.py` ✅ | done |
| Step 7: Write episode/ metadata | 18 | `writeEpisodeMetadata.py` (description.txt + tags.txt + title.txt) | 30min |
| Step 7a: Google Ads compliance | 31 | part of `lintEpisode.py` (title/desc/tags rules) | 30min |
| Step 7.5: Thumbnail + short | 14 | already exists: `generateThumbnail.mjs` + `generateShort.mjs` (legacy .mjs OK) | done |
| Step 7.7: Pre-upload validation | 14 | already exists: `validateEpisode.mjs` (legacy .mjs OK) | done |
| Step 8: Hand-off report | 70 | `generateHandoffReport.py` | 1h |

**Total ~10-15 hours of work** to fully port. ~600 lines of prose → ~15 small Python scripts.

# Top-3 highest-ROI to build first

1. **`lintEpisode.py`** — single linter that loads `docs/lessons/*.md`-derived rules and validates every clip JSON. Catches all known failure modes pre-submit. Saves $5-15/episode.
2. **`draftEpisodeSpec.py`** — paragraph in, full episode.json + clip JSONs out. Calls Anthropic Claude API with all the rules. Replaces ~400 lines of SKILL prose. Saves 30 min/episode.
3. **`autoFixDefects.py`** — reads Gemini audit JSON, classifies defects, applies prompt-tightening heuristics, auto-resubmits. Closes the manual loop.

# What stays in SKILL prose (correctly)

- `produce-episode/SKILL.md`'s Phase ABCD orchestration narrative — branching by user input, hard to express as code
- The "user handoff" descriptions ("now wait for user to drop Suno mp3s")
- Memory cross-references (link to `docs/lessons/<file>.md` for justification)

Anything inside a phase that's "the agent should…" → script.

# How to use these scripts (envisioned flow)

```bash
# Phase A: paragraph → spec
python3 .claude/skills/saraandeva-episode/scripts/draftEpisodeSpec.py 16 \
  --paragraph "Sara and Eva visit the petting farm with Mama and Papa..." \
  --formula vlad-niki-vehicle-day

# Phase A.lint: catch any rule violation
python3 .claude/skills/saraandeva-episode/scripts/lintEpisode.py --episode 16
# exits non-zero on any violation

# Phase B-D: existing .mjs pipeline
node .claude/skills/saraandeva-episode/scripts/kling_ep15_pipeline.mjs all

# Phase E.audit: existing
node .claude/skills/saraandeva-episode/scripts/auditClipsWithGemini.mjs ...

# Phase E.autofix: NEW
python3 .claude/skills/saraandeva-episode/scripts/autoFixDefects.py \
  --audit content/episodes/ep16/audit_v1.json
```

The orchestrator skill (`produce-episode/SKILL.md`) becomes ~50 lines: paragraph in, chain the scripts, surface user handoffs, done.
