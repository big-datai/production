---
name: Manual user-override for ghost-prone clips (the matcher can't see quality)
description: When a clip has 4+ chars OR is a re-submission OR matched at score < 100, the prompt-similarity matcher cannot see ghost extras / blood splatter / wrong take. Proactively surface a "manual download" CTA so the user picks the visually-correct take from Kling UI and drops it in clips/ before assemble.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
**Rule (post-ep11 retrospective rule 8):** the `downloadOmniByPrompt.mjs` matcher picks tasks by prompt-text similarity, not visual quality. It can score "200" (perfect prefix match) and still pick a ghost-character render or blood-splatter render or wrong-take render.

**Whenever the matcher score is < 100 OR the clip has 4+ bound chars OR the clip was re-submitted (silent credit-cap fail risk), the produce-episode skill should proactively suggest manual user-download.**

## Trigger conditions for the manual-override CTA

- Clip has 4+ entries in `boundElements` (high ghost-character rate per memory rule 5d)
- Clip was re-submitted (Kling has multiple tasks with similar prompts; matcher might pick the OLD one)
- Match score reported by `downloadOmniByPrompt` is below 100
- Any clip flagged ⚠ by `validateClipCasting` for `holding-object + dance` or `looking-back + driver` traps

## CTA pattern (drop into chat after Phase 1 download)

```
🛡 Visual-quality flag — these clips need a manual eyeball:
  - clip 14 (4-char family selfie, score 87): may have ghost-Eva
  - clip 15 (re-submitted ×2, score 39): the matcher may have picked the old rage-Papa take

Want me to:
A) Proceed to assemble (trust the matched takes)
B) Wait for you to manually download good takes from Kling UI →
   ~/Downloads/<task-id>.mp4 → drop in season_01/episode_<NN>/clips/<n>.mp4

If B, ping me with "ready" once the files are dropped.
```

The pipeline accepts the override TRANSPARENTLY — `downloadOmniByPrompt.mjs` already won't overwrite an existing mp4 in `clips/<n>.mp4` if one is there.

## Why this matters

**ep11 cost ledger** showed 270 cr in clip-14 re-submits and another 135 cr in clip-15 — most of which would have been saved if the user had been prompted to manually pick the visually-clean take instead of trusting score-200 matches. Total recoverable: 675 cr ($3.91) per overage episode.

## How to apply

In `produceEpisode.mjs` Phase 1 (download), after the prompt-matcher reports per-clip scores, scan the spec for:
- `boundElements.length >= 4` → flag
- score < 100 → flag
- (future) check Kling task feed for multiple tasks with similar prompts on this clip → flag re-submitted

Print the chat-CTA above. Wait for "proceed" OR "ready" before continuing to Phase 2.

For now (until the orchestrator implements the auto-flag), the saraandeva-episode-from-prompt SKILL.md should explicitly tell the agent at hand-off time: "If any clip is 4+ char OR a re-submission, ask the user to verify the auto-pick before assembly."

## Bonus: a frame-audit sample is faster than full re-render

Before re-submitting (which costs cr), sample one frame:

```bash
ffmpeg -ss 4 -i season_01/episode_<NN>/clips/<N>.mp4 -frames:v 1 -y /tmp/frame_<N>.jpg
open /tmp/frame_<N>.jpg
```

If frame looks wrong → manually pick the right Kling task → drop file. If frame is OK → proceed. Saves 90-135 cr per false re-render.
