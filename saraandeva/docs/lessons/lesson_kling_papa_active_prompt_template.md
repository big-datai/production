---
name: Papa-active Kling Omni prompt template (the ep13 clip 5 pattern that worked)
description: User flagged ep13 clip 5 as "perfect" — Papa actually performs the Big Bad Wolf actions (knocks the door, puffs his cheeks, exhales a comic breath cloud) instead of standing passively. The template is Pattern E + 3-beat motion-only structure + body-part verbs in CAPS + Papa-passive negative-prompt bans + horror-wolf bans. Reproduce this exact structure for any clip where Papa (or any character) needs to actively perform a multi-beat physical action. The template defeats Kling's default tendency to render named-but-action-less characters as static anchors.
type: lesson
severity: hard-rule
appliedTo: every Papa-active or active-multi-beat clip going forward; baseline for prompt rewriting
originSessionId: b923ac34-5ab5-423b-b230-8d3dc1dc3937
---
# The "Papa-active" prompt template — ep13 clip 5 case study

User feedback 2026-05-07: "ep5 is very good… that way of prompting" → keep it.

## The 3 load-bearing levers (omit any one, Papa goes passive)

1. **Pre-render the composition in Nano Banana** (Pattern E from `lesson_kling_prompt_anatomy.md`). Anchor still → Kling never has to invent the layout, only the motion. Critical for 3+ characters because Kling's anchoring is unstable with high character counts.
2. **Every action beat names a specific body part with a verb in CAPS.** Not "Papa knocks" — "Papa's right **fist** comes UP and **KNOCKS** the door panel three times — knuckles make visible contact." Verbs in CAPS = the explicit motion contract Kling parses.
3. **Negative prompt explicitly bans the passive states**, not just bans the wrong actions. `papa standing still, papa frozen, papa motionless, papa observing without acting, papa stands and does nothing, papa idle, papa waiting passively, papa not moving`.

## Reproducible prompt structure (10s clip, 3 characters, image-anchored)

```
{N}-second loop-clean {ROLE} performance at {SETTING}.
Composition exactly matches the anchor image at second 0 and second {N}.

Beat 1 (0–{T1}s): <<<element_1>>> {CHAR_A}'s {BODY_PART_1} visibly {VERB_IN_CAPS} {direction/motion}, 
{follow-up body part} {SECOND_VERB_IN_CAPS}. {Concrete physical contact / impact}.
<<<element_2>>> {CHAR_B} {responsive verb}, {hand/face anchor}.
<<<element_3>>> {CHAR_C} {responsive verb}, {hand/face anchor}.

Beat 2 ({T1}–{T2}s): {CHAR_A}'s {BODY_PART_2} {ESCALATION_VERB_IN_CAPS} bigger, 
{leans/stretches} forward and {THIRD_VERB_IN_CAPS} {visible cartoon physics — breath cloud, motion arc}.
{Environmental reaction — door rattles / cheeks scrunch / leaves stir}.
{CHAR_B + CHAR_C continue their reaction beat}.

Beat 3 ({T2}–{N}s): {CHAR_A} {RESET_VERB_IN_CAPS}, ready for next round.
{Pose returns to anchor exactly at second {N} — loop-clean}.

Camera locked, head-on, kid-eye level. All characters STAY in their anchored positions.
Each character has exactly two arms and two hands at all times.
{Tone clamp — kid-show comedy, never scary; comic-cartoon physics, not realistic}.
```

## Negative-prompt blocks to ALWAYS include for active characters

- **Active-character passive bans**: `{char} standing still, {char} frozen, {char} motionless, {char} observing without acting, {char} stands and does nothing, {char} idle, {char} waiting passively, {char} not moving`
- **Tone-down bans for any "scary/intense" role** (wolf, monster, chase, etc.): `threatening, predatory, sharp teeth, fangs, real {animal} snout, snarl, growl, scary face, frightening expression, horror lighting, dark shadows, scary atmosphere`
- **Standard clone/anatomy bans**: `duplicate character, twin, clone, mirrored figure, ghost figure, three arms, third arm, extra arm, extra hand, anatomy error`

## Worked example — ep13 clip 5 wolf (the perfect run)

- **Nano Banana inputs**: papa_front + sara_front + eva_front + playground_tower_house.png
- **Nano Banana pose**: "Papa stands at the FRONT of the wooden tower-house door mid-huff, both cheeks puffed comically big like a balloon, both hands cupped at the sides of his mouth like a megaphone, leaning slightly forward toward the door, eyes wide with playful big-bad-arch eyebrows. The expression is SILLY-WOLF not scary-wolf. Sara peeks from the LEFT upper window. Eva peeks from the RIGHT upper window. Both girls giggling-grinning. Family-comedy tone, NOT scary."
- **Kling Omni motion prompt**: 3 beats × body-part verbs (chest EXPANDS, fist KNOCKS, cheeks SWELL, EXHALES with cartoon breath cloud, re-cups hands at mouth)
- **Element bindings**: `<<<element_1>>>` Papa, `<<<element_2>>>` Sara, `<<<element_3>>>` Eva
- **Model**: `kling-v3-omni` std mode, 10s, 16:9, 6 units = $0.60
- **Result**: 10.041s, 4.2MB, looped 6× to a 60s music block under `Little Pigs Let Me Come In.mp3`

User QC: "ep5 is very good… remember that way of prompting".

## When NOT to use this template

- Single-character static scenes (e.g. solo slow-mo wonder shots) — the body-part beat structure forces motion that may not fit a dreamy register. Use Pattern A (single canonical) for those.
- 2-character symmetric beats — use Pattern B (2 chars w/ distinct anchor) per `lesson_kling_prompt_anatomy.md`.
- Pattern E with 4+ chars that share a song/dance — group-still + motion-only LOOP works, but skip the per-beat body-part call-outs (they fight the rhythm). Use the Pattern E music-video variant from the same anatomy file.

## Sources

- `lesson_always_eyeball_before_publish.md` — established Papa-passive mitigations (this template is the canonical implementation)
- `lesson_kling_prompt_anatomy.md` — Pattern E (group still + motion-only)
- `lesson_nano_banana_group_shot.md` — when to pre-render
- `lesson_kling_continuity_locks.md` — anti-morph + intensity tone-down vocabulary
