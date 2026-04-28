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

### 3. Download all finished renders

```bash
node .claude/skills/saraandeva-episode/scripts/downloadClip.mjs \
  season_01/episode_01/clips 8
```

Kling caps batch download at 8 clips per ZIP. Re-run the script in rounds (each round picks the visible top 8) until every needed clip is on disk. Use `ditto -x -k <zip> <dest>` (NOT `unzip` — chokes on CJK filenames in Kling ZIPs).

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
- `scripts/submitSingleShotClip.mjs` — single-shot Kling submission with anti-pattern lint (HARD-FAIL on bad prompts)
- `scripts/downloadClip.mjs` — download from `/app/user-assets/materials` (top 8 visible per round)
- `scripts/uploadEpisodeToSaraAndEva.mjs` — YouTube upload to the @SaraAndEva channel (Made-for-Kids forced ON, UNLISTED default)
- `scripts/_updateYoutubeMetadata.mjs` — patch existing YouTube video's title/description/tags via API

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
- `season_01/episode_<NN>/clips/` — staged MP4s with arc names
- `season_01/episode_<NN>/ep01_v<N>.mp4` — concat'd episode versions
- `season_01/episode_<NN>/shorts/` — 1080×1920 vertical Shorts

## Credit math

| Item | Cost |
|---|---|
| 1 micro-clip (5s, ≤3 subjects, Audio ON, 720p) | 45 credits |
| 1 episode (22 micro-clips) | 990 credits |
| Re-render rate ~25% | +250 credits |
| Realistic per-episode budget | **~1,250 credits** |
| Monthly Platinum (25K credits) | **~20 episodes/month** sustainable |

## Current state (2026-04-26)

- ✅ Single-shot micro-clip workflow proven on 6 clips (beats 2–3)
- ✅ Search-by-name bind dialog automation (no tile-index fragility)
- ✅ Anti-pattern prompt linter inline in submit script
- ⚠️ Negative prompt UI textarea may not be exposed in single-shot mode — best-effort injection
- 🔜 Beats 4–8 (clips 04a → 08c) ready to submit
- 🔜 `downloadClip.mjs` reliability — final 2 selectors still flaky
- 🔜 ffmpeg concat in arc order (currently manual)
