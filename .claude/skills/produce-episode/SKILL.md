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

Use the canonical structure (see ep10's `Kick the Ball.md` / `Pink Tree Whisper.md` / `Burgers in the Car.md` for examples):
- **Genre / Tempo / Mood / Voicing / Length target**
- **Verse / Chorus / Bridge** with explicit `(BEAT)` markers and call-and-response between sister voices
- **Notes for Suno** at the bottom (instrumentation guidance, no autotune, doo-wop pastiche, etc.)

**Output:** 2-3 lyric .md files ready for the user to paste.

---

## 🛑 USER HANDOFF #1 — Manual upload + Suno generation

**FIRST — auto-open Suno + every lyric file** (memory: `feedback_auto_open_suno.md` — user flagged 2026-05-04). Run BEFORE printing the chat message so they pop up while user is still reading:

```bash
open "https://suno.com/create"
for md in saraandeva/assets/music/lyrics/<Song1>.md saraandeva/assets/music/lyrics/<Song2>.md; do
  open -t "$md"
done
```

THEN print a single-block hand-off message to the user. List exactly:

1. **PNGs to upload to Kling library** (each named with HYPHENS, lowercase to match spec tags):
   ```
   • jeep-wrangler        ← assets/scenes/jeep_wrangler.png
   • magic-forest-sandy   ← assets/scenes/magic_forest_sandy.png
   • ...
   ```

2. **Suno lyrics to paste + generate** (already opened in editor + suno.com/create open in browser):
   ```
   • Kick the Ball         ← assets/music/lyrics/Kick the Ball.md
   • Pink Tree Whisper     ← assets/music/lyrics/Pink Tree Whisper.md
   • ...
   ```
   Tell user to save mp3s to `assets/music/<Song Name>.mp3` (matching the lyric .md filename).

3. **Then ping me with "go"** to start Phase D.

**Why manual:** Kling element-creation UI is unstable (memory: `lesson_kling_library_upload_unstable.md`); Suno automation is fragile (memory: `lesson_suno_song_automation.md`). Manual is the proven reliable path.

---

## PHASE D — submitEpisode.mjs

After the user says "go":

```bash
node saraandeva/.claude/skills/saraandeva-episode/scripts/submitEpisode.mjs \
  --episode=<NN> --include-music
```

Internally runs:
1. **Phase 0** — `validateClipCasting.mjs` (hard precondition; aborts on errors)
2. **Phase 1** — `addMissingElements.mjs` (sanity-check that every bound element has a PNG locally)
3. **Phase 2** — `submitOmniClip.mjs` for each numeric clip + each `musicVideoBlock` (A/B/C). Each submission costs 90 cr (10s) or 135 cr (15s parent-activity).

Total cost expected: ~2000-2500 cr. Runtime ~10-20 min (Kling submit-per-clip is sequential).

**Output:** All clips queued at Kling. Receipt printed to stdout with task IDs.

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

Based on ep08-ep10 production:
- **Cost**: ~2000-2600 cr (~$12-15) per episode at 18-22 clips + 3 music-video specs
- **Runtime active**: ~40 min (user upload+Suno) + ~20 min (script execution Phases A-D) + ~20 min (Phase E)
- **Runtime unattended**: ~30-60 min (Kling render gap between D and E)
- **Abort threshold**: > 2200 cr base cost — review the spec for excessive char-count or unnecessary 4-char clips

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
- `lesson_kling_omni_pipeline_fixes.md` — 30 hard rules
- `lesson_kling_ghost_anatomy_ep10.md` — ghost / driver-180 / 3-arm anatomy traps
- `lesson_nano_banana_group_shot.md` — 4+ char workflow
- `lesson_papa_play_scene_per_episode.md` — gender-coded parent-activity rule
- `lesson_kling_library_upload_unstable.md` — why Phase B/handoff is manual
- `lesson_suno_song_automation.md` — why Suno generation is manual
- `reference_kids_youtube_trends_2026.md` — ep11-20 backlog + viral formulas
- `feedback_run_pipeline_dont_ask.md` — when user says "produce ep<NN>", run end-to-end without per-step confirmation

---

## What this skill explicitly does NOT do

- **Recover deleted/lost episode metadata** (e.g. ep03/ep04/ep05 missing specs) — those are one-off recovery tasks
- **Upload to PUBLIC** — episodes always land UNLISTED for user review first
- **Auto-generate Suno songs** — that's a manual step (Phase C writes lyrics, user runs Suno)
- **Auto-upload Kling library elements** — that's a manual step (PNGs are ready in assets/scenes/, user drags-drops)
- **Schedule recurring publishes** — that's outside this skill's scope
