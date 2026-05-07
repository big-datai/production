---
name: Papa-plays-with-girls scene REQUIRED every episode (15s, not 10s) — Mama-cooking scene optional add-on
description: Papa-actively-playing-with-the-girls is a HARD requirement in every Sara & Eva episode. Mama-cooking-with-girls is optional bonus. Top retention driver. 15s/135cr. Strengthened post-ep11 (user: "dad play with girls each episode").
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
**Hard rule — non-negotiable, every episode (strengthened post-ep11, user feedback "dad play with girls each episode"):**

EVERY Sara & Eva episode MUST include at least ONE scene of **Papa actively playing with Sara and Eva** — physical, outdoor, or sports activity. Not narrating, not watching, not just present, not just talking. **Active play.** Render at **15 seconds**, not the default 10. (Cost +45 cr per scene = $0.26 — trivial vs retention impact.)

This is the single highest-retention beat type for @SaraAndEva. The "Nastia + her dad" / dad-tickle-monster genre is a top-three driver.

**Papa-with-girls active-play activity pool (rotate so each ep feels fresh):**

- **Tag / tickle-monster game** — yard, parking lot, hallway, anywhere open
- **Sports one-on-one** — soccer, tennis, basketball, catch, frisbee, kickball
- **Push-on-swing / playground** — slide, climber, monkey bars
- **Bike / scooter ride together** — Papa jogging alongside or biking with girls
- **Piggy-back / horsey-on-hands-and-knees**
- **Daddy-daughter dance** — kitchen, living room, anywhere with music
- **Building a fort together**
- **Pool splash fight**
- **Wrestling / pillow fight** (gentle)
- **Hike / beach day**
- **Daddy-as-goalie blocking shots**
- **Snow play** — sledding, snow angels, snowman building
- **Dance party in the living room**
- **Backyard obstacle course / superhero training**
- **Trampoline / bounce-house**

**MANDATORY ep-by-ep rotation tracker — pick a fresh activity each ep so the show doesn't feel repetitive:**
- ep10: soccer one-on-one (3.7) + tag-around-Jeep at Weber's (18.3)
- ep11: patty-flip lesson at grill (cooking-hybrid, clip 4) + tag-monster game (clip 4.5) + lunge-slip tackle-hug (clip 15)
- ep12+: pick from pool above, never repeat last 2 episodes' activity

## Mama-cooking add-on (OPTIONAL — never replaces Papa-active)

Mama-with-girls cooking/domestic/reading scene is a NICE-TO-HAVE second parent-activity. Add when the episode has a kitchen/home setting:

- **MAMA + girls = COOKING / BAKING / DOMESTIC**: making pancakes, baking cookies, decorating cupcakes, prepping pizza dough, mixing smoothies, packing lunches, gardening, painting nails, doing hair
- **EITHER PARENT + girls = READING** (calming closer): bedtime story, reading on couch, library trip

Mama scenes are 10s standard. They DON'T satisfy the Papa-active requirement.

**Why:**
- User explicitly compared to the "Nastia + her dad" content niche (high-CTR kid-YouTube genre).
- Kids respond strongly to visible parent-kid play; it's a Bluey/Heeler-style emotional anchor.
- 15s gives room to choreograph 3 beats (setup → peak silly moment → reaction punchline) that 10s flattens.
- Cost is 135 cr (vs 90 cr at 10s) but retention impact is well worth it.

**How to apply when drafting an episode (Step 2.5 of the planning skill):**
- Look at the episode arc. Find a natural slot — usually a transition moment, a "while waiting" beat, or a celebration moment.
- Pick a play activity from the variety pool (rotate so episodes don't feel repetitive):
  - Tickle-monster tag (yard, parking lot, hallway)
  - Soccer / basketball / catch one-on-one
  - Push-on-swing at the park
  - Bike ride beside the kid (Papa jogs alongside)
  - Piggy-back ride / horsey on hands and knees
  - Daddy-daughter dance (kitchen, living room)
  - Building a fort together
  - Splash fight in the pool
  - Daddy as goalie blocking shots
  - Wrestling / pillow fight
- Set `durationSec: 15`, `expectedCredits: 135`, `nativeAudio: true`.
- Choreograph 3 explicit beats inside the prompt: `(BEAT 1 — 0-5s)`, `(BEAT 2 — 5-10s)`, `(BEAT 3 — 10-15s)`.
- Include 3+ pieces of dialogue (Papa + at least one kid each beat) so Native Audio has clear lip-sync targets.
- Cap at 2-3 bound chars (Papa + 1-2 kids) to avoid the 4-char ghost trap.

**ep10 examples added post-review:**
- `3.7.json` — Papa plays goalie/striker mini-match with Eva at YMCA gym (15s, 135 cr)
- `18.3.json` — Tag around the Jeep at Weber's drive-in while waiting for burgers (15s, 135 cr)

**Budget impact:** add 270 cr per episode (2 × 15s). At ~$0.0058/cr that's ~$1.50 — worth it for a top retention driver.

**Future-episode placeholders to consider:**
- ep11+: rotate through different sports/activities so the play moment feels fresh each episode.
- One play scene minimum, two if the arc supports it (e.g. opening play + closing play).
