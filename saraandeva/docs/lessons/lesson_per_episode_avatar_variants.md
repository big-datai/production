---
name: Per-episode avatar variants for story-event state changes
description: User 2026-05-11 — when a story event changes a character's permanent state within an episode (lost tooth, new haircut, costume, scrape), generate an episode-specific avatar variant and use IT as the Nano reference. Locking state in the avatar beats fighting it via prompt anchors.
type: lesson
originSessionId: 2026-05-11-ep16-tooth-fairy
---

# The pattern

When the story changes a character's appearance MID-EPISODE in a way that
should persist across all subsequent clips:

1. Generate an episode-specific avatar variant for that character with the
   new state baked in: `assets/characters/ep<NN>_<name>_front.png`
2. Update the Nano renderer to prefer the ep-variant avatar over the
   canonical one (with optional clip-range gating for the trigger point)
3. The state then propagates "for free" because every clip's reference
   image already shows the character in the new state — no need for
   prompt-level anchors to fight Nano's identity-lock instincts

# Why this is better than prompt anchors

Prompt anchors like "Eva has missing front tooth" work *sometimes* but
fight against the character avatar PNG, which Nano-Banana uses as the
strongest identity signal. Nano splits the difference: sometimes the
gap is rendered, sometimes Eva's canonical full teeth win. Inconsistent
across clips.

Locking the state in the avatar itself eliminates the fight. Nano sees
"Eva = gap-tooth" as the canonical identity for this episode, and
renders her that way every time. The prompt anchors become unnecessary
(though they don't hurt as belt-and-suspenders).

# Concrete examples

| Episode | Trigger event | Variant avatar |
|---|---|---|
| ep15 | Halloween costumes | `ep15_Sara` (Princess), `ep15_Eva` (Pumpkin), etc. — already in registry |
| ep16 | Eva loses front tooth at clip 2 | `ep16_eva_front.png` — gap-tooth permanent for clips 2-22 |
| (future) | Sara gets bandage on knee | `ep<NN>_sara_front.png` with bandage |
| (future) | New haircut | `ep<NN>_<name>_front.png` with new hair |

# Clip-range gating

For mid-episode state changes, the renderer can gate by clip number:
- Pre-trigger clips: use canonical `<name>_front.png`
- Trigger clip onward: use `ep<NN>_<name>_front.png`

For ep16's tooth fall (TOOTH_FELL_AT_CLIP = 2):
```python
if name_lower == "eva" and cid_int < TOOTH_FELL_AT_CLIP:
    use_ep_variant = False  # pre-fall Eva still has tooth
```

# Generation recipe

To create a variant avatar:
```bash
python3 content/generateGroupShot.py ep<NN>_<char>_variant \
  --chars <char> \
  --pose "@<Char> standing centered, clean cream background, gentle portrait
          lighting, facing forward. <STATE CHANGE DESCRIPTION emphasizing the
          new feature as the focal point>. Eva wears canonical <outfit>.
          This is the ep<NN> <Char> AVATAR REFERENCE for the rest of this
          episode — locked permanent state." \
  --n 2 --no-validate

# Pick best candidate, copy to canonical location:
cp assets/scenes/group_ep<NN>_<char>_variant_v1.png \
   assets/characters/ep<NN>_<char>_front.png
```

# Cost

- 1 variant render: ~$0.02
- Saves $0.30-1.00 per episode in failed re-renders chasing the state-change
  defect via prompt anchors

# Related lessons

- `lesson_kling_continuity_locks.md` — continuity locks at prompt level
- `lesson_nano_walk_inconsistencies_out_of_frame.md` — props/bg consistency by design
- `lesson_kling_costumed_elements_and_dialogue.md` — costume encoding in elements

# Lint rule (future R24)

Add to `lintEpisode.py`: detect story-event state changes in the spec
(missing-tooth, costume, etc.) and require a matching `ep<NN>_<char>_front.png`
to exist. Block submission if the variant is referenced in any prompt but
the file is missing.
