# Episode 1 — "The Puppies Want Pancakes" · Recording Checklist

**Total: 8 clips × 15s = 2 min episode**
**Per clip: 720p · 15s · Native Audio ON · expect 135 credits**

For each clip: pick SCENE from Uploads → tick CHARACTERS in Bind dialog → Custom Multi-Shot → paste 4 shot prompts → set per-shot durations → verify **135** on Generate (do NOT actually click Generate while recording — just hover to confirm, then continue to next clip).

---

## CLIP 1 — "Puppies Wake Up the Sisters" (DONE, already rendered)
Skip. Already submitted and rendered.

---

## CLIP 2 — "Sisters Sit Up, Joe Joins In"
- **Scene:** `bedroom_sisters.png`
- **Characters to tick:** Sara, Eva, Joe
- **Shot durations:** 3 · 4 · 4 · 4
- Prompts: see `clip_02.json`

---

## CLIP 3 — "Stampede to the Kitchen"
- **Scene:** `livingroom.png`
- **Characters:** Sara, Eva, Ginger, Joe
- **Shot durations:** 4 · 4 · 4 · 3

---

## CLIP 4 — "Mama at the Stove, Puppies Beg"
- **Scene:** `kitchen_morning.png`
- **Characters:** Mama, Sara, Eva, Ginger, Joe
- **Shot durations:** 4 · 4 · 4 · 3

---

## CLIP 5 — "Papa Joins the Party"
- **Scene:** `kitchen_morning.png`
- **Characters:** Papa, Mama, Sara, Eva
- **Shot durations:** 4 · 4 · 4 · 3

---

## CLIP 6 — "Counting Pancakes 1-2-3-4-5" (learning beat)
- **Scene:** `dining_room.png`
- **Characters:** Sara, Eva
- **Shot durations:** 4 · 4 · 4 · 3

---

## CLIP 7 — "Tiny Puppy Pancakes"
- **Scene:** `kitchen_morning.png`
- **Characters:** Mama, Ginger, Joe, Eva
- **Shot durations:** 4 · 4 · 4 · 3

---

## CLIP 8 — "A Pancake Family Morning" (warm closer)
- **Scene:** `dining_room.png`
- **Characters:** Sara, Eva, Mama, Papa, Ginger, Joe  *(6 characters — max for this series)*
- **Shot durations:** 4 · 4 · 4 · 3

---

## What I'm learning from your recording

1. **Character tile positions** — each character's `div:nth-child(N)` index in the bind dialog (Sara=?, Eva=?, Mama=?, Papa=?, Grandma=?, Ginger=?, Joe=?)
2. **Scene tile positions** — each scene PNG's tile index in the Uploads panel
3. **The exact click sequence** to repeat for every subsequent clip (close popup, History→Uploads, pick image, Confirm, bind-gear, tick characters, close dialog, Custom Multi-Shot, fill shots, set durations, 720p)
4. **Any quirks** (dialogs that pop up mid-flow, scroll-into-view needs, etc.)

Once recorded, I parse the codegen output and generate `submitClip.mjs` that can submit ANY future clip given just a JSON spec.
