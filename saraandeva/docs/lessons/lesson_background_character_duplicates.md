---
name: A 4th anchored character "in the BACKGROUND" doubles duplicate-character risk
description: Even with motion verbs banned, 4-character compositions where one is anchored to BACKGROUND/behind/distant generate extras roughly 25%+ of the time. Cap clips at 3 foreground-anchored characters; drop the 4th if their role is just "stands behind".
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
ep09 clip 19 (EXIT — "next week?") burned 270 cr (3 attempts × 90 cr) chasing a duplicate-character bug:
- v1: 4 chars (Mama, Sara, Eva, Papa). Papa "in the BACKGROUND" → 2 Saras
- v2: 4 chars + stronger negative prompt → still bad: extra small girl + extra adult both in background
- v3: dropped Papa entirely (3 chars: Mama, Sara, Eva, all foreground) → CLEAN

**Pattern:** when a clip has 4 bound characters and one is positioned "in the BACKGROUND", "behind", "in the distance", or similar, Kling tends to fill the background with extras (random small girls, random adults). The 11% baseline duplicate rate (memory rule #21) jumps to ~25%+ in this configuration.

**Why:** background-anchoring leaves the model latitude to "complete the family scene" with random extras. Foreground-anchoring is more constrained.

**How to apply:** during spec drafting (`saraandeva-episode-from-prompt`):
- If a clip needs 4 characters AND one would be in BACKGROUND, **drop them**. Their visual presence is rarely worth the retake cost.
- The episode beat usually still reads fine: "the family leaves Costco" is communicated well enough by Mama+Sara+Eva with cart, even without Papa.
- Hard cap: **max 3 foreground-anchored characters per clip**. If the 4th can be foregrounded (LEFT/RIGHT/CENTER, not BEHIND), they're fine.
- Add to negative prompt for any 3-character outdoor shot: `family members in the background, additional children, extra child in background, second blonde child, ghost figure, shadow of person`.

**Skill update:** add a Step 5.5 in `saraandeva-episode-from-prompt/SKILL.md` flagging this.
