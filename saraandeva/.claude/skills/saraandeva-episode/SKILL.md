---
name: saraandeva-episode
description: Generate a full Sara & Eva episode on Kling AI for the @SaraAndEva YouTube channel. Detective-mystery formula (Ginger-the-escape-artist). Single-shot micro-clip approach (5s each, max 3 bound subjects, surgical re-renders). Orchestrates per-clip submissions, watermark-free downloads, ffmpeg concat, and YouTube upload as Made-for-Kids UNLISTED. Triggers on "generate episode", "submit clip", "render Sara and Eva episode", "make a Sara and Eva clip", "new episode", "Ginger escape episode".
argument-hint: <episode_folder>    e.g. episodes/ep02
---

# Sara & Eva — Episode Generator Skill

End-to-end production for the **@SaraAndEva** kids' YouTube channel:
1. **Series formula** — every episode follows the 5-beat Ginger-escape detective structure (read §"Show formula" below).
2. **Render** — single-shot micro-clips on Kling (5s each, ≤3 bound subjects, Native Audio ON, 720p). Surgical re-render per 5s beat (45 credits) instead of redoing 15s multi-shots.
3. **Audit** — frame-by-frame check after each download; replace broken clips before concat.
4. **Concat** — ffmpeg with 0.15s scene-pop trim per clip + center-crop fill for Shorts.
5. **Upload** — to the @SaraAndEva channel as UNLISTED, Made-for-Kids ON, with goreadling.com promo links.

## 🚨 FOREMOST DESIGN CONSTRAINT — 3 characters max per clip

Kling hard-limits bound subjects to 3 (the 4th tile auto-disables). This drives every storytelling decision **before** plot, dialogue, or camera.

### The Casting Matrix workflow

1. **List the cast each beat needs** before writing prompts.
2. **If >3 characters on screen → split the beat** into rotating sub-clips, each with ≤3 bound subjects.
3. **Audience perceives the full ensemble** through cuts. Each clip stays clean.

**4-person family at dinner table example:**
- ❌ One clip with @Mama+@Papa+@Sara+@Eva (4 bound) — won't work
- ✅ Two alternating clips:
  - **Clip A:** @Mama + @Papa + @Sara (Sara's side)
  - **Clip B:** @Mama + @Papa + @Eva (Eva's side)
  Cut between them = "all 4 at table"

**6-entity ensemble (full family + both dogs) example:**
- Rotate sub-clips: @Sara+@Eva+@Mama (kitchen) → @Papa+@Ginger+@Joe (with dogs) → @Sara+@Eva+@Ginger (in-action) → etc.

**Solo & duo clips render cleanest** — bind exactly the characters in the shot, no more.

## ⭐ SHOW FORMULA (locked April 2026)

**Premise:** Ginger is an escape artist. Every episode = a NEW escape mystery the family solves.

5-beat structure, every episode:

| Beat | Time | Cast (max 3 bound) | Beat purpose |
|---|---|---|---|
| **1. HOOK — The Escape** | 0:00–0:15 | @Ginger solo (or +@Joe witness) | Audience-only POV: Ginger discovers/uses NEW escape route. Family offscreen. |
| **2. DISCOVERY** | 0:15–0:45 | @Sara + @Eva (+ @Mama) | Family realizes Ginger is gone. **Sara: "Wait — I have a plan!"** |
| **3. SEARCH (CLUES)** | 0:45–1:30 | rotating cast (≤3 per shot) | Detective beats: clue → reaction → next clue. **Sara reads at least one written clue** (goreadling.com tie-in). |
| **4. EUREKA + RESOLUTION** | 1:30–2:00 | @Sara + @Eva (+ @Ginger) | Sara assembles clues, family finds Ginger. **Eva: "Really-really-really?!"** |
| **5. CLIFFHANGER TAG** | 2:00–2:15 | @Ginger solo | Ginger eyeing NEXT escape route. Subscribe-bait. |

**Ep 1 is the PILOT** — pancake-morning routine, no Ginger mystery. Sets up the family. From Ep 2 onward, every episode follows the formula above.

## Cast roles (use as recurring beats)

| Character | Bound element | Show role | Use these recurring beats |
|---|---|---|---|
| **Sara** (6, B-level reader, freckles) | `Sara` | Detective protagonist | Reads written clues each ep (goreadling.com tie-in) |
| **Eva** (4, just learned 2-wheel bike Apr 2026) | `Eva` | Reactor / curiosity engine | "Really-really-really?!" reveal |
| **Ginger** (Jack Russell, red collar) | `Ginger` | Antagonist by mischief | Escapes weekly via new route |
| **Joe** (Pomeranian, blue collar) | `Joe` | Comic-sidekick witness | "Yip yip yip!" sniffs out clues |
| **Mama** | `mama` | Calm problem-solver | Pancake-flipper, voice of reason |
| **Papa** | `Papa` | Goofy chaos-amplifier | Tickle attacks, "spin spin spin" with girls |

## Recurring real-family beats (insert at least 1-2 per episode)

- **Sara reads X** — sign, label, recipe, note, story (1-2s, goreadling.com tie-in)
- **Spin spin spin** — sisters ask Papa to spin them by the hands (one girl at a time, never both)
- **Joe yips** — comic-relief background sounds
- **Ginger paw-prints** — visible clue trail (recurring detective device)

## Two-scene transition clips (advanced)

For movement BETWEEN scenes (e.g., Sara runs from kitchen → living room), upload BOTH scene PNGs:
- **Start frame slot:** `kitchen_morning.png`
- **End frame slot:** `livingroom.png`

Kling interpolates a smooth camera traversal between the two anchored compositions. Use sparingly (1-2 per episode max — single-scene clips render more reliably).

In clip JSON spec: add `"endScene": "Livingroom"` alongside the existing `"scene"` field. Submit script will upload both PNGs (TODO: implement in submitSingleShotClip.mjs for Episode 2).

## Prerequisites (one-time setup)

1. **Debug-port Chrome running** with Kling logged in:
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --remote-debugging-port=9222 \
     --user-data-dir=/tmp/chrome-pipeline-profile
   ```
2. **Kling tab open** at `https://kling.ai/app/video/new?ac=1`
3. **Characters + scenes already uploaded** to Kling Bind Elements (4 characters × 3 views + 14 scene PNGs — done once via `content/saraandeva/uploadToKling.mjs`).
4. **Memory file:** `~/.claude/projects/-Volumes-Samsung500-goreadling/memory/feedback_saraandeva_sets.md` — re-read before writing any new clip prompt.

## Episode folder layout

```
content/saraandeva/episodes/ep01/
├── episode.json           # 8-beat arc + rules block
├── clip_01.json           # legacy 15s multi-shot (already rendered)
├── clip_02a.json          # micro-clips: beat_microClip naming
├── clip_02b.json
├── clip_02c.json
├── clip_03a.json
├── ... clip_08c.json      # 21 micro-clips (3 per beat × 7 beats)
└── RECORDING_CHECKLIST.md
```

## Micro-clip JSON schema

```json
{
  "episode": 1, "beat": 2, "microClip": "a",
  "title": "...",
  "durationSec": 5,
  "mode": "single-shot",
  "subjects": ["Sara", "Eva"],          // ≤3 — Kling UI greys 4th tile
  "scene": "BedroomSisters",            // CamelCase — mapped to PNG via SCENE_FILE_MAP
  "nativeAudio": true,                  // ON for SaraAndEva — character voices
  "expectedCredits": 45,                // 5s × Native Audio ON
  "negativePrompt": "extra people, duplicate character, twin, clone, ...",
  "prompt": "Wide shot, locked camera. @Sara sits up on the top bunk in @BedroomSisters. @Eva: \"Morning!\""
}
```

## Pipeline (per micro-clip)

### 1. Submit a single clip

```bash
node .claude/skills/saraandeva-episode/scripts/submitSingleShotClip.mjs \
  content/saraandeva/episodes/ep01/clip_02a.json
# → fills scene + bind + prompt + 720p + 5s + Audio ON, stops at Generate for review

node .claude/skills/saraandeva-episode/scripts/submitSingleShotClip.mjs \
  content/saraandeva/episodes/ep01/clip_02a.json --auto-submit
# → also clicks Generate
```

The script:
- Resets Kling state (closes popups, exits multi-shot mode if active)
- Uploads scene PNG via `setInputFiles` on `.el-upload`
- Opens bind dialog → searches by name (`getByRole('textbox', { name: 'search-subject-name' })`) → ticks each subject → unticks stale subjects from prior clip → closes
- Fills `#design-view-container` prompt textbox
- Lints prompt for anti-patterns (race/chase, group nouns, entry verbs, appearance descriptors, missing dialogue) — warnings logged but does not block submit
- Opens settings → 720p → duration via slider arrows → Native Audio ON → closes
- Reads Generate button credit cost, asserts == `expectedCredits`
- (with `--auto-submit`) clicks Generate

### 2. Batch submit a beat

```bash
for c in clip_02a clip_02b clip_02c; do
  node .claude/skills/saraandeva-episode/scripts/submitSingleShotClip.mjs \
    content/saraandeva/episodes/ep01/${c}.json --auto-submit
  sleep 5
done
```

### 3. Download all finished renders (Omni — canonical method, ep06+)

```bash
node .claude/skills/saraandeva-episode/scripts/downloadOmniByPrompt.mjs \
  content/episodes/ep<NN> \
  season_01/episode_<NN>/clips
```

This is THE method. Pulls render URLs straight out of Kling's IndexedDB
`request_data_cache → task-feeds`, matches each cached prompt to a spec JSON
by longest-common-prefix, and HTTP-fetches the unwatermarked output URL.

**Why not the asset-page UI flow?** The old `downloadAllClips.mjs` /
`downloadClip.mjs` scripts navigate to `/app/user-assets/materials`, tick
checkboxes in render order, and use the "Download without Watermark" menu.
They break:
1. Order in the asset list shuffles (newest-first, but rendered-out-of-order
   batches mean clip 1 might be at position 7 in the panel).
2. UI selectors drift between Kling releases.
3. Capped at 8 clips per batch.

The IndexedDB-driven flow has none of those problems. Output filename is the
spec's `clip` number (so clip 1 → `1.mp4`, deterministic).

**Critical detail — IndexedDB cache CLEAR is mandatory.** Kling caches API
responses by pageTime. A page fetched while a task was status=5 (rendering)
keeps that stale data forever — even if the task has since finished. The
script clears the `task-feeds` store before reload to force a fresh API
fetch. Without this clear, recently-finished renders won't show up.

If a clip is reported "no match", it likely silent-failed at credit cap and
was never queued. Top up credits and re-submit just those clip JSONs.

### 3.5 ★ POST-RENDER AUDIT + AUTO-REPLACE (mandatory after every batch)

After every download round, **review each new clip frame-by-frame** and re-render any with these failure modes:

| Failure mode | What to look for | Action |
|---|---|---|
| Phantom characters | Counted humans / dogs > bound subjects | Add explicit negatives (`second sister`, `dog`, etc.) → re-submit |
| Character duplicates | Same bound character rendered twice | Refactor prompt to avoid double-mention of the same `@Tag` in different roles → re-submit |
| Adult avatar drift | Mama/Papa rendered with wrong hair/face/glasses | Accept for now (known weakness) OR re-bake adult bind avatars |
| Wrong location for character | Dogs on countertop instead of floor | Add explicit spatial anchor: `@Joe sits on the floor next to @Ginger` → re-submit |
| Action ignored | "@Mama looks down" but Mama looks ahead | Anchor camera angle: `Medium shot in @KitchenMorning, camera angled down.` → re-submit |
| Dialogue gibberish | Native Audio garbled / wrong character speaking | Make sure prompt has explicit `@Name: "dialogue"` for the speaking character |

**Audit workflow per clip:**
```bash
# Extract 3 frames per clip for visual ID
ffmpeg -ss 0.5 -i clip_NN.mp4 -frames:v 1 -vf scale=320:-1 /tmp/audit/clip_NN_t0.png
ffmpeg -ss 2.5 -i clip_NN.mp4 -frames:v 1 -vf scale=320:-1 /tmp/audit/clip_NN_t2.png
ffmpeg -ss 4.5 -i clip_NN.mp4 -frames:v 1 -vf scale=320:-1 /tmp/audit/clip_NN_t4.png
```

Then read those PNGs and judge each clip against its `.json` spec. Re-render any failures via:
```bash
node .claude/skills/saraandeva-episode/scripts/submitSingleShotClip.mjs \
  content/saraandeva/episodes/ep01/clip_NN.json --auto-submit
```

After re-render, **archive the broken version** as `clip_NN_v1_buggy.mp4` (don't delete — useful for diffing what changed).

### 4. Concat into episode MP4

```bash
ffmpeg -i clip_02a.mp4 -i clip_02b.mp4 ... \
  -filter_complex "<scale+pad+concat>" \
  -c:v libx264 -crf 23 -c:a aac -y ep01.mp4
```

(Arc order from `episode.json`'s `arc[].microClips[]`.)

## HARD RULES — verified by ~2,500 credits of audit (Episode 1, April 2026)

These are baked into `feedback_saraandeva_sets.md` (memory). Re-read it before writing any prompt.

### A. Tag mention rules (most credit-burning category)
1. **Max 2 `@Tag` mentions per character per prompt.** Action+dialogue can be same `@Sara` adjacent in one sentence. Composition setup + separate dialogue line = 2 Saras render. (Clip_07b spawned 2 Saras at table from "@Sara points... @Sara: 'Two...'".)
2. **Best pattern:** fold action+dialogue into ONE sentence: `@Sara on the LEFT pointing with a fork: "Two. Three. Four."`
3. **No bound character's name in ANOTHER character's dialogue line.** `@Sara: "Come on, Eva — pancakes!"` spawns extra Eva. Drop the name.
4. **All recurring chars use real names only** — Sara, Eva, Mama, Papa, Ginger, Joe. No Zhorik / Evochka / nicknames in dialogue.

### B. Composition rules
5. **≤3 bound subjects per clip** (Kling UI hard-limits the 4th tile via `--disabled` class).
6. **Solo or duo bound subjects render most reliably.** 3-bound shots have 30%+ duplicate-spawn rate. Prefer 1-2 bound per beat.
7. **Sister-shared shots have visual identity drift** — Sara renders as Eva-curl-style. Use **explicit `LEFT/RIGHT`** anchoring or split into solo clips.
8. **4+ on-screen people impossible.** For "all family at table," split into 2 alternating clips (Mama+Papa+Sara, then Mama+Papa+Eva).
9. **Bathroom + 2 kids = duplicates** (mirror reflections render as new instances). Either drop bathroom beat or specify "NO MIRROR" + use solo bathroom clips.

### C. Banned words (proven to cause bugs)
10. **No appearance descriptors** in prompts (`honey-gold curls`, `dimpled smile`, `pink pajamas` → spawn duplicate avatars).
11. **No voice descriptors** (`Voice: warm 4-year-old` → bound TTS profile handles it).
12. **No pronouns** (he/she/they/it/their/his/her) — re-use `@Tag` every time.
13. **No group nouns** (both, sisters, girls, everyone, all, them, kids, children).
14. **No entry verbs** for already-on-screen characters (`rushes in`, `enters`, `appears`, `skidding in`). Use pose-change verbs: `stops`, `freezes`, `turns`, `looks up`.
15. **No phantom-spawning verbs:** `race`, `chase`, `follow`, `catch up`, `hide-and-seek`, `party`, `compete`. Use solo verbs: `dash`, `sprint`, `hurry`, `rush`, `scramble`, `jog`.
16. **No "FIVE!" all-caps numbers + repeated** (attracts phantom counted objects).
17. **No "high-five" verb** (renders extra hands or characters).
18. **`"static"` is ignored** — use "locked camera" / "no camera move" instead.

### D. Required elements
19. **Every clip needs ≥1 explicit `@Name: "dialogue"` line** — Native Audio without dialogue generates gibberish in a random character's voice.
20. **Negative prompt loaded on every clip** with the anti-duplication guardrail PLUS scene-specific phantom names (`second sister`, `dog on counter`, `mirror reflection`, etc.).
21. **Master prompt MUST be empty** in Custom Multi-Shot mode. (Single-shot mode has only one prompt field — N/A.)

## ★ THE ONE PROMPT TEMPLATE THAT WORKS

```
[Shot type] at @Scene[, optional camera direction].
@CharacterA on the [LEFT/RIGHT/CENTER] [verb + object/dialogue]: "[dialogue]"
@CharacterB on the [LEFT/RIGHT/CENTER] [verb + object/dialogue]: "[dialogue]"
```

Concrete clean example (proven via clip_03b, clip_12b, clip_07c v3):
```
Two-shot at the @DiningRoom table. @Sara on the LEFT side smiling: "Five pancakes — we did it!" @Eva on the RIGHT side with arms up: "Yay! All five!"
```

## Anti-pattern → Fix cheat sheet

| ❌ Anti-pattern | ✅ Fix |
|---|---|
| `@Sara points. @Sara: "Two."` (2 mentions) | `@Sara pointing: "Two."` (folded) |
| `Both girls giggle` | `@Sara and @Eva grin at each other` |
| `she runs faster` | `@Eva runs faster` |
| `@Sara skidding in behind them` (after she's already on screen) | `@Sara stops next to @Eva` |
| `Sara: "Come on, Eva!"` | `Sara: "Come on!"` |
| `Pancake race!` | `Pancakes!` |
| `Voice: bright 4-year-old` | (delete entirely) |
| `Wide shot, static.` | `Wide shot, locked camera.` |
| `4 family members at table` | Split into 2 clips: 09a (Mama+Papa+Sara) + 09b (Mama+Papa+Eva) |
| `"FIVE pancakes!" "high-fives @Eva"` | `"Five pancakes — we did it!" "Yay!"` |
| `Two girls at bathroom sink` | Solo bathroom clips OR drop the beat |

## Production methodology (verified workflow)

1. **WRITE prompts first.** Lint each one against the anti-pattern table above before submitting.
2. **TEST one clip per beat first.** Render → audit frame-by-frame → fix prompt if broken → only THEN fire the other 2-3 clips in that beat.
3. **NEVER batch-fire untested patterns.** Burned 540 credits today on 4 broken renders we could've avoided with single-clip tests.
4. **Audit immediately after download.** Extract 3 frames per clip (t=0.5, 2.5, 4.5) and verify subject count + character identity. Don't trust file names.
5. **Drop visually-impossible beats** rather than re-render forever. (Bathroom with mirror + 2 sisters dropped after 3 attempts.)
6. **Adult character drift is cheap to identify** but expensive to fix — consider re-baking adult avatar PNGs with stronger features for next episode.
7. **Save buggy renders as `_v#_descriptionOfBug.mp4`** — useful for diffing what changed between attempts.

## Per-shot prompt skeleton (verified)

```
[Shot type] [camera direction], @Name [verb] [object/direction]. @Name: "dialogue."
```

Example clean clip:
```
"Medium tracking shot. @Eva runs across @Livingroom. @Ginger runs alongside, barking: \"Woof! Woof!\""
```

## Files

### Production scripts
- `scripts/submitOmniClip.mjs` — **CANONICAL** Omni submission (ep03+). Lints prompts (HARD-FAIL on banned phrases / repeated tags / missing negatives), hard-reloads /app/omni/new for clean state, robust dropdown handler with multi-opener candidates, prompt-verification guard before Generate, and library lookup with case variations + scroll fallback. The "All" library tab is forced (Characters/Scenes filters break newly-uploaded element visibility).
- `scripts/downloadOmniByPrompt.mjs` — **CANONICAL** download (ep06+). IndexedDB-driven, prompt-matched, deterministic numbered output. See "Download all finished renders" above.
- `scripts/assembleEpisode.mjs` — **CANONICAL** assembly. Prepends `intro_song.mp4 + intro_sara/eva/mama.mp4` from `--intro-dir`, concats numbered clips from `--clips-dir`, appends outro pair from `--outro-dir`. Skips missing-numbered files gracefully (e.g. credit-cap silent failures). Standard preprocessing: 0.15s scene-pop trim, 1280×720@30, AAC 44.1k stereo.
- `scripts/uploadEpisodeToSaraAndEva.mjs` — YouTube upload to the @SaraAndEva channel (Made-for-Kids forced ON, UNLISTED default). Supports `--tags-file` for per-episode tag overrides.
- `scripts/_updateYoutubeMetadata.mjs` — patch existing YouTube video's title/description/tags via API
- `scripts/submitSingleShotClip.mjs` — *legacy* (ep01–ep02 only); use `submitOmniClip.mjs` instead

### Diagnostic / one-off scripts (`_` prefix)
- `_export-cookies.mjs` — export Kling cookies for codegen
- `_screenshot.mjs` — diagnostic screenshot + DOM dump
- `_findGenerate.mjs` — DOM inspector to find Generate button when selectors break
- `_unzipAndStage.mjs` — extract + dedupe Kling ZIPs by job ID
- `_exchange-code.mjs` — OAuth code → token exchange (one-time per channel)

### YouTube/channel state
- `/Volumes/Samsung500/goreadling/credentials-saraandeva.json` — OAuth credentials for SaraAndEva channel
- `/Volumes/Samsung500/goreadling/token-saraandeva.json` — refresh-token cached, full `youtube` scope
- Upload command: `node uploadEpisodeToSaraAndEva.mjs <video.mp4> [--title "..."] [--description-file path] [--privacy unlisted|public|private]`

### Episode files
- `content/saraandeva/episodes/ep<NN>/episode.json` — episode arc + 5-beat structure + cast
- `content/saraandeva/episodes/ep<NN>/clip_<beat><microclip>.json` — per-clip spec
- `content/saraandeva/episodes/ep<NN>/YOUTUBE_METADATA.md` — title + description + tags + thumbnail concept
- `exports/saraandeva/season_01/episode_<NN>/clips/` — staged MP4s with arc names
- `exports/saraandeva/season_01/episode_<NN>/ep01_v<N>.mp4` — concat'd episode versions
- `exports/saraandeva/season_01/episode_<NN>/shorts/` — 1080×1920 vertical Shorts

## Credit math

| Item | Cost |
|---|---|
| 1 micro-clip (5s, ≤3 subjects, Audio ON, 720p) | 45 credits |
| 1 episode (22 micro-clips) | 990 credits |
| Re-render rate ~25% | +250 credits |
| Realistic per-episode budget | **~1,250 credits** |
| Monthly Platinum (25K credits) | **~20 episodes/month** sustainable |

## Generating bound-element assets via Gemini Nano Banana (Pixar-style props/scenes)

For new recurring props (Eva's bike, the goreadling iPad, a new room) we generate
Pixar-3D PNGs via Gemini's `gemini-3.1-flash-image-preview` model (a.k.a.
"Nano Banana") and then upload to Kling's Element Library by hand. The
generated PNGs match the existing show aesthetic (compare to
`backyard.png`, `bike_circle.png`, `dream_house.png`).

### Style suffix to bake into every prompt

```
Pixar / 3D-CG kids'-show aesthetic — high-quality product render,
soft volumetric studio lighting, gentle saturated colors, smooth
subsurface materials, slight cel-shading on edges, friendly cheerful
mood. Plain off-white seamless studio background, no people, no hands,
prop alone center-frame, soft drop shadow underneath. Square 1024x1024.
```

For SCENES (vs props), drop the "prop alone center-frame" + "studio
background" lines and instead describe the actual environment.

### Image-to-image (style-converting a real photo)

For backyard/house references where the *real* place matters (so the
family recognizes their world), pass the actual photo as `inlineData`
alongside the text prompt and tell Gemini to "reimagine the source
photograph as a Pixar 3D animated scene — preserve the recognizable
layout (X, Y, Z), enhance for cartoon use." Example pattern lives in
the ep06 backyard generation (3 variants generated, user picked v1).

### Recipe (3 variants is the sweet spot — pick the best, delete the rest)

1. Read API key from `/Volumes/Samsung500/goreadling/.env.local` —
   accepts `GEMINI_API_KEY` through `GEMINI_API_KEY_6`. **Strip
   surrounding quotes** when parsing — keys are stored as `="AIza..."`
   not bare. Auto-rotate keys on `INVALID_ARGUMENT` / `RESOURCE_EXHAUSTED`.
2. Save 3 variants as `<asset>_v1.png`, `<asset>_v2.png`, `<asset>_v3.png`
   under `assets/scenes/`.
3. Show all 3 to the user, let them pick. Rename winner to `<asset>.png`,
   delete losers.
4. User uploads the winner to Kling's Element Library and gives it a
   library name (often kebab-case like `eva-bike`, `backyard-kitchen`).
   That library name is the spec tag. **Library names are user-defined
   — verify before writing specs.**

### macOS TCC gotcha

Spawned bash subprocesses can't read files in `~/Desktop` /
`~/Documents` even when Claude's own Read tool can. If a user attaches
a screenshot for image-to-image input, it lands in `~/Desktop` and the
generation script will hit `ENOENT`. Tell the user to drag the file to
`/Volumes/...` (not TCC-protected), then read from there.

### Playwright install-time gotcha (DO NOT skip)

Playwright 1.57 has an assertion bug in
`node_modules/playwright-core/lib/server/chromium/crBrowser.js` line
~147 that crashes `chromium.connectOverCDP()` when it tries to attach
to Kling's service worker (which has no `browserContextId`). After
`npm install`, hot-patch by adding before the `assert(targetInfo.browserContextId, ...)`:

```js
if (!targetInfo.browserContextId) {
  // Skip context-less service workers (e.g. kling.ai sw) — playwright 1.57
  // assertion would otherwise crash connectOverCDP.
  session.detach().catch(() => {});
  return;
}
```

Without this, every Kling automation script crashes on startup with
"Error: targetInfo: ...service_worker..." — re-apply after every
`npm install`.

## Reusable assets across episodes (intro / outro / theme song)

To avoid re-rendering the same intro/outro every episode, certain clips are
generated ONCE and reused as MP4 files prepended/appended at assembly time.

```
season_01/
├── intro/
│   ├── intro_sara.mp4         # 5s wave   — character cameo
│   ├── intro_eva.mp4          # 5s spin   — character cameo
│   ├── intro_mama.mp4         # 6s smile  — character cameo
│   └── intro_song.mp4         # 15s theme song (TBD — see _shared/intro_song.json)
├── OUTRO/
│   ├── 17.mp4                 # 10s subscribe wave
│   └── 18.mp4                 # 10s subscribe button-point
└── episode_<NN>/clips/        # only the per-episode unique renders live here
```

The episode's `episode.json` should declare `reuse.intro` and `reuse.outro`
blocks pointing to those files. Saves ~315 credits (~$15) per episode vs
re-rendering every time, and gives the show a consistent recurring opener
and closer.

Reusable theme-song specs live in `content/episodes/_shared/`:
- `intro_song.json` — 15s sing-along Sara+Eva theme (135 credits)
- `intro_song_short.json` — 5s reprise hook for mid-episode insertion (45 credits)

## ★ Lessons from ep06 (2026-04-29)

These are baked into the current `submitOmniClip.mjs` and
`downloadOmniByPrompt.mjs`. Read before debugging future failures.

### Submission (Omni mode)

1. **Hard-reload `/app/omni/new` at the start of every submission.** Without
   this, Kling remembers the previous session's quality + duration settings.
   That sounds harmless until the dropdown automation tries to click a "5s"
   opener label that's no longer visible (current is "10s") and the dropdown
   never opens. After hard reload, defaults reset to 1080p + 5s, and the
   "5s" opener is reliably clickable.

2. **Multi-opener dropdown candidates.** When opening the duration/quality
   dropdown, try `["5s","10s","15s"]` for duration and `["1080p","720p","540p"]`
   for quality — whichever is currently displayed is the active opener.

3. **Force the "All" library tab.** When binding elements, click the All
   tab (DOM: `<div class="selected"><span>All</span><span class="total-number">N</span></div>`)
   so characters + scenes + props are visible together. Switching to the
   Scenes tab specifically filters out newly-uploaded elements (a
   freshly-uploaded `backyard-kitchen` may not show up in Scenes-only view
   even though it's in the library — bug observed during ep06).

4. **Library element lookup must support name variations.** Kling library
   element names are case-insensitive substring matched, but our spec tags
   may use kebab-case (`backyard-kitchen`) while the library shows display
   case (`Backyard-kitchen`). The script tries: lowercase, Title Case,
   space-separated, snake_case, UPPERCASE — falls through until match.

5. **Scroll fallback inside the library panel.** If the target tile is
   below the visible viewport, the script auto-scrolls inside the library
   list (mouse wheel + scrollIntoViewIfNeeded) up to 4 times before giving up.

6. **Prompt-verification guard before Generate.** After typing the prompt
   with @-autocomplete chips, read back the textbox content and verify:
   - Length ≥ 85% of expected
   - Last 50 chars of expected appear in actual (catches truncation)
   - Every quoted dialogue chunk appears verbatim
   If any check fails, ABORT before Generate. Catches dropped chips,
   autocomplete glitches, or paste failures that would otherwise spend
   credits on a broken render.

7. **Cost-mismatch HARD GUARD.** Before clicking Generate, read the credit
   cost shown on the button. If it doesn't match `expectedCredits` from the
   spec, abort. Most common cause: duration dropdown didn't switch (cost
   stuck at the previous setting's value).

8. **Each `@Tag` must appear EXACTLY ONCE in the prompt.** Repeated tags
   trigger Kling's clone bug (renders the character twice on screen). If
   you need a character to act AND speak, fold them into one sentence:
   `@Sara on the LEFT pointing with a fork: "Two. Three. Four."`

9. **Library element names are user-defined.** Don't assume `backyard`
   exists — it might be `backyard-front` (driveway side) or
   `backyard-kitchen` (kitchen side). Always check the actual library
   contents before writing specs.

10. **Kling cannot reliably render text or words.** Specifying exact
    text content in prompts (signs, labels, book pages, written notes)
    produces garbled/truncated output ~90% of the time. Workarounds:
    - Bake the text into a bound element PNG (Nano-Banana-generated
      with the text correct); the @bound-element renders that text
      consistently, vs Kling re-generating it imperfectly.
    - In the prompt, refer to the prop/sign WITHOUT quoting its text:
      `"Sara reads the plant marker"` ≠ `"the plant marker reads PETUNIAS"`.
    - For dialogue moments where a character reads text aloud, the
      AUDIO will be perfect but the visible text will be wrong — design
      the shot so the printed text isn't the focus of the frame.

10a. **TEXT-PROP MANDATE (post-ep07 rule):** Whenever a clip needs
    visible text (a sign, a label, a written note, a book cover, a
    list, a screen, anything with words), the text MUST be generated
    as a Nano Banana image FIRST, uploaded to the Kling library as a
    bound element, and referenced in the prompt as `@<element-name>`.
    NEVER quote the text in the prompt and let Kling render it. Established
    text-props in the library: `coupon-book` (ep07 Mother's Day), `papa-notepad`
    (ep07 vacuum-cleaner joke). Adding new text-props is a one-time
    prep step before submitting the clip — see "Generating bound-element
    assets via Gemini Nano Banana" section above.

11. **"The family" / "the kids" / "the parents" without binding spawns
    random strangers.** Kling improvises with generic stock characters
    when group nouns aren't tied to bound elements. If the family is
    in the shot, bind each member; if they're offscreen, don't mention
    them. The previous-clip context carries — you don't need to recap
    "she's mid-hug with the family" if the prior clip showed the hug.

### Download (canonical via IndexedDB)

10. **Clear `request_data_cache → task-feeds` before each download run.**
    Kling caches API responses by pageTime, and stale pages keep status=5
    (rendering) entries forever even after they finish. The clear forces a
    fresh API fetch on the next reload.

11. **Filter cached tasks by `output URL exists`, not `status === 99`.**
    Status propagation lags, output URL is the cleaner signal.

12. **Match clips by normalized longest-common-prefix.** Both spec prompts
    (with `@Tag` references) and cached prompts (with `Element1/2/3`
    references) get normalized to the same `X` placeholder. Compare the
    first 200 chars and pick highest-prefix-match. Greedy-assign best
    pairs first to avoid two specs claiming the same task.

13. **MIN_SCORE = 30.** Below that the match is too ambiguous (likely a
    coincidental partial-match against an unrelated task). Treat anything
    below 30 as "no match" → silent-failed.

14. **NEVER fall back to the asset-page UI.** `/app/user-assets/materials`
    shows clips in render-completion order, not submission order, which
    breaks the numbered-clip mapping. The IndexedDB-driven match is the
    only reliable method.

### Credit-cap silent failures

15. **Watch for "Submitted" log lines without queue confirmation.** When
    Kling runs out of credits mid-burst, the Generate click LOG-succeeds
    but no task actually queues. The submit script can't detect this
    locally — only the IndexedDB cache (after refresh) tells the truth.
    After every batch, verify task count in cache matches submission count.

## Current state (2026-04-29)

- ✅ Omni-mode submit pipeline proven across ep03–ep06 (~70 clips submitted)
- ✅ IndexedDB-driven download (ep06) — replaces asset-page UI flow
- ✅ Reusable intro (3 character cameos) + OUTRO (subscribe pair) — saves
  ~315 credits per episode
- ✅ Hard-reload + multi-opener dropdown + prompt-verify guards baked into
  `submitOmniClip.mjs`
- ✅ Library lookup robust against display-case variations + below-fold tiles
- 🔜 Theme song (`_shared/intro_song.json`) — spec ready, awaiting Kling
  credit refill to render
- 🔜 ep06 clip 15 (Eva pedals solo) — silent-failed at credit cap, awaiting
  refill
- 🔜 Frame-audit + final assembly + YouTube upload for ep06
