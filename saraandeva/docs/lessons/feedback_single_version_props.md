---
name: One PNG per scene/prop — never generate variants by default
description: When generating scene/prop assets via generateScenes.py / generateProps.py, default to a single version per asset. Don't pass --variants 3. User wants the file named <id>.png from the start, no manual variant-pick step.
type: feedback
originSessionId: c368ab61-ad14-44b1-b688-335065572594
---
**Rule:** generate ONE version per scene/prop. Use the script defaults (no `--variants` flag) so output goes directly to `<id>.png`. Never produce `_v1.png` / `_v2.png` / `_v3.png` files unless the user explicitly asks for variant-comparison.

**Why:** user explicitly told me to "update skill script to create only one version of images scenes" (2026-05-04, mid ep11 production). Reason: the manual variant-pick step is wasted work — picking blind is no better than just using whichever the model returns first, and the extra v2/v3 files clutter `assets/scenes/`. The single-shot behavior was already the script default (`--variants 1` writes directly to `<id>.png`); the prior skills had crept in `--variants 3` as habit from ep07 era when text-rendering text-props benefited from manual selection.

**How to apply:**
- `python3 saraandeva/content/generateScenes.py --scene <id>` ← already always writes one PNG (`<id>.png`).
- `python3 saraandeva/content/generateProps.py --prop <id>` ← default `--variants 1` writes one PNG (`<id>.png`). DON'T pass `--variants 3` even for text-bearing props.
- If a generated PNG is unusable, re-run the same command with `--force` to regenerate, rather than producing 3 candidates and picking.
- Edge case: if a text-prop comes out garbled THREE times in a row, then it's worth a one-off `--variants 3` to pick the cleanest. Until then, single-shot.

**Updated artifacts (2026-05-04):**
- `saraandeva/content/generateProps.py` — docstring no longer suggests `--variants 3` as a default example.
- `.claude/skills/saraandeva-episode-from-prompt/SKILL.md` — Step-8 hand-off block dropped `--variants 3` and the auto-pick `cp v1 → canonical` step. Just `python3 generateProps.py --prop $p` now.
- `.claude/skills/produce-episode/SKILL.md` — Phase B already used the single-version form; left as-is.
