---
name: Costumed elements + native dialogue audio (ep15 ground-truth)
description: Discovered 2026-05-07 debugging ep15 clip 1. Two stacked failures meant Kling rendered everyday-clothes humans + silent video despite the user expecting Halloween costumes + dialogue. Fix requires BOTH (a) the element's `frontal_image` to be the costumed PNG, NOT the generic; AND (b) the prompt's "Cast identity locks" to describe the costume in words. Plus `sound: "on"` for native dialogue audio (+33% cost). Plus the 2500-char prompt limit applies — costume descriptions can blow it.
type: lesson
severity: hard-rule
appliedTo: every clip with non-default character appearance + every clip with prompt dialogue lines
---

# The two layers that BOTH have to encode the costume

When a character appears in a costume (Halloween, dance recital, sports uniform, etc.):

1. **Element layer** — the Kling element bound to that character must have the **costumed** PNG as its `frontal_image`. The frontal dominates Kling's identity lock; reference images are weak hints. If frontal is generic, render is generic.
2. **Prompt layer** — the "Cast identity locks" section of the clip prompt must describe the costume in words (`<<<element_3>>> is Mama in a COZY-CHAPERONE Halloween outfit — burnt-orange knit beanie, cable-knit sweater, mustard pants, kid-flashlight in hand`). If the prompt only says "adult woman with blonde hair", Kling renders that and ignores the element's costume cues.

Both layers must agree. ep15 clip 1 v1+v2 had element WITH costume PNG in `reference_image_urls` but NOT as `frontal_image`, AND the prompt described everyday looks → renders had no costumes despite "Halloween" in element names.

**Fix sequence:**
- Recreate the element with `--frontal <costume PNG>` (not generic). Element creation is free (0 units), so just spawn a new element_id and overwrite the registry entry.
- Rewrite the clip's "Cast identity locks" so each `<<<element_N>>>` line describes the costume.

# Native dialogue audio

Kling Omni renders **silent by default**. To get TTS for in-prompt dialogue lines:

```js
payload.sound = "on";
```

Cost surcharge: ~33% over base. Std-mode 10s clip: 6 units (silent) → 8 units (with audio). The audio comes back as an AAC stereo 44.1kHz track in the mp4.

When to use:
- Any clip with `nativeAudio: true` in the spec
- Any clip whose prompt has quoted dialogue lines (`Mama: "Are my pumpkins ready?"`)

When to skip:
- Music-block clips (audio gets replaced by `loopVideoWithSong.mjs` later)
- Pure motion / B-roll clips with no spoken lines

The pipeline (`kling_ep15_pipeline.mjs`) auto-sets `sound: "on"` when `clip.nativeAudio === true`. Manual submissions via `submitOmniViaApi.mjs` use `--sound on`.

# 2500-char prompt limit

Kling rejects prompts with `code: 1201, message: "prompt: size must be between 0 and 2500"`. Costume identity locks bloat fast — keep them dense:

```
- @Sara: 7yo, FAIRY-PRINCESS COSTUME — silver tiara, pink-white ombre tutu w/ crystal bodice, glittery wings, fairy wand + jack-o-lantern bucket. Wavy dark-blonde hair, fair skin, brown eyes.
```

Not:

```
- @Sara is a 7-year-old girl in a FAIRY PRINCESS HALLOWEEN COSTUME — silver-jewel tiara, soft-pink + white-rainbow ombre tutu dress with sparkly crystal-detail bodice, glittery fairy wings on her back, holding a clear sparkly fairy wand with star tip in one hand and an orange jack-o-lantern treat bucket in the other...
```

`submitOmniViaApi.mjs` now hard-fails before submit if the prompt is over 2500 chars.

# ep15 element_ids (after the costume rebuild on 2026-05-07)

| Name | element_id | Frontal source |
|---|---|---|
| ep15_Sara | 310124227725311 | Sara_Halloween_Princess.png |
| ep15_Eva | 310124235857507 | Eva_Halloween_Pumpkin.png |
| ep15_Mama | 310124218481317 | Mama_Halloween_Cozy.png |
| ep15_Joe (dog/Pomeranian) | 310094145048304 | (still generic — works for now since prompt mentions ladybug costume) |
| ep15_Ginger (dog/Jack Russell) | 310094151148317 | (still generic — works since prompt mentions pumpkin cape) |

# Total debugging cost on ep15 clip 1

4 attempts: 6 + 8 + 8 (failed with prompt > 2500) + 8 = **30 units / $3.00** before costumes finally rendered. Reading this lesson before drafting future clip specs avoids that.
