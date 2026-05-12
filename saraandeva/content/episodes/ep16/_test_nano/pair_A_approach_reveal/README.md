# ep16 clip 15 — Pair A "Approach + Reveal" (Nano first/last-frame)

The stash-discovery beat: 3 humans + 1 dog + 4 stash items. Canonical
pipeline risks ghost characters at 4 subjects. Nano first/last-frame
locks identity in both frames + applies the "design problem out" rule.

## The composition strategy

**START** (front of couch — items HIDDEN):
The 3 family members face the couch from the front side, looking
UP/over with anticipation. The couch BACK physically blocks any view
of the floor behind it — so the stash items don't need to be locked
in this frame. They simply aren't visible.

**END** (back of couch — items REVEALED):
Camera has arced 180° around the couch. The 3 family members lean
OVER the back of the couch, looking DOWN at the stash on the floor.
Items visible: white tooth + metal keys + small earring + old pancake.
Joe the Pomeranian sits guilty beside the stash.

## Why this design wins

Per `lesson_nano_walk_inconsistencies_out_of_frame.md`:
- Stash items only need to be locked in ONE frame, not two
- No need to anchor "tooth color matches between start/end" — start
  doesn't contain a tooth at all
- Same trick as ep14 clip 28 winner: the camera move retires the
  consistency-risk elements out of frame

## Identity locks (consistent across both frames)

- @Eva: blonde curly, pink sweater with rainbow chest, light leggings
- @Sara: light brown wavy hair, denim overalls + pink tee with star
- @Mama: blonde messy bun, pink tank, gray leggings, athletic build
- @Joe (END only): small orange-cream fluffy Pomeranian

## Files

- `start.png` — START frame (front of couch, anticipation, items hidden)
- `end.png` — END frame (back of couch, reveal, stash + Joe visible)
- `action.txt` — Kling animation prompt for first/last interpolation
- `candidates/` — all 4 Nano variants rendered

## Kling submission

1. New video → image-to-video first/last-frame mode (Kling 2.5 or 3.0)
2. First frame: `start.png`
3. Last frame: `end.png`
4. Prompt: paste `action.txt`
5. Duration: 10 sec (per clip spec) — note Kling first/last is usually 5s, may need 2 cuts
6. Audio: ON (allows native dialogue + ambient SFX)
7. Quality: 720p
