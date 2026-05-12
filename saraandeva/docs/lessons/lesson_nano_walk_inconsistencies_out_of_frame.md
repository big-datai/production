---
name: Nano first/last-frame — walk problem elements OUT of frame, don't try to lock them
description: User 2026-05-11 — When a Nano start/end pair has continuity-risk elements (door color, time-of-day, background props), don't fight to keep them pixel-stable across both frames. Instead, design the action so the camera or characters MOVE PAST them. Validated on ep14 clip 28.
type: lesson
originSessionId: 2026-05-11-ep14-clip28-nano-test
---

# The problem (verified ep14 clip 28, 2026-05-11)

Pair A (over-shoulder arc) and Pair B (static pullback) were both tested for the
same 4-character "Mama returns home, SURPRISE!" beat. Pair B kept the doorway
visible in BOTH start and end frames, and the door color drifted (warm brown
start → white-painted end). It also flipped time-of-day, bag color, Papa body
proportions across renders.

Pair A only showed the door in the START frame. By beat 2, Mama had stepped
forward into the room, and by the reveal at beat 4, the door was completely out
of frame. Same Nano start image, same character locks, same lighting — and
ZERO drift complaints.

## The rule

**If a background element is at risk of inconsistency between start and end
frames, design action that MOVES IT OUT OF FRAME mid-clip.**

Don't:
- Try to anchor the door color via prompt ("brown wood doorframe with brass
  handle in both frames")
- Add "preserve door color" continuity locks
- Re-render the end frame trying to match start

Do:
- Have the character walk forward / camera pan / arc shot — so the
  inconsistent element is only present at one end of the clip
- Frame the END state so background props that drifted just aren't visible
- Use the inconsistent element as the OPENING anchor (a door you enter
  through) and let it leave naturally

## Why this works

Nano-Banana renders each candidate independently. There is no built-in
mechanism to enforce "the same wooden door appears in both images." Even
explicit anchors ("CREAM-TAN bag", "WARM AFTERNOON DAYLIGHT") only mostly
work. Continuity-locking the start and end frames is a tax you pay per
prompt iteration.

Walking the problem out of frame eliminates the tax entirely. Kling's
first/last interpolation only needs the END pose to be valid in its own
right — it doesn't care that the door used to be there.

## Applies broadly

This is a Nano-first composition principle, not just a clip-28 hack:

- **Time-of-day flip risk** → camera pan to walls/ceiling at end (no window visible)
- **Bag/prop color drift** → character sets the prop down behind couch by end
- **Wardrobe drift between two character shots** → second character revealed
  from BEHIND first, hiding torso
- **Background poster/painting drift** → end frame zooms to faces only

## Anti-rule

DON'T use this to dodge identity locks. Character face, body type, hair —
those MUST be stable across both frames. This rule only applies to
PROPS and BACKGROUND, not characters.

## Reference

- Winner: `content/episodes/ep14/_test_nano/audits/render3_camera_arc_WINNER_2026-05-11/source.mp4`
- Loser: `content/episodes/ep14/_test_nano/audits/render2_camera_pullback_2026-05-11/source.mp4` (door + bag + time drift)
- Pair A spec: `content/episodes/ep14/_test_nano/pair_A_over_shoulder/`
