# Episode 1 — Clip 1: Cold Open (Aerial Establishing)

**Status:** READY FOR REVIEW — do NOT submit yet.
**Credit cost:** 90 credits (= 30 × 3 × 5s chunks)
**Duration:** 15.0 seconds
**Covers:** Page 1 of the scenario (narrator cold open, before we meet the characters)
**Episode:** [sara_and_eva_meet_a_baby_deer.json](episodes/sara_and_eva_meet_a_baby_deer.json)

---

## The 15 seconds, broken into 3 multi-shot beats

| Shot | Duration | Visual beat | Narrator line (recorded separately in Gemini TTS, NOT in Kling) |
|---|---|---|---|
| 1 | 5s | High aerial establishing — camera drifts gently forward over the quiet suburban neighborhood. Mature trees, driveways, sunny spring morning. | *"In a quiet suburban neighborhood, on a bright spring morning..."* |
| 2 | 5s | Push in closer on the two-story stone house — pool visible on the left, green backyard, driveway, warm golden morning light. | *"...in a cozy stone house with a rainbow afghan on the couch and a rainbow of kids' drawings on the fridge..."* |
| 3 | 5s | Camera descends smoothly from aerial view → down to eye-level → holds on the outside of the kitchen window, soft curtains just visible through the glass. | *"...lived two sisters. A big one, named Sara. And a little one, named Eva..."* |

---

## Kling setup (exact steps, in order)

### 1. Scene element (bind once per session)
- **Name:** `HouseAerial`
- **File:** `/Volumes/Samsung500/goreadling/assets/characters/saraandeva/scenes/house_aerial.png`
- **Action:** click "Bind elements to enhance consistency" → Create → upload the PNG → name it `HouseAerial` → confirm green checkmark.

### 2. Subject elements
**None for this clip.** No characters on screen — empty establishing shot. (Character binds kick in at Clip 2 when we enter the kitchen.)

### 3. Mode toggle
- Click **"Custom Multi-Shot"** (the UI will swap to the Shot1 / Shot2 / Shot3 editor and display the `Cancel Custom Multi-Shot` header).

### 4. Shots (paste into the three shot-prompt text areas)

**Shot 1 — 5s**
> Slow cinematic aerial establishing shot drifting forward over the suburban neighborhood in @HouseAerial. Mature green trees, driveways, residential rooftops, early spring morning sun. Soft warm golden light. Birds softly visible as specks. Gentle forward camera drift, no zoom, no cuts. Pixar feature-film cinematography.

**Shot 2 — 5s**
> Continue forward. Camera pushes closer to the two-story stone-clad family house of @HouseAerial. The rectangular blue pool visible on the left, green backyard behind, driveway curving on the right. Warm golden-hour morning light on the shingle roof. Gentle hovering cinematic motion.

**Shot 3 — 5s**
> Camera gracefully descends from aerial view down toward the side of the house of @HouseAerial, arriving at eye-level at the kitchen window. Ends holding still on the exterior of the kitchen window, soft white curtains just visible through the glass inside. A hint of breakfast steam. No cuts, one smooth descent. Pixar establishing shot.

### 5. Settings bar (verify before Generate)
- Resolution: **720p**
- Duration: **15s**
- Output count: **1**
- **Native Audio: OFF** (toggle off — non-negotiable, the TTS audio gets mixed separately)
- Generate button should display: **90 credits**

### 6. Credit check (sanity)
- Expected: `30 × Math.ceil(15 / 5)` = `30 × 3` = **90**.
- If the Generate button shows anything other than 90, STOP — something is misconfigured (Audio ON, wrong duration, or unexpected mode). Don't submit.

### 7. Generate
- Only after everything above is verified.
- **For this review pass: DO NOT CLICK.**

---

## Files to have open/ready

| Purpose | Path |
|---|---|
| Scene reference (upload to Elements) | [house_aerial.png](../../assets/characters/saraandeva/scenes/house_aerial.png) |
| Episode script (context) | [sara_and_eva_meet_a_baby_deer.json](sara_and_eva_meet_a_baby_deer.json) |
| This clip spec | [clip_01_cold_open.md](clip_01_cold_open.md) |

---

## What happens after this clip renders (not yet)

- Kling renders the 15s MP4 with one gentle camera move across 3 shots.
- Download **Without Watermark**.
- Save to: `content/saraandeva/episodes/ep01_clips/clip_01.mp4`
- Mix with the TTS narrator audio (Gemini, Zephyr voice, ~13s spoken + ~2s tail).
- This becomes the first 15s of the final episode MP4.

## Why this clip exists

It's the hero shot that locks "this is our house" in the viewer's mind from frame one. Every future episode can re-use the same `house_aerial` scene binding with the same narrator cold-open cadence, giving the series a familiar Pixar-movie opening signature. Think of the opening of *Up*, *Coco*, *Turning Red* — this is that.

---

## Review checklist before we submit

- [ ] Shot 1 prompt — does the forward-drift feel right, or should it hold still?
- [ ] Shot 2 prompt — should the house be already centered or approached from the side?
- [ ] Shot 3 prompt — window framing correct? Or should we end on a different exterior detail (front door, porch)?
- [ ] 5+5+5 beat split vs. a different split (e.g. 3+3+9 for a longer held-window close)?
- [ ] Any line of narrator copy you want rewritten?
- [ ] Any concern about the single bound scene (HouseAerial) being enough, or want to also bind a reference photo like `fron_house_lemonade_stand` for extra accuracy?

Tell me what to adjust and I'll update this spec. When approved, I'll run the Playwright automation (or you can do it manually following the steps above) and we'll land our first 90 credits on a real Kling render.
