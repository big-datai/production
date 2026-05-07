---
name: ep11 v7 — duplicate-position trap (Lesson #11)
description: When the SAME `@Char` is described in TWO different physical positions across beats (e.g. "kneeling 3 feet away" beat 1 → "snuggled at shoulder" beat 3), Kling renders BOTH states simultaneously → duplicate character + ghost extras. Fix is total position lock — only ONE character per clip may transition pose, all others are STATIC from second 0 to second N.
type: lesson
severity: hard-block
appliedTo: validateClipCasting + future Kling Omni prompts
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---

# What happened (ep11 v7, clip 15)

ep11 clip 15 (Papa parent-activity, 15s) rendered in two places at once when the prompt described:
- **Beat 1**: "Sara already kneeling on the grass to the LEFT of Papa about three feet away"
- **Beat 3**: "Sara already snuggled in close on the LEFT side of Papa's shoulder, both arms already softly wrapped around his upper arm"

Same trick for Eva. Kling rendered "two Evas + a ghost girl" — both states of each kid in the same frame.

This was the third time clip 15 had a different rendering bug:
1. v6 — bloody-stomach from "vivid red ketchup splatter near apron front" (red+face co-occurrence)
2. v7 attempt 1 — two Evas + ghost girl (duplicate-position trap)
3. v7 attempt 2 — clean ✅ (after locked-position fix)

# Root cause

Kling's omni-mode prompt parser anchors each `@Char` to the FIRST POSITION it sees and tries to honor every subsequent position description by spawning additional instances of that character. Multiple positions = multiple renders.

Even safety pins like "Sara has exactly two arms" don't fix this — the duplication isn't an anatomy error, it's *two distinct Saras* in the frame.

# The rule

**Position lock per clip — only one character may change pose.**

For any multi-beat clip with N characters:
- Pick ONE character whose body actually transitions (e.g. Papa: standing → belly-down)
- Lock the other N-1 characters in EXACTLY ONE physical position from second 0 through second END
- Describe each non-moving character ONCE at the top of the prompt with their final pose
- In each beat, only describe what the moving character is doing + what dialogue everyone has
- Do NOT add new physical position descriptions per beat for the locked characters
- Anatomy locks ("exactly two arms") are still required, but they don't substitute for position lock

Add this paragraph to every parent-activity / multi-beat prompt:

```
POSITION LOCK — every character stays in their EXACT same physical spot from
second 0 through second N. Only @<MovingChar>'s torso changes between beats.
@<StaticChar1> and @<StaticChar2> DO NOT move, DO NOT change spots, DO NOT
stand up, DO NOT crawl, DO NOT shift positions at any point. There are
exactly N people in the entire frame: ...
```

# How to detect

A simple `grep` per character finds repeated position language in the same prompt:
```bash
python3 -c "
import json, re
prompt = json.load(open('clip.json'))['prompt']
for char in ['Papa','Sara','Eva','Mama','Joe','Ginger']:
    matches = re.findall(rf'@?{char}\\s+already\\s+([^.]{{20,200}})', prompt)
    if len(matches) > 1:
        print(f'⚠ {char} described in {len(matches)} positions:')
        for m in matches: print(f'  • {m[:120]}')
"
```

This caught ep12 clip 13 (sandcastle parent activity) post-ep11 — Eva was described both "kneeling on the RIGHT" and later "lifting a bucket" with implied cross-position contradiction (she had to reach from RIGHT all the way over to LEFT to tip water on Papa's head). Fix: lock Eva to one spot, have her tip the empty bucket "the wrong direction" deadpan in place — Papa pantomimes the wet-head reaction from his locked position.

# Validator integration (TODO)

Add to `validateClipCasting.mjs`:
```js
// Lesson #11 — position-lock trap. Detect when the same @Char appears in two
// distance-bucketed contexts (close vs far) within one prompt.
const POSITION_LOCK_TRAP = (prompt) => {
  for (const char of ["Papa","Sara","Eva","Mama","Joe","Ginger"]) {
    const re = new RegExp(`@?${char}\\s+already\\s+([^.]{20,200})`, "g");
    const positions = [...prompt.matchAll(re)].map(m => m[1].toLowerCase());
    if (positions.length < 2) continue;
    // Heuristic: if one mention has "feet away" / "across" / "stride from"
    // and another has "snuggled" / "close to" / "right next to", that's the
    // far→close transition that breaks Kling.
    const hasFar  = positions.some(p => /\b(feet|few|away|across|stride|opposite|other side)\b/.test(p));
    const hasClose = positions.some(p => /\b(snuggled|right next to|pressed against|chest|shoulder|arm-in-arm)\b/.test(p));
    if (hasFar && hasClose) return char;
  }
  return null;
};
```

Severity: **HARD ERROR** — block submission. Cost of letting it through: 135 cr per re-render attempt.

# References

- `lesson_kling_motion_verbs_duplicate.md` — related: motion-toward verbs ("walks to", "approaches") cause same dup-render bug via different mechanism (start+end state)
- `lesson_kling_ghost_anatomy_ep10.md` — related: 4-char clips with one in BACKGROUND
- `retrospective_ep11_lessons.md` — full ep11 retrospective (this trap was unknown at retrospective time)
- ep11 v7 keeper: https://youtu.be/BZCFoXQ4pWA (rendered correctly with locked positions)

# Status

- ✅ Memory rule documented (this file)
- ✅ Applied to ep11 v7 clip 15 (rendered clean)
- ✅ Applied to ep12 clip 13 (sandcastle parent activity) preventatively
- ⏳ TODO: Wire into `validateClipCasting.mjs` as HARD ERROR (regex above)
- ⏳ TODO: Add to `saraandeva-episode-from-prompt/SKILL.md` as Step 5i
