---
name: NO red liquid splatter / squirt anywhere near a face — kids show absolute rule
description: Kling renders bright-red liquid on/near a character's face or mouth as blood. Always reads as blood — even when the user wrote "ketchup". Hard ban on red splatter+face/mouth/apron-front/lips/chin combos in any clip prompt. Add aggressive negative-prompt blood terms.
type: feedback
originSessionId: c368ab61-ad14-44b1-b688-335065572594
---
**Rule:** in any kids-show clip prompt, NEVER pair red liquid (ketchup, jam, jelly, paint, juice, soda, anything bright red) with imagery of a character's FACE, MOUTH, LIPS, CHIN, NECK, or APRON-FRONT. Kling will render it as BLOOD regardless of what the prompt CALLS it. The visual reads as gore, period — and gore is unacceptable in a kids show.

**Why:** ep11 clip 15 (rendered 2026-05-04). Original prompt described Papa slipping on a ketchup packet with a "vivid SQUIRT of bright red ketchup" landing as a "perfect red splash" on his apron, with him face-planting into the grass. Kling rendered red liquid streaming from Papa's mouth — looked exactly like he'd been gut-punched. User caught it on review, demanded immediate fix. Re-render cost 135 cr.

**How to apply when drafting clip prompts:**

1. **Comedic spills near a character:** make the packet/container stay SEALED and INTACT. The slip is mechanical (foot slides on the packet's slick surface), no liquid involved. "Papa's foot slips sideways on a tiny SEALED unopened SHINY-FOIL packet" works; "the packet bursts and ketchup sprays" doesn't.

2. **If a colored liquid is genuinely needed in-shot,** keep it:
   - Far from any face / mouth / chin / neck / apron-front
   - In an obvious container (bowl, bottle, cup) — not airborne, not on clothing, not in a "splatter" pose
   - Picked color other than red where possible (blue, green, yellow, purple — no blood association)
   - Cartoon-stylized (a "slap" sticker shape, not a physical-fluid spray)

3. **For ketchup specifically** — re-color the prop to something obviously non-blood:
   - "PURPLE-foil ketchup packet" / "BLUE-foil packet" — wrappers that read clearly as branded packaging, not blood
   - Or use mustard-yellow / mayo-white packets and avoid mentioning ketchup entirely
   - If Sara/Eva are eating with red ketchup later, the dollop sits on a plate beside food — never sprays, dribbles, or smears

4. **Apron / clothing safety zone:** the FRONT of an apron sits at chest level, directly under the chin and mouth. A "stain" or "splash" on the apron front + a face above = blood-from-mouth visual. Move stains to side-of-apron, lower-pocket, or eliminate the stain entirely.

5. **Joe (the Pomeranian) thief gags** are an exception in a way — Joe with ketchup smeared on his fluffy chest reads as comedic-mess, NOT blood, because dogs don't bleed-from-chest in kid associations. But still describe as "small dabs of red ketchup decorating his fur from snacking" not as "splatter" or "smear" — and zero red on his face or muzzle.

**Standard negative-prompt block for any clip with food + falling/spilling action:**

```
blood, blood splatter, red liquid spraying, red liquid on face, red liquid near mouth, red liquid around mouth, red splatter near face, red splatter near mouth, red stain on face, red dripping, red drips on apron, red splash on apron front, red on character's face, red on character's mouth, blood on lips, blood on chin, blood on shirt, ketchup squirt, ketchup spray, ketchup squirting, ruptured packet, exploded packet, opened packet, gory, gore, injury, wound, bleeding, scary, violent, distressing
```

Append to every clip's negativePrompt that involves any kind of slip, fall, splatter, food-spill, or red-colored liquid prop.

**Validator extension idea:** add a `validateClipCasting.mjs` warning when prompt contains both "red" + "splash/squirt/spray/splatter/spill/squish" within ~50 chars, AND "face/mouth/lip/chin/apron front" within ~50 chars. Flag as kids-content blood-trap before submit. Future tooling.

**Updated artifacts (2026-05-04):**
- ep11 `15.json` rewritten — sealed-intact packet, no liquid, charcoal apron stays clean. Aggressive blood-related negative prompts added.
- This file (memory) created.
- Future episodes' produce-episode + saraandeva-episode-from-prompt skills should reference this file at clip-prompt drafting time.
