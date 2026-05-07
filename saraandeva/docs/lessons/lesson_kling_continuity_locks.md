---
name: ep13 post-mortem — continuity locks + intensity tone-down (Kling community-guide synthesis)
description: Two complementary rule families distilled from public Kling AI prompt-anatomy guides (Dec 2025 – Feb 2026) plus our own ep11/13 cost data. (1) Anti-morph negatives + positive continuity-lock vocabulary that anchor character likeness across frames. (2) Intensity tone-down — kid-show prompts must avoid horror-tier intensifiers that Kling renders as actual horror lighting / scary face / morphing. Both now baked into validateClipCasting (rules 8g + 8h) and saraandeva-episode-from-prompt SKILL.md (rule 5j + negativePrompt baseline).
type: lesson
severity: enhancement
appliedTo: validateClipCasting + saraandeva-episode-from-prompt SKILL.md
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
# Continuity locks + intensity tone-down

Distinct from the duplicate-character bucket (clones, twins, ghost extras), these address a separate failure class: **frame-to-frame inconsistency, anatomy warping, and ghost faces** plus **horror-tier rendering of comedic emotional beats**.

## 1. Anti-morph negative-prompt block (zero cost, universal benefit)

Add these 6 terms to every clip's `negativePrompt`:

```
morphing, flickering, disfigured, distorted, extra face, unstable motion
```

| Term | What it prevents |
|---|---|
| `morphing` | Character features drifting between frames (face changing shape mid-clip) |
| `flickering` | Pop-in/pop-out of body parts, hair, clothing |
| `disfigured` | Anatomy warping (folded limbs, swapped features) |
| `distorted` | Geometric stretching of bodies/faces |
| `extra face` | Ghost faces appearing in background or overlapping characters |
| `unstable motion` | Frame-to-frame jitter that looks like the camera glitched |

Source synthesis: Roboverse YouTube guide (Sep 2025), invideo Kling reference-first guide (Dec 2025), atomic-gains Kling 3.0 guide (Feb 2026), plus our ep10–13 actual ghost/180-turn/3-arm cost data.

Lint rule 8g (`validateClipCasting.mjs`) — WARNING when any of these 6 are missing.

## 2. Positive continuity-lock vocabulary

Anti-morph negatives say what NOT to do. Continuity locks say what TO PRESERVE — they anchor character likeness across the clip:

| Phrase | Use case |
|---|---|
| `preserve silhouette` | Character outline must stay stable |
| `maintain proportions` | Head/body/limb ratios locked |
| `keep colors consistent` | No color drift across frames |
| `preserve facial features` | Face stays recognisable |
| `maintain scale` | Character size relative to scene stays fixed |
| `helmet stays on throughout` | Specific prop lock (we already use this) |
| `same wardrobe end-to-end` | No clothing morphing |

**When to use:** any 2+ char clip with bound character avatars (Pattern A or B). NOT in Pattern E motion-only prompts — there the still does this work and adding text fights the still (see `lesson_kling_prompt_anatomy.md`).

Pair with `POSITION LOCK` for full coverage:
- POSITION LOCK = staging (where each char is, what they don't change)
- Continuity locks = likeness (what each char looks like, what doesn't drift)

## 3. Intensity tone-down — kid-show comedy can't use horror language

ep11 clip 14 burned 180 cr re-rendering a "Mama-discovers-disaster" scene because the prompt used `apoplectic` + `thundering shout` + `leaves tremble` — Kling rendered actual horror lighting and a contorted scary face. Lesson: **kid-show comedy intensity ≠ actual emotional intensity language.**

### Banned (lint rule 8h — WARNING)

| Banned word/phrase | Why |
|---|---|
| `thundering` (voice/shout/roar) | Renders as horror sound + dark sky |
| `apoplectic` | Renders as contorted face + red lighting |
| `rage face` / `raging` | Direct horror render |
| `furious` / `fury` | Same |
| `violent(ly)` | Renders as actual violence |
| `explosive(ly)` | Body parts blow apart visual |
| `snap his head` / `snap her head` | Whiplash morph artifact |
| `lunges at` / `lunges toward` | Spawns motion-blur ghost |
| `slams into` / `slams onto` / `slams down` | Body deformation on impact |
| `abrupt(ly) jump/stop/turn/spin` | Frame-jitter render |
| `shriek(ing)` | Horror-trope vocal |

### Use instead

| Replace with | When |
|---|---|
| `calm sigh` | Mild parental disappointment |
| `comic gasp` | Surprise reveal |
| `eyebrows shoot up` | Wide-eyed shock |
| `slow blink` | Confused beat |
| `double-take` | "Wait, what?" comedy |
| `mouth a small 'O'` | Silent gape |
| `subtle / slow / micro [movement]` | Any restrained body motion |
| `soft tone` | Gentle vocal delivery |
| `theatrical "OH NOOOO!"` | Comedic faux-alarm |
| `mock-monster groan` | Playful adult-pretending-to-be-scary |
| `booming silly voice` | Dad-joke energy without horror |

## 4. The "adjust one lever at a time" rule (iteration discipline)

When a clip renders wrong and you need to re-submit, change exactly ONE thing per attempt:
- v1 → v2: only change the binding pattern (e.g. switch from canonical avatars to group still + Pattern E)
- v2 → v3: only adjust the prompt language
- NEVER change binding + prompt + scene + character count all at once — you can't tell which fix worked

ep13 burned ~675 cr on iterations partly because we changed multiple things per redo and couldn't isolate the cause.

## 5. Reference-first principle reinforced

The invideo/Kling community consensus is that **ONE strong reference image is enough** for character consistency — Kling extracts depth/silhouette/layout from a single anchor frame. This validates our Pattern E (group still alone + motion-only prompt) and Pattern A (single canonical avatar).

Don't stack 3+ visual anchors hoping more = better — they fight each other (see `lesson_kling_prompt_anatomy.md` Pattern D failure mode).

## Implementation checklist

- ✅ Lint rule 8g (UNIVERSAL_ANTI_MORPH_NEGATIVES) — WARNING when missing terms
- ✅ Lint rule 8h (INTENSITY_OVERSHOOT_TRAP) — WARNING with replacement suggestions
- ✅ `negativePromptRequired` in `episode.json` template — extended with 6 anti-morph terms
- ✅ Negative prompt baseline (rule 10) in saraandeva-episode-from-prompt SKILL.md — extended
- ✅ New rule 5j in planner skill — continuity-lock vocabulary + tone-down replacements
- ⏳ TODO: also extend the auto-prepend list in `submitOmniClip.mjs` so anti-morph terms are injected at submission even when author forgets to add them at draft time (zero-cost defense in depth)

## Sources

- Roboverse, "How to use Kling AI the CORRECT way (4 Things I Wish I Knew)", YouTube, Sep 2025
- invideo, "Hidden Secrets of Kling AI: The Reference-First Guide", Dec 2025
- Atomic Gains, "KLING 3.0 — Ultimate Guide with Pro tips", YouTube, Feb 2026
- Internal: `lesson_kling_prompt_anatomy.md` (ep13 post-mortem), `lesson_kids_show_comedy_intensity.md` (ep11 post-mortem)
