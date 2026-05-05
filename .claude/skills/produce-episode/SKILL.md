---
name: produce-episode
description: Orchestrator skill for the @SaraAndEva YouTube channel. Takes a one-paragraph story idea and produces a finished episode uploaded to YouTube UNLISTED. Chains the planning sub-skill, asset generation, two user-handoff breakpoints (manual Kling library upload + Suno song generation), and the two-command production pipeline (submitEpisode.mjs + produceEpisode.mjs). Triggers on "produce ep<NN>", "new sara and eva episode about X", "let's do ep<NN>", "make a new episode about Y", "/produce-episode <prompt>".
argument-hint: "<paragraph describing the episode>"
---

# produce-episode — end-to-end orchestrator for Sara & Eva

You are running the full production pipeline for a Sara & Eva episode. Input: a one-paragraph story idea from the user. Output: a YouTube UNLISTED video URL the user can flip to PUBLIC.

**Two skills + two scripts + two user breakpoints** chained in sequence:

```
[user]  one-paragraph story idea
  ↓
PHASE A — Plan + draft spec       (sub-skill: saraandeva-episode-from-prompt)
PHASE B — Generate scene PNGs     (script: generateScenes.py / generateGroupShot.py)
PHASE C — Write Suno lyric files  (markdown)
  ↓
🛑 USER HANDOFF #1
   • Upload N PNGs to Kling library (manual ~30s/element, drag-drop)
   • Paste 2-3 Suno lyrics into Suno UI, generate, download mp3s
   • User says "go" when done
  ↓
PHASE D — submitEpisode.mjs       (validates + addMissingElements + submits to Kling)
  ↓
⏳ KLING RENDER WAIT (~30-60 min — set ScheduleWakeup, let user use the laptop)
  ↓
PHASE E — produceEpisode.mjs       (download → music segs → assemble → thumb → short → validate → upload)
  ↓
[result]  https://youtu.be/<id> UNLISTED — user reviews and flips to PUBLIC
```

Total wall-clock per episode: ~1 hour active (40 min user + 20 min script) + 30-60 min unattended Kling render.

---

## When this skill is triggered

Triggers on user phrases like:
- "produce ep11", "make ep12", "let's do ep<NN>"
- "new sara and eva episode about <topic>"
- "ep<NN> about <topic>"
- "/produce-episode <prompt>"

If the user provides a paragraph-length story idea, treat that as the spec input. If they only give a topic, ask for one paragraph of story before starting Phase A.

---

## PHASE A — Plan + draft spec

**Invokes the planning sub-skill** [`saraandeva-episode-from-prompt`](../saraandeva-episode-from-prompt/SKILL.md). That skill is the canonical spec-drafting reference; follow its full procedure (Steps 1-7) here. In summary:

1. Read context — `locationCatalog.yaml`, latest episode JSON as format reference, key memory files
2. Identify cast / scenes / NEW bound elements from the prompt
3. Apply the audience-retention rules (hook, curiosity gaps, emotional pivot, parent-activity scene at 15s, cliffhanger)
3.5. **Bake in 2-4 fourth-wall audience-engagement beats** — direct-to-camera "ask the kid" questions placed at story-beat boundaries. The kid watching should be invited to ANSWER OUT LOUD ("Did YOU see where the burgers went?", "What should we make tomorrow?"). The final cliffhanger MUST be a camera-ask. (memory: `lesson_fourth_wall_audience_engagement.md`)
4. Plan music-video loop blocks (1-2 per episode, decimal slots like 4.5/12.5/18.5)
5. Draft the arc (8-11 beats, 1-3 clips per beat)
6. Write `episode.json`
7. Extend `generateScenes.py` / `generateProps.py` catalogs for any NEW bound elements
8. Write each numbered clip JSON (apply all hard rules — see saraandeva-episode-from-prompt SKILL.md sections 5-5f)
9. Run `validateClipCasting.mjs --episode=<NN>` — must exit 0 before proceeding

**Output:** `saraandeva/content/episodes/ep<NN>/` populated with `episode.json` + N clip JSONs + A/B/C music-video specs.

### 🎯 Per-clip binding decision tree (post-ep13 — APPLY UPFRONT, not as recovery)

Pick the binding pattern BEFORE drafting the prompt. Choosing wrong here is the #1 cause of duplicate-character re-renders.

| Clip composition | Pattern | Binding | Prompt style |
|---|---|---|---|
| 1 char | **A** | `[@CharName]` | Minimal — focus on action/dialogue |
| 2 chars w/ DISTINCT visual anchors (color helmet, prop, separation) | **B** | `[@C1, @C2, @scene]` | Mention each anchor explicitly |
| 2 sisters (Sara+Eva) WITHOUT distinct anchors | **E** | `[@group-still]` only | Motion-only — describe what CHANGES per beat |
| 3+ chars OR complex staging | **E** | `[@group-still]` only | Motion-only |
| Char moves through 3+ NAMED positions (LEFT/RIGHT/BACK/FRONT) | ❌ **REDESIGN** | n/a | Lock to ONE position; show beats via gesture only |

**Pattern E motion-only template:**
```
Composition anchored by @<group-still>. Animate the still gently — only <character>'s
arm gestures and facial expression change. POSITION LOCK throughout entire {N}s.
Exactly {COUNT} people in the frame, no extras.

(BEAT 1, 0–5s) <action>. <Char>: "<dialogue>"
(BEAT 2, 5–10s) <action>. <Char>: "<dialogue>"

[NO position labels. NO character appearance details. NO scene re-description.
The still IS the composition.]
```

**Why this matters (cost data from ep13):**
- Wrong pattern → 50%+ duplicate-character render rate → re-submission cost ~135 cr per clip
- ep13 ran 1980 cr base + 675 cr in iterations = 2655 cr (35% overage) because 4 clips picked wrong patterns initially
- Lint rules (8d, 8e, 8f) HARD-BLOCK common mistakes (multi-position-path, sister-pair similarity, prompt over-describe)
- Memory: `lesson_kling_prompt_anatomy.md` has the full GOOD vs BAD prompt analysis with examples.

---

## PHASE B — Generate scene/element PNGs

For every entry in `episode.json.newBoundElements`, generate the PNG via Nano Banana (gemini-3-pro-image-preview):

```bash
# Standard scenes (locations, environments)
for scene in <new_scene_ids>; do
  python3 saraandeva/content/generateScenes.py --scene "$scene" &
done
wait

# Props (small items)
python3 saraandeva/content/generateProps.py --prop <prop_id>

# 4+ character group shots (anti-ghost) — for any clip flagged by validateClipCasting
python3 saraandeva/content/generateGroupShot.py <output_id> \
  --chars mama,papa,sara,eva --pose "..." --scene <bg_scene> --n 3
```

PNGs land in `saraandeva/assets/scenes/`. Cost: ~$0.01/PNG, 30s each, parallelizable.

**Output:** All bound-element PNGs exist on disk.

---

## PHASE C — Write Suno lyric files

For each `musicVideoBlock` in `episode.json`, write a lyric markdown file:

```bash
saraandeva/assets/music/lyrics/<Song Name>.md
```

**Suno has TWO separate input fields** (post-ep13 user feedback) — split the markdown into two paste-ready code blocks so the user can copy each into the right place:

1. **📋 LYRICS** block — goes into Suno's "Lyrics" field. Verse / Chorus / Bridge with explicit beat markers (e.g. `[Verse 1 — Eva, dreamy wonder]`) and call-and-response cues between voices. Plain readable lyrics — no instrumentation tags here.

2. **🎨 STYLES** block — goes into Suno's "Styles" field, **HARD-CAPPED at 1000 characters** (Suno truncates beyond that). This is the genre / tempo / voicing / instrumentation tag-paragraph. Pack it dense:
   - Genre + tempo + mood + length target
   - Voicing (with any GENDER LOCKS for character-specific voices, e.g. "WARM CARTOON WOLF (Papa) — silly Goofy/Looney-Tunes friendly-wolf, NEVER scary or growly; plus GIGGLY LITTLE-GIRL PIG SISTERS (Sara + Eva)")
   - Instrumentation list (lead, rhythm, percussion, FX layered)
   - Tonal references to other songs in the series ("Tonal reference: Pink Tree Whisper from ep10")
   - AVOID list (autotune, trap drums, scary growly voices, EDM, etc.)
   - **Verify char count ≤ 1000** before saving — `${#styles_block}` in shell or `len(styles_block)` in python.

3. **How to use** section at the bottom (1 short paragraph) — paste-and-go instructions for the user.

See ep13's `Little Pigs Let Me Come In.md` / `Push Me Higher.md` / `Everyones IT.md` for the canonical two-block format. Earlier episodes (ep10–ep12) have the single-block format and should be migrated whenever the songs are regenerated.

**Output:** 2–4 lyric .md files ready for the user to paste, each with a verified-under-1000-chars STYLES block.

---

## 🛑 USER HANDOFF #1 — Manual upload + Suno generation

**FIRST — auto-open Suno + Kling library + every lyric file** (memory: `feedback_auto_open_suno.md` — user flagged 2026-05-04). Run BEFORE printing the chat message so everything pops up while user is still reading:

```bash
open "https://suno.com/create"
open "https://kling.ai/app/user-assets/principal/elements"
for md in saraandeva/assets/music/lyrics/<Song1>.md saraandeva/assets/music/lyrics/<Song2>.md; do
  open -t "$md"
done
```

THEN print a single-block hand-off message to the user. Critical reminders:

1. **PNGs to upload to Kling library**. Show a TABLE with both name + path:
   ```
   | Kling element name        | PNG file path                                   | Char count |
   |---------------------------|-------------------------------------------------|------------|
   | playground-park           | assets/scenes/playground_park.png               | 15         |
   | ep<NN>-clipX-group        | assets/scenes/group_ep<NN>_clipX_<id>.png       | <=20  ⚠   |
   ```
   - **Kling has a ~20-char limit on element names** (post-ep13 lesson). Truncated names like `playground-tower-hou` (20) are fine; longer ones get chopped. Verify char count.
   - **Include any Nano Banana group stills** for Pattern E clips (3+ char clips). User uploads these the same way as scenes/props.
   - **If Kling name doesn't match the spec's `@-tag` exactly**, lint will fail and submit will fail.

2. **Suno lyrics to paste + generate** (opened in editor + suno.com/create open):
   ```
   • Kick the Ball       ← assets/music/lyrics/Kick the Ball.md
   • Pink Tree Whisper   ← assets/music/lyrics/Pink Tree Whisper.md
   • ...
   ```
   - **Paste BOTH blocks** — the lyric .md has a 📋 LYRICS code block AND a 🎨 STYLES code block (≤1000 chars). Lyrics → Suno's "Lyrics" field; Styles → Suno's "Styles" field.
   - **Save mp3s with the EXACT canonical filename** that matches the lyric .md. Suno auto-titles songs from the chorus, but `assets/music/<Song Name>.mp3` MUST match the lyric filename for the assemble script to find it. Post-ep13 lesson: don't accept Suno's auto-title as the filename.

3. **Then ping me with "go"** to start Phase D.

**Why manual:** Kling element-creation UI is unstable for automation (memory: `lesson_kling_library_upload_unstable.md`); Suno automation is fragile (memory: `lesson_suno_song_automation.md`). Manual is the proven reliable path. The official `klingai-dev/klingai` ClawHub skill provides API access — see "Future migrations" section.

---

## PHASE D — submitEpisode.mjs

After the user says "go":

```bash
node saraandeva/.claude/skills/saraandeva-episode/scripts/submitEpisode.mjs \
  --episode=<NN> --include-music
```

Internally runs:
1. **Phase 0** — `validateClipCasting.mjs` (hard precondition; aborts on errors). Includes lint rules 8d (multi-position-path), 8e (sister-pair similarity), 8f (prompt over-describe with group still).
2. **Phase 1** — `addMissingElements.mjs` (sanity-check that every bound element has a PNG locally + paths match `episode.json.newBoundElements`).
3. **Phase 2** — `submitOmniClip.mjs` for each numeric clip + each `musicVideoBlock` (A/B/C). Each submission costs 90 cr (10s) or 135 cr (15s parent-activity).

Total cost expected: ~2000-2500 cr base; realistic ceiling 2700 cr if 1-2 clips need v2 iteration. Runtime ~10-20 min (Kling submit-per-clip is sequential — Chrome port 9222 shared).

**Pre-submit gotchas (post-ep13):**
- **`asset:` paths in `episode.json.newBoundElements` MUST match where Nano Banana actually wrote the PNG.** `generateScenes.py` writes to `assets/scenes/`, `generateProps.py` writes to `assets/scenes/` (NOT `assets/props/`), `generateGroupShot.py` prepends `group_` to filename. Mismatch = `addMissingElements` errors out.
- **Don't re-fire submitOmniClip for the same prompt within 5 min.** Chrome timeouts cause silent retries; previous submission may have already cost 90 cr. Check Kling Works tab before re-submitting.
- **2 sequential uploads ok, 3+ Kling UI stalls.** When auto-uploading Nano Banana stills via `source: "upload"`, Kling's "Add from Element Library" button times out after ~2 sequential calls. Fall back: ask user to drag-drop the still manually + change spec to `source: "library"`.

**Output:** All clips queued at Kling. Receipt printed to stdout with task IDs. ANY clip that didn't queue is logged — re-submit only those, not the whole episode.

---

## ⏳ KLING RENDER WAIT

Kling renders take ~30-60 min total (parallel queue). Don't poll — it wastes attention.

```javascript
ScheduleWakeup({ delaySeconds: 1800, prompt: "Resume produce-episode Phase E for ep<NN>", reason: "Wait for Kling renders to complete" })
```

Tell the user "I'll wake up in ~30 min and finish the pipeline. You can close the laptop."

---

## PHASE E — produceEpisode.mjs

When the wakeup fires (or user pings "ready"):

```bash
node saraandeva/.claude/skills/saraandeva-episode/scripts/produceEpisode.mjs \
  --episode <NN> --title "Sara & Eva: <Episode Title>!"
```

Internally runs 7 phases fail-fast:
1. `downloadOmniByPrompt.mjs` — fetch all clips (incl. decimal `3.7.json` / `17.5.json` add-ons)
2. `loopVideoWithSong.mjs` × each musicVideoBlock → `<N>.5.mp4` segments
3. `assembleEpisode.mjs` → auto-versioned `ep<NN>_v<next>.mp4`
4. `generateThumbnail.mjs` (default hero clip 14)
5. `generateShort.mjs` (default source: highest .5 segment)
6. `validateEpisode.mjs` (errors abort upload)
7. `uploadEpisodeToSaraAndEva.mjs` (UNLISTED, Made-for-Kids)

Useful flags:
- `--start-from N` resume from a phase (e.g. `--start-from 3` if download already done)
- `--stop-after N` preview-only runs (e.g. `--stop-after 5` to skip validate+upload)
- `--no-upload` alias for `--stop-after 6`
- `--hero-clip N` override thumbnail hero clip (default 14)
- `--short-source NN.5.mp4` override the short's source segment
- `--privacy unlisted|public|private` (default unlisted)

---

## When v1 has duplicate-character renders — re-render playbook

If 1-3 clips render with extras / dups / wrong staging (post-ep13 reality):

### 1. Diagnose the failure pattern (look at extracted frames)

| Symptom | Likely cause | Fix |
|---|---|---|
| 2 Saras OR 2 Evas in frame | Sister-pair similarity (Pattern C w/o anchor) | Switch to Pattern E: Nano Banana group still + motion-only prompt |
| 4+ Papas in frame, character "moving around" | Multi-position-path (3+ named positions for one char) | REDESIGN: lock to 1 position, beats = gestures only |
| Composition wrong but characters right | Pattern D conflict (group still + scene + prompt re-description) | Drop the scene binding, drop position labels in prompt; Pattern E motion-only |
| Wrong character appearance (Papa doesn't look like Papa) | Group still bound w/o canonical avatar; Kling drifted from canonical | Either: (a) bind canonical `@Papa` only + scene + minimal prompt, OR (b) regen Nano Banana still with sharper canonical-avatar reference |

### 2. Re-render only the affected clips (NOT the whole episode)

```bash
node saraandeva/.claude/skills/saraandeva-episode/scripts/submitOmniClip.mjs \
  content/episodes/ep<NN>/<clip>.json
```

**Cost:** ~90 cr per re-render (135 if 15s parent-activity).

### 3. After re-render, re-download + re-assemble

```bash
node saraandeva/.claude/skills/saraandeva-episode/scripts/downloadOmniByPrompt.mjs \
  content/episodes/ep<NN> season_01/episode_<NN>/clips
node saraandeva/.claude/skills/saraandeva-episode/scripts/produceEpisode.mjs \
  --episode <NN> --start-from 2  # skip download if already done
```

**Watchout: matcher swaps.** `downloadOmniByPrompt` matches Kling renders to clip slots by prompt-text similarity. If two clips have near-identical prompt structures (e.g. both starting with "Composition anchored by @ep<NN>-clip*-group"), the matcher CAN swap their files. Make each clip's prompt distinctive (specific dialogue, named actions). When swap happens, manually rename `clips/<wrong-N>.mp4` → `clips/<right-N>.mp4`.

### 4. Cost recovery rule of thumb

- 1-2 dup-clips → re-render same day, ~180-270 cr extra. Acceptable.
- 3+ dup-clips → suspect a systemic spec issue (used Pattern C/D throughout?). Audit + bulk-redesign before re-submitting.

---

## RESULT — hand back to user

When Phase E completes, print:

```
✅ ep<NN> uploaded UNLISTED.
   Watch: https://youtu.be/<id>
   Edit:  https://studio.youtube.com/video/<id>/edit

Total cost: <NNNN> cr (~$<X>)
Runtime:    <M:SS>
```

User reviews in Studio and flips privacy to PUBLIC manually (or re-runs Phase E with `--privacy=public`).

---

## Cost / runtime envelope

Based on ep08-ep13 production:
- **Cost (clean run)**: ~1800-2200 cr ($10-13) per episode at 18-22 clips + 2-3 music videos
- **Cost (with 1-3 v2 clip re-renders)**: 2200-2700 cr ($13-16). ep13 hit 2655 cr from binding-pattern mistakes.
- **Runtime active**: ~30-40 min (user upload+Suno) + ~15-20 min (script Phases A-D) + ~10-15 min (Phase E)
- **Runtime unattended**: ~5-30 min (Kling render gap between D and E — much faster lately)
- **Abort threshold**: > 2700 cr — at that point, redesign rather than keep re-rendering

**Cost-saving rules locked in post-ep13:**
- Apply Pattern E binding decision tree UPFRONT (not as recovery) → avoids most v2 iterations
- Don't re-fire same submitOmniClip within 5 min → idempotency check missing in script, do it manually
- Run `validateClipCasting --episode=<NN>` before EVERY submit, not just first time → catches lint regressions
- Open Kling Works tab before any re-download → confirms render landed before invoking matcher

---

## Sub-skills and scripts referenced

| Layer | Path | Role |
|---|---|---|
| **Sub-skill** | `.claude/skills/saraandeva-episode-from-prompt/SKILL.md` | Spec drafting (Phase A). All hard rules live here. |
| **Asset gen** | `saraandeva/content/generateScenes.py` | Bound-element scene PNGs |
| | `saraandeva/content/generateProps.py` | Prop PNGs |
| | `saraandeva/content/generateGroupShot.py` | Nano Banana 4+ char group shots (anti-ghost) |
| **Pre-render orchestrator** | `saraandeva/.claude/skills/saraandeva-episode/scripts/submitEpisode.mjs` | Phase D — validates + submits |
| **Post-render orchestrator** | `saraandeva/.claude/skills/saraandeva-episode/scripts/produceEpisode.mjs` | Phase E — download → assemble → upload |
| **Validators** | `validateClipCasting.mjs` (pre-submit) | Hard preconditions inside submit/upload |
| | `validateEpisode.mjs` (pre-upload) | |
| **Packagers** | `generateThumbnail.mjs` | Frame extract + Pillow Impact-yellow recipe |
| | `generateShort.mjs` | 1080×1920 designed-BG vertical short |

The scripts directory at `saraandeva/.claude/skills/saraandeva-episode/scripts/` is a **tool library**, not a skill — its own SKILL.md has been retired. Anything tooling-related lives there.

---

## Memory files this skill relies on

When starting a new episode, the most relevant memory files (auto-loaded):
- **`lesson_kling_prompt_anatomy.md` ⭐ POST-EP13** — Pattern E vs A/B/C/D, motion-only template, GOOD vs BAD prompt examples, decision tree
- **`lesson_kling_position_lock.md` ⭐ POST-EP11/13** — same-char-multiple-positions trap (Lesson #11)
- `lesson_kling_omni_pipeline_fixes.md` — 30 hard rules (foundational)
- `lesson_kling_ghost_anatomy_ep10.md` — ghost / driver-180 / 3-arm anatomy traps
- `lesson_nano_banana_group_shot.md` — 4+ char workflow
- `lesson_papa_play_scene_per_episode.md` — gender-coded parent-activity rule
- `lesson_kling_library_upload_unstable.md` — why Phase B/handoff is manual
- `lesson_suno_song_automation.md` — why Suno generation is manual
- `lesson_no_red_splatter_kids_show.md` — red-near-face = blood render
- `lesson_kids_show_comedy_intensity.md` — no apoplectic / thundering / pet-airborne
- `lesson_fourth_wall_audience_engagement.md` — 2-4 camera-asks per ep, final cliffhanger MUST be camera-ask
- `reference_kids_youtube_trends_2026.md` — ep11-20 backlog + viral formulas
- `feedback_run_pipeline_dont_ask.md` — when user says "produce ep<NN>", run end-to-end without per-step confirmation
- `feedback_auto_open_suno.md` — auto-open Suno + lyric files at handoff
- `feedback_single_version_props.md` — generate one PNG per scene/prop, no `_v1/_v2` variants

---

## Future migrations (deferred to ep14+)

- **Replace Playwright submitOmniClip.mjs with `klingai-dev/klingai` ClawHub skill** — official Kling AI CLI/HTTP-API skill (`openclaw skills install klingai`). Eliminates Chrome timeouts, enables parallel submissions (ep13 submit phase: 15 min → 5 min), API-managed element CRUD (no manual Kling library drag-drop for new chars). Migration plan documented in conversation 2026-05-05.
- **Submit-idempotency cache** — prompt-hash dedup with 5-min TTL in `submitOmniClip.mjs` to prevent accidental double-spend.
- **Lint rule 8g** — flag clips with prompts starting with the same 50 chars (matcher-similarity risk that swaps file slots in `downloadOmniByPrompt`).
- **End-screen automation** — YouTube Data API `videos.update` to add end screens pointing to next-episode in Season 1 playlist (saves manual Studio work per episode).

---

## What this skill explicitly does NOT do

- **Recover deleted/lost episode metadata** (e.g. ep03/ep04/ep05 missing specs) — those are one-off recovery tasks
- **Upload to PUBLIC** — episodes always land UNLISTED for user review first
- **Auto-generate Suno songs** — that's a manual step (Phase C writes lyrics, user runs Suno)
- **Auto-upload Kling library elements** — that's a manual step (PNGs are ready in assets/scenes/, user drags-drops)
- **Schedule recurring publishes** — that's outside this skill's scope
