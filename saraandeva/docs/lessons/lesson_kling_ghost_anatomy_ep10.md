---
name: ep10 — three Kling failure modes that bit hard
description: ghost-character (5th figure in 4-char clips) + Mama-180-turn-around + 3-arm anatomy bug. Fixes for each.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
ep10 (Soccer & Magic Forest) had 5 broken renders out of 23 — a far higher failure rate than ep08-09. Three distinct failure modes:

## 1. "Ghost-girl / 2-eva" duplicate-character (clip 7, 11)
**Pattern:** 3+ char clips render with EXTRA child(ren) added between or behind the bound characters. Different from straight clone — model invents a new girl.
**Why ep10 was worse:** ep10 introduced 10 new bound elements at once (Jeep + magic-forest + magic-deer + pink-tree + weber + etc.) vs ep08-09's 6-7 each. Kling's char-count anchoring degrades when many novel anchors stack.
**Fix:**
- Strict count emphasis in prompt: "EXACTLY 2 PEOPLE — no third child, no ghost figure"
- Drop char count where possible (clip 7: dropped Mama, narrative-only off-camera voice)
- For 4+ char clips: use Nano Banana group-shot pre-render (see `lesson_nano_banana_group_shot.md`)
**Negative-prompt terms to add (beyond the standard set):**
`partial face peeking out, half face at edge, child between mama and papa, small face in the back, child poking out from behind, fifth person, fifth face, fifth head, sixth person, three children, two blonde girls, two curly haired girls, additional girl, extra girl`

## 2. Mama 180° turn-around (clip 12)
**Pattern:** Driver character renders TURNED AROUND looking at the back seat — unnatural and unsafe-looking.
**Trigger:** The phrase "over-the-shoulder shot ... looking back at the kids" combined with "Mama in driver seat gripping wheel" — Kling resolves the conflict by rotating Mama 180° to face the back seat.
**Fix:** Don't combine "looking back at kids" framing with "driver gripping wheel". Pick one:
- Wide EXTERIOR side shot of the rocking vehicle with three faces visible through windows (Mama in profile facing forward through windshield)
- Front-view interior with all chars facing camera/forward
**Add to prompt when driving:** "Mama is NEVER turned backward, ALWAYS facing forward. Eyes on the road ahead through the windshield."

## 3. Three-arm anatomy bug (clip C — Burgers in the Car music video)
**Pattern:** Each character has THREE arms — one holds the prop (milkshake) AND two more do the dance moves.
**Trigger:** Prompt asked them to BOTH hold milkshakes AND "swing arms back and forth, point fingers down to the floor" — Kling can't reconcile cup-holding with arm-swinging so it spawns an extra arm pair.
**Fix:** When chars hold an object AND dance:
- LOCK both hands on the object: "ONE hand around the bottom of the cup and the OTHER hand around the top of the cup, cup held at chest height the entire time"
- Dance is LOWER-BODY + HEAD ONLY: "hip bops side-to-side, knee bends, head bobs"
- "Step in" interactions instead of arm reaches (e.g. "step toward each other and clink cup rims at center, then step back")
- Strict anatomy declaration: "EXACTLY 2 ARMS, EXACTLY 2 HANDS — both hands ALWAYS occupied with the milkshake"
**Negative-prompt anatomy terms:** `three arms, third arm, extra arm, extra hand, floating hand, third hand, four arms, six arms, extra limbs, anatomy error, free arm swinging while holding cup, hand without arm, arm without body, duplicate limb, milkshake floating in air, cup levitating, hand pointing while also holding cup`

## How to apply going forward
- Audit every spec at draft-time for these three traps:
  1. Does ANY clip have 4+ chars? → use Nano Banana group-shot pre-render
  2. Does ANY clip mix "driving" with "looking back / over-the-shoulder"? → switch camera angle
  3. Does ANY clip have characters holding an object AND dancing? → lock hands on object, lower-body dance only
- If all three traps avoided, expect baseline ~11% dup rate (ep08-09 levels)
- If any of these triggers, expect 25%+ failure rate — budget for re-renders accordingly
