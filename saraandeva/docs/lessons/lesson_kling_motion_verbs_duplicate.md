---
name: Motion-toward verbs spawn duplicate characters in Kling
description: Verbs describing a character moving INTO a scene with another anchored character cause Kling to render both the start and end states — producing a duplicate of either the moving character or the anchor.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
When a Kling Omni prompt has a character moving toward / into / up to a scene where another character is already established (especially a strongly-described one — e.g. sitting on a couch reading a book), Kling tends to render BOTH states of the motion. That spawns a duplicate.

Concrete cases (ep08, 2026-05-02):
- Clip 1: "@Eva walks in from the right side... and stops dead. Sara sits cross-legged reading aloud..." → got 2 Evas (one entering, one already on the couch next to Sara)
- Clip 4: "@Sara walks calmly toward the car... @Mama stands in the FOREGROUND beside the open door..." → got 2 Mamas (origin and destination)

**Forbidden phrases now lint-blocked in submitOmniClip.mjs:**
- `walks in`, `walking in`
- `walks toward / up to / over to / into`
- `approaches`, `approaching`
- `moves to / toward`
- `heads in / to / toward / over`

**Why:** Pre-existing memory rule #21 (~11% duplicate rate, aggressive negatives + resubmit) addresses the SYMPTOM. This addresses the MECHANISM — never let the prompt describe motion converging on an anchor character. Static placement at the start of action only.

**How to apply:** When writing a clip prompt with 2+ anchored characters:
- Place every character STATIC at the start (sitting, standing, holding)
- Then describe the action that happens AFTER everyone is in position (reads, sees, freezes, gasps, gestures)
- The "entry" or "approach" beat goes in the PRIOR clip — split the moment into two clips if you need an entrance.

The planning skill `saraandeva-episode-from-prompt` should bake this rule in too.
