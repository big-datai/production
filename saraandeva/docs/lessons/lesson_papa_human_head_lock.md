---
name: Costume drift fix — explicit "100% HUMAN HEAD" lock when costume name suggests transformation
description: ep15 clip 17 (THE FIND) retro-fix that worked v5 2026-05-07. The avatar PNG for ep15_Papa was a bald guy with grey wolf ears headband + holding a wolf mask in his hand (friendly werewolf costume, NOT transformation). Element was correctly bound. But Kling kept rendering Papa as a full grey wolf because the word "werewolf" in the prompt is enough to tip the diffusion model toward animal-body even when the avatar is fully human-anchored. Solution: "Cast LOCKS" paragraph at top of prompt that explicitly says "@Papa: 100% HUMAN HEAD ... NEVER on face. NOT a wolf. NOT transformed." plus negativePrompt entries for full-wolf variants. Worked first try in v5. Reusable pattern for any "person with animal-themed costume" failure mode.
type: lesson
severity: load-bearing
appliedTo: any episode where a human character wears a costume that names an animal (werewolf, dragon, T-rex, etc) — Kling drifts to full-animal-body unless explicit human-head lock present
---

# What broke in ep15 clip 17 v3/v4

`ep15_Papa` element (id 310086206650303) frontal_image: clean Pixar render of bald man with grey wolf-ears headband on top of his bald head, glasses, dark beard, gray cardigan, holding a separate wolf-shaped MASK in his right hand below his shoulder. Element image is unambiguous — Papa is a HUMAN dressed up.

But the prompt body had:
```
@Papa: friendly werewolf costume — wolf ears, dark beard, gray cardigan,
holds wolf mask
```

Kling rendered Papa as a **full grey wolf body + full wolf head, walking on hind legs**. Several iterations (v3, v4) had the same drift. Visible in clip 17 v4 frames 1+3 — towering wolf figure where Papa should be standing, completely missing the avatar's "guy with ears" anchor.

# Why the avatar wasn't enough

The element_list system is "who can appear in this frame" — Kling uses the avatar image as visual reference but is NOT bound to render it character-for-character. The diffusion model reads the prompt text and pulls toward whatever the words suggest. The word "werewolf" alone activates the model's wolf-transformation pattern even when the avatar shows a human.

# What worked (v5)

Cast LOCKS block at TOP of prompt body, paragraph 0:

```
Cast LOCKS:
- @Papa: 100% HUMAN HEAD, bald + dark beard + glasses, gray cardigan, blue henley.
  WOLF EARS HEADBAND only (plush ears on bald head). Holds WOLF MASK in right hand
  below shoulder, NEVER on face. Head stays human EVERY shot.
```

Plus negativePrompt entries:
```
papa as full wolf, papa with wolf snout, papa with wolf fur on body,
papa transformed into beast, real wolf body papa, wolf mask covering papa face,
papa head as wolf
```

Result: v5 rendered Papa correctly across all 4 shots — bald HUMAN HEAD with wolf-ears headband visible, holding wolf mask in hand below shoulder, gray cardigan. Pixar grade.

# Reusable template

For any character X wearing animal-themed costume Y (werewolf, dragon, T-rex, lion, etc):

```
- @X: 100% HUMAN HEAD <hair/skin/face details>. <Costume hat/mask/headband
  description as ACCESSORY only> on top of head. Holds <costume mask if
  any> in <hand>, NEVER on face. NOT a real <Y>. NOT transformed.
  Head stays human EVERY shot.
```

negativePrompt:
```
@X as full <Y>, @X with <Y>-snout, @X with <Y> fur on body,
@X transformed into <Y>, real <Y> body @X, mask covering @X face, @X head as <Y>
```

# Anti-pattern

❌ Relying on the avatar image alone to lock costume details. Kling reads prompt text first, image second.
❌ Saying "@X: friendly werewolf costume" — the word "werewolf" alone trips the transformation pattern.
❌ Putting the costume description in shot bodies only. Cast LOCKS block at TOP of prompt is required.

# Linked memory

- `lesson_costume_element_coverage_gap.md` — making sure ep<NN>_<Char> exists in registry
- `lesson_kling_costumed_elements_and_dialogue.md` — costume in BOTH frontal image + prompt
- `lesson_kling_continuity_locks.md` — anti-morph negatives baseline
- `lesson_kling_papa_active_prompt_template.md` — body-part CAPS verbs

# Cost

ep15 clip 17 retro: v3+v4+v5 = 3 × 8 cr = ~$2.40. v5 perfect on first try with lock pattern. Avoidable if pattern was used from clip 17 v1 — would have saved $1.60.
