---
name: Tone parent-outrage DOWN + lock animal poses on the GROUND in kids-show prompts
description: Kling renders dramatic adult-shouting + environmental-reaction language as scary/violent in a kids show. Tone parent comedic-frustration to a sigh-and-grin level. Always explicitly anchor pets/dogs to "all four paws on the ground" so Kling doesn't render them airborne in reaction shots.
type: feedback
originSessionId: c368ab61-ad14-44b1-b688-335065572594
---
**Two rules that MUST be applied to every Sara & Eva clip with a parent reacting to a pet/kid mishap:**

## Rule 1 — parent reactions stay COMEDIC, never RAGEFUL

Kling treats words like "thundering shout", "apoplectic", "fury", "rage", "screams", "yells", "wide-mouth scream" as scary-violent in the rendered face/body. Even in a comedy beat, the rendered expression reads as horror-movie if the dialogue tag uses intensity words.

**Don't write:**
- "thundering apoplectic shout"
- "shout echoes faintly"
- "leaves visibly tremble"
- "rage-face"
- "JOOOOOE!!!" (multi-syllable scream-out)
- Any "the screen shakes" / "the trees shake" environmental-reaction language

**Do write:**
- "calm exasperated sigh, light playful tone"
- "goofy comic gasp, eyebrows up"
- "soft 'oh-come-on dad-voice'"
- "Oh JOOOE..." (single elongated syllable, soft + resigned)
- "mouth twitches into a reluctant grin"
- "shakes head with a tiny resigned smile"

**Always add to negative prompt for any parent-reaction clip:**
```
papa screaming aggressively, papa shouting violently, papa angry shout, papa rage face, papa scary face, scary expression, frightening expression, intense yelling, environmental shake, leaves trembling, ground shaking, dramatic sound waves, action lines, motion lines from shouting
```

(Same template applies to Mama for mama-reaction clips.)

## Rule 2 — animals stay GROUNDED in reaction shots

Kling reads "Papa shouts" + "Joe reacts" as physical reaction → renders Joe LAUNCHED into the air. ep11 clip 14 first re-render had Joe floating mid-flight while Papa raged like a horror-villain. User flagged immediately.

**Always lock pets/animals to all-four-paws explicitly:**

```
@Joe STANDING FIRMLY ON ALL FOUR PAWS flat on the green grass, [pose details]. Joe stays GROUNDED on his four paws the entire clip — does NOT jump, does NOT leap, does NOT lift off the ground, NOT mid-air.
```

**Always add to negative prompt for any pet clip:**
```
dog flying, dog in mid-air, dog jumping, dog leaping, dog floating, dog levitating, airborne dog, dog launched into air, dog mid-leap, dog lifted off ground
```

(Same template applies to Ginger or any other recurring animal.)

## Why this rule exists

ep11 clip 14 ("JOOOOE!" / Joe "mmf?" beat). First version: rage-face Papa + airborne Joe. User caught and required re-render — Kling's interpretation of the dramatic comedy beat was visually unsuitable for a 3+ year-old audience. Total cost of catching late: 90 cr for first re-submit + 90 cr to fix again = 180 cr ($1.05). Catching at draft time = $0.

## When to apply

- ANY clip where a parent reacts to a pet/kid getting into mischief
- ANY clip where a pet is the comedic-victim subject
- ANY clip where shouting / yelling / dramatic-call dialogue would be natural

## Validator extension idea

Future tooling: extend `validateClipCasting.mjs` to flag prompts that contain rage-words ("apoplectic", "thundering", "fury", "rage", "yells", "screams") combined with parent-character mentions. Flag as warning so author re-reads. (TODO post-ep11.)
