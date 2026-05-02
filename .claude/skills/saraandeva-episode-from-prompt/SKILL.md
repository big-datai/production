---
name: saraandeva-episode-from-prompt
description: Generate a complete Sara & Eva episode spec (episode.json + N numbered clip JSONs + season metadata + new bound element list) from a one-paragraph story prompt. Auto-applies every hard-won rule from the post-ep07 Omni pipeline (memory: lesson_kling_omni_pipeline_fixes.md). Triggers on "new sara and eva episode about X", "ep08 about dentist", "create episode from prompt", "draft episode spec", "generate ep<NN>".
argument-hint: "<paragraph describing the episode>"
---

# Sara & Eva — Episode-From-Prompt Spec Generator

You are drafting the complete spec for a new Sara & Eva episode. You produce only the **JSON specs and metadata files** — asset generation, library upload, Kling submission, ffmpeg assembly, and YouTube upload are handled by separate downstream scripts (listed at the bottom).

## What "done" looks like

When this skill finishes, the following files exist on disk and pass the sanity check:

```
saraandeva/content/episodes/ep<NN>/
  episode.json                    # master arc — beats, cast, scenes, music, rules
  1.json … N.json                 # one per 10s omni clip (typical N = 17–22)

saraandeva/season_01/episode_<NN>/
  ep<NN>_description.txt          # full YouTube description with chapter timestamps
  ep<NN>_short_description.txt    # Shorts copy
  ep<NN>_tags.txt                 # YouTube tags
  ep<NN>_short_tags.txt           # Shorts tags
```

A "new bound elements" report is printed to chat listing any prop/scene PNGs that need generating before submission.

---

## Step 1 — Read the four context files (do this first, every time)

Always read these before drafting anything. They contain the locked rules and prior-episode patterns:

1. **`saraandeva/content/locationCatalog.yaml`** — every existing scene tag (e.g. `kitchen-morning`, `bathroom`, `dentist-waiting`). If the prompt needs a scene not in here, it's a NEW bound element — flag it.
2. **`saraandeva/content/episodes/ep07/episode.json`** + **one beat clip** (e.g. `ep07/8.json`) — copy the JSON shape exactly. ep07 is the canonical recent format.
3. **The user's auto-memory** `lesson_kling_omni_pipeline_fixes.md` — the 30 hard rules. **Re-read every time. Don't relax any rule.**
4. **The user's auto-memory** `lesson_check_data_layer_first.md` and `methodology_orthogonal_when_stuck.md` — only relevant when debugging, but worth a glance.

If a more recent episode than ep07 exists (`ep08`, `ep09`, …), use **the highest-numbered one** as the format reference, not ep07.

## Step 2 — Identify cast, scenes, and new bound elements from the prompt

Walk the prompt and produce three lists:

- **Cast**: which named characters are on-screen anywhere in the episode? Drawn from `{Sara, Eva, Mama, Papa, Ginger, Joe}`. Off-screen voices and one-clip cameos count.
- **Scenes**: every distinct location. For each, check `locationCatalog.yaml`. Scenes NOT in the catalog become **new bound elements** to flag.
- **Recurring props**: any object that (a) appears in 2+ clips, OR (b) carries readable text. Both → bind. Text-only single-shot props → bind anyway, because Kling renders text imperfectly even when bound (memory rule #17). Examples: a book the kids read, a calendar, a goodie bag, a coin, a gas mask.

Single-shot props with no readable text and no return appearance → describe in-prompt, don't bind.

## Step 2.5 — Scenario quality bar (the audience-retention rule)

Episodes are FOR KIDS but they live or die by adult-watchable moments. Bake these into the arc before drafting clips:

- **Hook within the first 10 seconds** — clip 1 must end with a question or visible promise that demands clip 2. Don't open with exposition; open with a beat that makes the viewer LEAN IN.
- **Curiosity gap on every beat boundary** — between beat N and beat N+1, something the viewer wants to know shouldn't be answered yet. ("Will the tray make it?" "What's that giant white thing?!" "Will the mask smell ok?") Every 10–20 seconds, re-up the curiosity. If a beat just delivers payoff with no new question, you've stalled.
- **Two-tier comedy** — physical/visual gag for kids (Eva flying out of the bunk, Papa cough-coughing the gas mask) + a wry sister-banter line that lands for the adult watching with them. Aim for **at least one laugh-out-loud beat per minute**. Bluey is the bar.
- **Emotional pivot in act 2** — every episode needs a moment where the kid character almost loses (Eva tripping, Sara about to cry, the gas-mask doubt). Without the pivot, the resolution carries no weight.
- **Cliffhanger every act, not just the end** — beat ends should resolve THIS thing while exposing the NEXT thing. e.g. "tray flies — Eva crying" resolves into "Sara's eyes light up: I have a PLAN!" — a pivot that's also a cliffhanger.
- **Final-beat tag must SET UP the next episode.** Always. The last 10s should make the kid want next week's video. ep07 → "Father's Day?!"  ep08 → "I'm starting to brush NOW."  This is the strongest retention lever the show has.

If the drafted arc has 3+ beats in a row that feel "and then…" instead of "and so…/but…", rewrite. Story flows on `but` and `therefore`, never `and`. (South Park rule.)

Comedy density target: **one funny line every 20–25 seconds**. Track this. If you've written 4 clips of pure setup with no laugh, insert a comedic beat (a sister bicker, a Papa one-liner, a Ginger reaction shot).

## Step 2.6 — Plan music-video loop blocks (cost + runtime multiplier)

**Pattern:** A 10s Kling render + a 30–60s Suno song = 30–60s of music-video screen time at ~1/6th the per-second credit cost of normal clips. Use this to extend episode length cheaply and to land emotional peaks with music doing the heavy lifting.

**Plan 1–2 blocks per episode**, placed at emotional peaks:
- Educational coaching montage (e.g. brushing-teeth song, learning-to-read song)
- Victory / reward beat (e.g. earning a coin, winning a game)
- Sister bonding montage
- Travel / cruise sequences

**Block spec template** (drop into the right slot in the arc):
```json
{
  "title": "MUSIC VIDEO — <character> solo: <song name>",
  "mode": "omni",
  "durationSec": 10,
  "quality": "720p",
  "nativeAudio": false,
  "expectedCredits": 60,
  "renderTarget": "10s loop, expanded via ffmpeg xfade to 30-60s",
  "musicVideoBlock": true,
  "loopExpansion": { "iterations": 6, "xfadeDuration": 0.3, "outputDurationSec": 58 },
  "audioOverlay": { "file": "assets/music/<song>.mp3", "startAt": 0, "duration": 58, "muteRender": true }
}
```

**Visual prompt rules for loop blocks:**
- "RHYTHMIC and LOOPABLE — clean <move-A> → <move-B> → <move-C> → return"
- "designed to LOOP cleanly: <character> returns to roughly the same pose at second 0 and second 10"
- "generic happy singing-along mouth movements, no specific dialogue, no lip-sync to specific syllables"
- Solo shot — easier to loop without continuity errors than multi-character

**Episode runtime targets with this pattern:**
| Format | Body clips | Runtime | Credits |
|---|---|---|---|
| Old standard | 19 × 10s normal | ~4:00 | 1,710 cr |
| **+1 music-video block** | 17 normal + 1 loop (60s) | **~5:00** | **1,590 cr** |
| **+2 music-video blocks** | 15 normal + 2 loops (60s each) | **~6:00** | **1,470 cr** |

**Don't overuse.** Max 2 loop blocks per episode — repetition kills the technique. Always crossfade between iterations (`xfade=fade:duration=0.3`) to hide the seam.

## Step 3 — Draft the arc

A 4:00 episode is **~31s reused intro + 19 × 10s body clips + ~20s reused outro = ~4:01**. For a 3:30 episode use 17 body clips. For 3:00, 14 clips.

Structure the body into **8–11 beats**, with 1–3 clips per beat. Mirror the ep07 shape:

| Beat slot | Function |
|---|---|
| 1 | HOOK — establishes today's premise in 10–20s |
| 2 | SETUP / ANTICIPATION |
| 3 | (often a 🎵 Suno-music beat — song or jingle) |
| 4 | TRAVEL / TRANSITION |
| 5 | DISCOVERY / NEW PLACE |
| 6–8 | CORE conflict + comedy beat + emotional beat |
| 9 | REWARD / RESOLUTION |
| 10 | (often a second 🎵 Suno beat — victory song, drive-home cruise) |
| 11 | CLIFFHANGER + tag |

Every beat has a clear emotional pivot. Bluey-style: disaster → emotional crisis → kid pivot → tear-up moment → tag.

## Step 4 — Write `episode.json`

Use the ep07 shape exactly. Required keys:

```json
{
  "episode": NN,
  "title": "...",
  "logline": "1–3 sentence story...",
  "formulaReference": "...",
  "mode": "omni",
  "durationTotal": "~4:01",
  "expectedCreditsTotal": <17–22> * 90,
  "newBoundElements": [
    { "tag": "<kebab>", "source": "library", "asset": "assets/scenes/<file>.png", "purpose": "..." }
  ],
  "scenes": ["<kebab>", ...],
  "cast": ["Sara", "Eva", ...],
  "reuse": {
    "intro": { "source": "season_01/intro/", "clips": ["intro_song.mp4"], "totalDuration": "~31s" },
    "outro": { "source": "season_01/OUTRO/", "clips": ["17.mp4", "18.mp4", "0_song.mp4"], "totalDuration": "~20s",
               "note": "0_song.mp4 sorts last via parseInt-Infinity hack — keep (memory rule #23)" }
  },
  "music": {
    "policy": "ALL music is Suno — Kling renders dialogue + ambient ONLY. No 'music sting' / 'tender swell' / 'cheerful music' phrases inside any clip prompt (memory rule #24).",
    "tracks": [
      { "file": "season_01/episode_<NN>/audio/<name>.mp3", "lengthSec": <N>, "usedOver": [<clip-numbers>], "mood": "..." }
    ],
    "mixRecipe": "[1:a]atrim=start=X:duration=N,asetpts=PTS-STARTPTS,volume=0.30[bg]; [0:a]volume=1.4[fg]; [fg][bg]amix=inputs=2:duration=first:dropout_transition=0[a]"
  },
  "arc": [
    { "beat": 1, "name": "HOOK — ...", "purpose": "...", "clips": [1, 2] },
    ...
  ],
  "rules": {
    "maxBoundPerClip": 7,
    "maxTagMentionsPerCharacter": 1,
    "klingPromptMustNotContain": [
      "music sting", "music swell", "tender swell", "cheerful music",
      "comedic music", "playful music", "heartfelt music",
      "music cue", "score swell", "background music"
    ],
    "klingPromptMustNotContainReason": "All music is Suno-mixed in assemble. Memory rule #24.",
    "negativePromptRequired": "duplicate character, twin, clone, two of the same, mirrored figure, second father, second mother, two Papa, two Mama, identical adults, extra people, third child, second sister, second sara, second eva, two eva, duplicate eva, mirror reflection",
    "englishTextAnchor": "When the prompt has visible text, append: 'English text only, large clear printed Roman alphabet, NO foreign characters' and add 'Cyrillic, Chinese characters, Korean, Japanese, Arabic, garbled letters, misspelled, scrambled letters' to negative.",
    "characterNamesInDialogue": "Drop the bound character's name from other characters' dialogue."
  }
}
```

## Step 5 — Write each numbered clip JSON

One per clip, named `1.json` … `N.json`. Use the exact ep07 shape:

```json
{
  "episode": NN,
  "beat": <int>,
  "clip": <int>,
  "title": "...",
  "mode": "omni",
  "durationSec": 10,
  "quality": "720p",
  "nativeAudio": true,
  "expectedCredits": 90,
  "subjects": ["Sara", ...],
  "scene": "<kebab>",
  "boundElements": [
    { "tag": "<Capitalized for chars, kebab for scenes/props>", "source": "library" },
    ...
  ],
  "prompt": "<see rules below>",
  "negativePrompt": "<baseline + clip-specific>"
}
```

### Hard rules baked into every prompt — VERIFY each one before saving

These come from memory `lesson_kling_omni_pipeline_fixes.md`. The submit script HARD-FAILS on rule violations.

1. **Each `@Tag` appears EXACTLY ONCE** across the whole prompt (memory rule #8 — clone bug).
   - Use `@Sara` on first mention only. Subsequent mentions: bare `Sara` (no `@`).
   - Same for scene tags and prop tags.
2. **Every `boundElements` entry MUST be `@`-mentioned exactly once** in the prompt.
3. **`maxBoundPerClip ≤ 7`**.
4. **No bound character's name inside another character's dialogue line.**
   - `Sara: "Come on — pancakes!"` ✓
   - `Sara: "Come on, Eva — pancakes!"` ✗ (spawns a second Eva)
5. **No group nouns** in action description (`everyone`, `the family`, `both girls`, `the kids`, `the sisters`). They spawn strangers.
6. **No "music sting" / "music swell" / "tender swell" / "cheerful music" phrases.** Music is Suno-mixed in assemble. Kling clip prompts contain ONLY dialogue + ambient (footsteps, door, instrument whirr, car ambience).
7. **English text anchor + Cyrillic-etc. negative** if any visible printed text appears in the shot.
8. **Every clip needs ≥1 explicit `Name: "dialogue"` line**, otherwise Native Audio renders gibberish.
9. **Prompt skeleton:** `[Shot type] in @Scene[, optional camera/light]. @Character on the LEFT/RIGHT/CENTER [verb + object]. Character (delivery cue): "dialogue." …`
10. **Negative prompt baseline** — concatenate clip-specific extras after this:
    ```
    duplicate character, twin, clone, two of the same, mirrored figure, second father, second mother, two Papa, two Mama, identical adults, extra people, third child, second sister, second sara, second eva, two eva, duplicate eva, mirror reflection
    ```
    Solo shots: also add `family members, strangers, crowd, group of people, other faces, background people, friends, neighbors`.
    Dentist/medical: also add `full dentist body, dentist face, multiple dentists, second dentist, second nurse, multiple gloved hands`.

## Step 6 — Sanity-check before saving

Run this Python check on the drafted clip JSONs (mirrors what's in ep08's QA):

```python
import json, re, sys
from pathlib import Path
EP = Path("saraandeva/content/episodes/ep<NN>")
MUSIC_BAD = re.compile(r"\b(music sting|music swell|tender swell|cheerful music|comedic music|playful music|heartfelt music|music cue|score swell|background music)\b", re.I)
GROUP_NOUNS = re.compile(r"\b(everyone|the family|the kids|both girls|both sisters|the sisters|the children)\b", re.I)
TAG_RE = re.compile(r"@([A-Za-z][A-Za-z0-9-]*)")
errors = []
for f in sorted(EP.glob("[0-9]*.json"), key=lambda p: int(p.stem)):
    s = json.loads(f.read_text()); p = s["prompt"]; b = [e["tag"] for e in s["boundElements"]]
    if len(b) > 7: errors.append(f"{f.name}: bound {len(b)}>7")
    counts = {}
    for t in TAG_RE.findall(p): counts[t] = counts.get(t,0)+1
    for t,c in counts.items():
        if c>1: errors.append(f"{f.name}: @{t}×{c}")
    for tag in b:
        if tag not in counts: errors.append(f"{f.name}: bound {tag} missing @ in prompt")
    if MUSIC_BAD.search(p): errors.append(f"{f.name}: music phrase")
    if GROUP_NOUNS.search(p): errors.append(f"{f.name}: group noun")
    chars = {x for x in b if x[:1].isupper()}
    for sp,line in re.findall(r"(@?\w+)[^\"]*?:\s*\"([^\"]+)\"", p):
        sp = sp.lstrip("@")
        if sp in chars:
            for o in chars - {sp}:
                if re.search(rf"\b{o}\b", line): errors.append(f"{f.name}: {sp} says {o} in dialogue")
    if s.get("durationSec")!=10 or s.get("quality")!="720p" or s.get("mode")!="omni" or not s.get("nativeAudio") or s.get("expectedCredits")!=90:
        errors.append(f"{f.name}: pipeline-param drift")
print(f"errors: {len(errors)}")
for e in errors: print(" ✗", e)
sys.exit(1 if errors else 0)
```

If errors > 0, fix the prompts and re-check. **Don't hand off to the user with errors.**

## Step 7 — Write `season_01/episode_<NN>/` metadata

Mirror ep07's structure. The description file gets chapter timestamps starting at 0:31 (after the 31s intro), every 10s thereafter:

```
0:00 Theme song! 🎵
0:31 <clip 1 title>
0:41 <clip 2 title>
…
3:31 <clip N title>
3:41 Subscribe so you don't miss new videos
3:51 See you next time!
```

Plus `Skills sneaking in this episode:` block listing 2–4 educational beats. Plus 8–12 hashtags.

## Step 8 — Hand-off report

When everything is on disk and the sanity check passes, print a single chat block:

```
✅ ep<NN> spec ready — N clips, ~credits cr, runtime ~M:SS

NEW bound elements to generate via Nano Banana (paste these to user):
  • <tag>   ← assets/scenes/<file>.png        (refs: <photo or "invented">)
  ...

Suno tracks needed:
  • <name>.mp3  (~Ns, used over clips X-Y) — "<mood>"

NEXT COMMANDS (run in order):
  1. python3 saraandeva/content/generateScenes.py --scene <new-scene-id>     # for each new scene
  2. python3 saraandeva/content/generateProps.py --prop <new-prop-id>        # for each new prop
  3. # Pick best variants in assets/scenes/, copy <id>_v1.png → <id>.png
  4. # Per clip — uploads any new bound element this clip needs:
     for n in $(seq 1 N); do
       node /Volumes/Samsung500/goreadling/content/saraandeva/uploadEp08Elements.mjs \\
         /Volumes/Samsung500/goreadling-production/saraandeva/content/episodes/ep<NN>/$n.json
       node /Volumes/Samsung500/goreadling/.claude/skills/saraandeva-episode/scripts/submitOmniClip.mjs \\
         /Volumes/Samsung500/goreadling-production/saraandeva/content/episodes/ep<NN>/$n.json
     done
  5. # After all renders complete:
  6. node .claude/skills/saraandeva-episode/scripts/downloadAllClips.mjs ...
  7. # ffmpeg-mix Suno tracks per memory rule #25
  8. node .claude/skills/saraandeva-episode/scripts/assembleEpisode.mjs ep<NN>
  9. node .claude/skills/saraandeva-episode/scripts/uploadEpisodeToSaraAndEva.mjs <mp4>
```

## What this skill does NOT do

- **It doesn't run Nano Banana.** Use `generateScenes.py` / `generateProps.py` after.
- **It doesn't upload to Kling.** Use `uploadEp<NN>Elements.mjs` (or extend it for the new ep) per clip.
- **It doesn't submit clips.** Use `submitOmniClip.mjs` per clip.
- **It doesn't assemble or upload to YouTube.** Use `assembleEpisode.mjs` + `uploadEpisodeToSaraAndEva.mjs`.

These are deliberately separate steps so each one can be re-run / inspected / corrected without redoing the whole pipeline.

## Episode-numbering rule

Pick the next free number: `ls saraandeva/content/episodes/` → `ep01, ep02, … ep07, ep08` → next is `ep09`.

If the user names the episode (e.g. "ep10 about beach day"), use that number even if it leaves gaps.
