---
name: Don't confirm Nano Banana renders — cheap, just create them
description: User 2026-05-11 — Nano Banana stills cost ~$0.01-0.02 each and take 20s. Don't ask before rendering them; just do it. Render Nano FIRST when designing or testing a clip. Only ask before Kling renders ($0.30+/clip) or production-affecting decisions.
type: feedback
originSessionId: 2026-05-11-strategic-session
---
**Hard rule (user 2026-05-11):**

When you need a Nano Banana still — to test a composition, design a first/last
frame, validate character placement, or pre-render for image-to-video — **just
create it.** Don't ask, don't propose, don't price-check. Cost is trivial
(~$0.01-0.02 per candidate) and turnaround is ~20 seconds.

User's exact words: "create nano first don't ask me about nano cheap"

## What this means in practice

- Testing a new clip composition? Auto-render 2 Nano candidates with the
  designed pose. Show the user the result for review (not for cost approval).
- Designing first/last frame test? Render BOTH frames + 2 candidates each
  without asking permission first. Show all 4 candidates for visual review.
- User says "test ep N clip M" → render the Nano stills as part of the
  default workflow, not as an explicit step they have to approve.

## What still requires asking

- **Kling renders** (~$0.30-0.60 per clip, 10s std-mode) — pricier + actually
  costs credits, plus the result affects the shipping episode
- **Multi-clip Kling batches** — e.g. "render the whole episode" — ask first
  because batch cost is non-trivial ($24+ per ep)
- **Production-affecting changes** — title rewrites on heroes, episode
  reordering, ad-spend reallocation, MfK toggles — anything that changes
  what users see
- **Major API actions** — bulk video updates, deletion, channel-level changes

## Application to the Nano-first workflow

Per `lesson_kling_papa_active_prompt_template.md` and the test workflow at
`scripts/_test_nano_first_workflow.py`:

1. Read clip spec
2. Auto-render Nano start + end stills (2 candidates each)
3. Auto-write comparison.md doc
4. **Present visual results to user — do NOT ask "should I render Nano?"**
5. User approves visuals → then ask for Kling submit (that's the expensive step)

Default behavior in any script that orchestrates Nano: `--auto-nano` is the
intended default, not behind a flag.
