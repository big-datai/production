---
name: ep15 production state as of 2026-05-07 (resume here in next session)
description: Current state of ep15 'Where's Ginger?!' Halloween production. ~$8.40 spent. 5 ep15 elements in registry, 22 prompts written but in OLD @Sara syntax, 1 multi-shot test stuck on Kling, all images and Suno song complete. Next session starts here — convert prompts to <<<element_N>>> syntax + resubmit clips properly via submitOmniViaApi.mjs.
type: project
originSessionId: 2026-05-07-ep15
---

# What's done ✅

- **Spec**: `content/episodes/ep15/episode.json` — 22-clip beat sheet locked, characters/scenes manifested, formula reference, continuity notes. Title: `Sara and Eva 🎃 Where's Ginger?!`
- **Lyrics + Suno song**: `lyrics_we_found_ginger.md` + `we_found_ginger.mp3` (3 MB, generated and downloaded via API). Title at Suno auto-set to "Hiding By Candy".
- **Reference images** at `assets/scenes/`: 8 Halloween costume previews (Sara_HW_Princess, Eva_HW_Pumpkin, Papa_HW_Werewolf, Mama_HW_Cozy, Joe_Bug_Costume, Ginger_Pumpkin_Cape, Isabel_Unicorn, Leo_Tiny_Dinosaur) + 5 decorated houses + 2 Pattern E group stills + 2 character avatars (lisa_front, mrs_patel_front).
- **GCS bucket** `gs://saraandeva-kling-elements/ep15/` populated with 27 PNGs (publicly readable). Plus `ep15/lastframes/` was cleaned.
- **Kling API elements created** (registry at `content/elements_registry.json`):

| Name | element_id | Notes |
|---|---|---|
| ep15_Eva | 310093803059503 | front + eva_3q + eva_profile. **Verified 100/100 canon** in solo test. |
| ep15_Sara | 310094133206523 | front + sara_3q + sara_profile |
| ep15_Mama | 310094139106317 | front + mama_3q + mama_profile |
| ep15_Joe | 310094145048304 | Pomeranian, tag o_103 (Animal) |
| ep15_Ginger | 310094151148317 | Jack Russell, tag o_103 |
| (older test elements: Joe=310000741885315, jo_beach=310000923945307, Sara=310001512573308, Eva=310001518722300, Papa=310056797721310 — these have wrong descriptions, **don't use**, kept in registry as historical) |

# What's open / TODO 🔧

## 1. Convert ep15 clip prompts to working API syntax (CRITICAL)

The 22 clip JSONs at `content/episodes/ep15/N.json` use `@Sara`, `@Eva` etc. — **doesn't work with Kling API**. Per `lesson_kling_omni_api_schema.md`, the API expects `<<<element_1>>>`, `<<<element_2>>>` etc. by index.

For each clip:
1. Read `clip.subjects` array (e.g. `["Sara", "Eva", "Mama", "Joe", "Ginger"]`)
2. Map subjects to element_ids in `content/elements_registry.json` (use `ep15_<Name>` keys, NOT the bare `Sara`/`Eva` test entries)
3. Write a `prompts/clip<N>.txt` file with `<<<element_1>>>` … `<<<element_N>>>` references in the order subjects appear
4. Write a `prompts/clip<N>.neg.txt` file with the negative prompt
5. Submit via `submitOmniViaApi.mjs`

A subagent can do this conversion mechanically — read each `.json`, output the `.txt` + `.neg.txt`, ready for submission.

## 2. Render Lisa + Mrs. Patel 3q + profile angles

Currently both have only the front view. For ep15 they appear in clips 15 (Lisa) and 16/17/18 (Mrs. Patel). Without 3-angle refs, drift is more likely. Use `content/generateFamilyAvatars.py --character lisa --view 3q` etc. to generate the missing views.

## 3. Decide on element ordering for ensemble shots

For Pattern E clips (13: 4 kids + Joe-bug; 17: full family + Mrs. Patel + 2 dogs), more than 5 elements per `element_list` may exceed Kling's per-shot averaging capacity. Per `lesson_kling_multi_character_drift.md`, stage shots with 1-2 chars max. Options:

- **Option A**: keep all 7 elements in `element_list`, write the prompt to focus tightly on 1-2 chars at a time (close-ups + cuts)
- **Option B**: split clip 13/17 into two sequential 5-second renders, each with 2-3 elements, then ffmpeg concatenate

Option A is one render. Option B is two renders ($0.60 + $0.60 = $1.20 vs $0.60). A is cheaper if it works.

## 4. Resume submission via submitOmniViaApi.mjs (the working path)

Once clip prompts are in `<<<element_N>>>` syntax + element_ids resolved:

```bash
cd /Volumes/Samsung500/goreadling-production/saraandeva

# For clip N (example clip 1):
node .claude/skills/saraandeva-episode/scripts/submitOmniViaApi.mjs \
  --anchor "https://storage.googleapis.com/saraandeva-kling-elements/ep15/front_house_fall.png" \
  --elements "ep15_Sara,ep15_Eva,ep15_Mama,ep15_Joe,ep15_Ginger" \
  --prompt-file content/episodes/ep15/prompts/clip1.txt \
  --negative-file content/episodes/ep15/prompts/clip1.neg.txt \
  --duration 10 --mode std --aspect-ratio 16:9 \
  --external-id ep15-clip1-3 \
  --out content/episodes/ep15/clips/clip_1.mp4
```

Anchor source for each clip:
- Clips 1, 2, 3 → `front_house_fall.png` (family front porch)
- Clips 4, 5, 6 → `ep15-house1-witch-cauldron.png`
- Clips 7, 8, 9 → `ep15-house2-pirate-ship.png`
- Clips 10, 11, 12 → `ep15-house3-skeleton-lawn.png`
- Clips 13, 14 → `ep15-house4-isabel-cottage.png`
- Clip 15 → `front_fence_sidewalk.png`
- Clips 16, 17, 18 → `ep15-house5-candy-house.png`
- Clips 19, 20 → `front_fence_sidewalk.png` (or use clip 18's last frame for continuity)
- Clips 21, 22 → `front_house_fall.png` (back home interior)

For continuity, after clip N renders, extract last frame and use it as clip N+1's anchor:
```bash
ffmpeg -sseof -0.1 -i clip_N.mp4 -update 1 -vframes 1 -y clip_N_last.png
gsutil -q cp clip_N_last.png gs://saraandeva-kling-elements/ep15/lastframes/clip_N_last.png
# then use https://storage.googleapis.com/.../clip_N_last.png as the anchor for clip N+1
```

## 5. Stuck multi_prompt task to monitor (background)

Task `881199455830155341` (ep15-multi-clip1) submitted 2026-05-07 03:00 UTC was stuck "processing" >20 min when this session ended. Either it eventually completes (charges ~$0.60) or fails. Check status before any further multi_prompt experiments — this account may have a bad multi_prompt path.

## 6. NPC characters (one-off — described in prompt only)

For ep15 NPCs (Witch-Mama, Pirate-Dad, Skeleton-Grandpa, Isabel-Mom), they appear in only 1 scene each. Don't create elements — describe them in the prompt instead. Their face will drift between renders but it's a single appearance so doesn't matter.

# What was wasted (lessons absorbed)

- $7.80 burned on initial 11 clips submitted via wrong schema (`element_id: [...]` array + `@Sara` syntax). Kling silently ignored the bind and rendered generic family. Saved by the user pointing at /tmp/kling_omni_*.py scripts that worked.
- ~$1.20 on schema-iteration test clips before Eva-only test cracked it.
- Multi_prompt 20-min hang — possibly $0.60 if it ever completes.

# Production cost so far

- Gemini renders (initial images + costume previews + 5 houses + Lisa/Mrs.Patel + 2 group stills): **~$0.68**
- Kling clip rendering (broken initial 11 + 1 Eva test + 1 schema test + multi_prompt pending): **~$8.40**
- Suno: $0 (free tier)
- GCS: pennies

**Total ep15 spend: ~$9.10** (could rise to ~$9.70 if stuck multi_prompt completes).

If you finish the episode from here:
- 22 clips × $0.60 = $13.20 if all single-prompt
- + ~$2-3 buffer for re-renders / 2-shot extras for ensemble scenes
- **~$16 to finish ep15 from current state**

# Files canonical to ep15

```
content/episodes/ep15/
├── episode.json                       # Beat sheet, asset manifest
├── 1.json … 22.json                   # Per-clip prompts (CURRENTLY in @Sara format, need conversion)
├── lyrics_we_found_ginger.md          # Suno lyrics (LYRICS + GENRE sections)
├── we_found_ginger.mp3                # Generated Suno song (3 MB)
├── _pipeline_state.json               # Old pipeline state — kling_ep15_pipeline.mjs is DEPRECATED, has wrong schema
├── prompts/eva_only_test.txt          # Working <<<element_1>>> example
├── prompts/eva_only_test.neg.txt
└── clips/
    └── eva_only_test.mp4              # The 100/100 canon-locked Eva-only test
```

# Skill scripts to use (canonical, persistent)

- `submitOmniViaApi.mjs` — single-clip API submission (THE working path, takes --elements + --prompt-file)
- `createElementViaApi.mjs` — create element + auto-update registry
- `sunoSongs.mjs` — Suno song generation (CDP UI, has known issues — UI download path is broken)
- `sunoDownloadLatest.mjs` — Suno song download via API (THIS works, use after sunoSongs creates the song)
- `auditClipsWithGemini.mjs` — Gemini Flash QA on rendered clips
- `reviewPromptWithGemini.mjs` — Gemini Pro prompt review

DEPRECATED — has wrong schema, do not use:
- `kling_ep15_pipeline.mjs` (this session's failed orchestrator)

# Resume sequence — if you're a new session

1. Read `lesson_kling_omni_api_schema.md` (the correct schema)
2. Read `lesson_kling_multi_character_drift.md` (multi-char drift remedies)
3. Read `lesson_kling_api_runbook.md` (script usage patterns)
4. Read `family_pets_canon.md` (Joe + Ginger character canon)
5. Read this file (current state)
6. Convert ep15 clip prompts: `@Sara` → `<<<element_1>>>` etc.
7. Submit clips via `submitOmniViaApi.mjs` one at a time, eyeballing each render before continuing
8. Use last-frame-anchor chain for continuity between sequential clips
9. Audit each render with `auditClipsWithGemini.mjs` before declaring "ready"
