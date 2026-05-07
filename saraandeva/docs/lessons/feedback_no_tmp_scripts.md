---
name: Never use /tmp — all scripts + prompts persist in saraandeva/
description: User flagged 2026-05-07 that /tmp scripts evaporate between sessions and the project keeps re-deriving them. Hard rule: every script, prompt file, helper, one-off, test, or anything reusable goes to saraandeva/.claude/skills/saraandeva-episode/scripts/ (code) OR saraandeva/content/episodes/ep<NN>/ (per-episode prompts/specs) OR saraandeva/docs/lessons/ (knowledge). /tmp is for ephemeral binary outputs only (rendered mp4s, audit JSON dumps, frame extracts) — never for code.
type: feedback
severity: hard-rule
appliedTo: every script Claude writes for this project
---

# The rule

**Never write executable code to /tmp.** It evaporates between sessions and the project keeps re-deriving the same scripts.

Where to put things:

| Type | Location |
|---|---|
| Reusable script | `saraandeva/.claude/skills/saraandeva-episode/scripts/*.mjs` |
| Per-episode prompt / spec / lyric | `saraandeva/content/episodes/ep<NN>/` or `saraandeva/assets/music/lyrics/` |
| Lesson / runbook / rule | `saraandeva/docs/lessons/*.md` (mirrors agent memory) |
| Element registry, manifest | `saraandeva/content/*.json` |
| One-off "I just need to test this" | **STILL** goes to `scripts/` — name it `_test_<thing>.mjs` (underscore prefix marks it experimental, but it survives) |
| Rendered binary outputs (mp4, audit json) | `saraandeva/tmp/` (project-local scratch, git-ignored, survives sessions) |
| Frame extracts during audit | `saraandeva/tmp/` |
| ANY use of OS `/tmp/` | ❌ banned — `/tmp/` evaporates between sessions |

# What this means for the next "quick test"

Wrong:
```
Write /tmp/test_something.mjs ...
```

Right:
```
Write saraandeva/.claude/skills/saraandeva-episode/scripts/_test_something.mjs ...
```

Even a 10-line probe goes into `scripts/`. If it's truly throwaway, prefix with `_` and add a comment line at the top: `// EXPERIMENTAL — delete after <date>`. But it persists.

# Cleanup sweep (one-time)

The 2026-05-06 + 2026-05-07 sessions left these orphans in `/tmp/` (any of these worth porting? spot-check before deleting):

- `/tmp/kling_create_element.py`, `/tmp/kling_create_joe.py` → superseded by `createElementViaApi.mjs`
- `/tmp/kling_list_elements.py`, `/tmp/kling_list_videos.py` → superseded by `listKlingViaApi.mjs`
- `/tmp/kling_omni_jo_beach.py`, `/tmp/kling_omni_3char_beach.py`, `/tmp/kling_omni_clip5_wolf.py`, `/tmp/kling_omni_ep12_clip*.py` → superseded by `submitOmniViaApi.mjs`
- `/tmp/kling_probe_omni.py` → archival, can delete
- `/tmp/resubmit_ep15_clip1.mjs` → superseded by `submitOmniViaApi.mjs --sound on`
- `/tmp/test_multi_shot_ginger_beach.mjs` → port to `scripts/_test_multi_shot_omni.mjs` (multi-shot pattern reference)
- `/tmp/yt_set_private.py` → port to `scripts/_yt_set_private.mjs` (occasionally useful)

Most can be safely deleted; port the ~2 that captured working patterns.
