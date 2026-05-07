---
name: ep11 retrospective — eight permanent rules + tooling changes
description: Full ep11 (Joe Burger Heist) retrospective. v1→v6 cost 2,385 cr ($13.83) vs 1,875 cr target. Eight permanent rules locked in to keep ep12+ inside budget. Reference for any "what did we learn from ep11?" question.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
ep11 was the first run of the new `/produce-episode` orchestrator. Took 6 versions and **2,385 cr ($13.83)** — about $1.07 over the 2,200 cr abort threshold. v6 = https://youtu.be/N2CIcYQ3akY (keeper). The overage paid for **eight permanent rules** that should keep ep12+ inside budget.

## Cost ledger — where the overage came from

| Source | Credits | Why |
|---|---|---|
| Original 18-clip submission | 1,710 | Baseline |
| Clip 14 re-submits ×3 | 270 | (1) stuck/silent-fail, (2) prompt rewrite calmer, (3) FUNNY rewrite for laughing-together |
| Clip 15 re-submit | 135 | Blood-from-mouth render + ghost-Eva from motion-toward verbs |
| Clip 4.5 re-submits ×2 | 270 | Silent credit-cap fail + retry; user later picked their own download |
| **Overage** | **675 cr ($3.91)** | All recoverable in ep12+ if rules below stick |

## Root causes

1. **Prompts that read fine in text rendered as horror in video.** "Vivid SQUIRT of bright red ketchup … in a perfect red splash" rendered as Papa bleeding from the mouth. "Thundering apoplectic shout … leaves visibly tremble" rendered as horror-villain Papa with Joe launched mid-air.
2. **The matcher (downloadOmniByPrompt) picks by prompt-text similarity, NOT visual quality.** Score-200 perfect-match can still pick ghost-extras / blood-splatter / wrong-take.
3. **Decimal clip slots `4.5.json` weren't supported by `submitEpisode.mjs`.** The regex rejected decimal filenames.
4. **`--start-from > 3` upload-path bug in `produceEpisode.mjs`** — computed `nextVersion` for a non-existent assembled mp4.
5. **Concurrent Chrome conflicts.** Two scripts driving port 9222 simultaneously kill each other.
6. **Auto-submit picked correct random task; visual quality came from manual user override.** User manually downloading good takes was the most reliable quality signal.

## Eight permanent rules locked in (memory files)

| # | Rule | Memory file | Status |
|---|---|---|---|
| 1 | Fourth-wall audience-engagement beats — every ep needs 2-4 direct-to-camera "ask the kid" beats; final cliffhanger MUST be a camera-ask | `lesson_fourth_wall_audience_engagement.md` | ✅ Now lint-warned |
| 2 | Single-version assets — generate one `<id>.png`, never `_v1/_v2/_v3.png` | `feedback_single_version_props.md` | ✅ Default in catalogs |
| 3 | Auto-open Suno + lyric files at song-handoff | `feedback_auto_open_suno.md` | ✅ Baked into SKILL |
| 4 | No red liquid near a face — Kling renders as blood | `lesson_no_red_splatter_kids_show.md` | ✅ Lint-blocked in submitOmniClip + validateClipCasting |
| 5 | Comedy intensity dial — calm sigh / 4 paws on ground | `lesson_kids_show_comedy_intensity.md` | ✅ Lint-blocked in both |
| 6 | Papa-plays-with-girls every episode at 15s/135cr (hard requirement) | `lesson_papa_play_scene_per_episode.md` | ✅ Strengthened post-ep11 |
| 7 | Decimal clip support + stale-consolidated-json gotcha | `lesson_submitepisode_letter_clips.md` | ✅ Decimal regex + auto-reconsolidate when dir mtime newer |
| 8 | Manual user-override workflow for ghost-prone clips | `lesson_manual_user_override_ghost_prone.md` | ✅ Memory rule landed; orchestrator CTA pending |

## Tooling changes that landed during ep11 + post-ep11

- **`validateClipCasting.mjs`**: rage-word lint, red-splatter trap, motion-toward-verb variants for `running`, fourth-wall camera-ask episode-level check
- **`submitEpisode.mjs`**: decimal-clip regex, auto-reconsolidate-when-dir-newer, validateClipCasting as Phase 0 hard precondition
- **`submitOmniClip.mjs`**: 45+ new FORBIDDEN_PROMPT_PHRASES (horror intensity, pet airborne, red splatter), louder warning for missing required-negative terms
- **`validateEpisode.mjs`**: pre-upload Google Ads policy compliance check (consecutive emojis, repeated punct, ALL CAPS gimmicks, parens, bullets, tag length)
- **`produceEpisode.mjs`**: `--start-from > 3` uses latest existing mp4 instead of computing fresh nextVersion
- **`generateProps.py`**: docstring no longer suggests `--variants 3`
- **`saraandeva-episode-from-prompt/SKILL.md`**: Step 2.55 (camera-asks), Step 5g (intensity), Step 5h (red splatter), Step 7a (Google Ads compliance)
- **`produce-episode/SKILL.md`**: 4th-wall section, strengthened Papa-plays, auto-open Suno, single-version PNG default

## What to do differently for ep12+

1. **Eyeball the spec for red+face/apron and rage+kid combos before validate runs.** Lint catches them now but the eyeball is faster.
2. **For 4+ char clips, do Nano Banana group-shot pre-render BEFORE Kling submit.** Memory rule 5d.
3. **After re-submitting any clip, run a post-download visual audit** with `ffmpeg -ss <mid> -frames:v 1 -y /tmp/frame_<N>.jpg` before assemble.
4. **Sequence Chrome-driving scripts strictly serially.** Never two `submitEpisode`/`downloadOmniByPrompt` in parallel — they share port 9222 and kill each other.
5. **Default to user-manual-download for ghost-prone clips** when score < 100 OR clip is 4+ char OR clip is a re-submission. Surface CTA in chat (memory rule 8).
6. **Stop relying on "submitted" log line as proof of queuing** — silent credit-cap fail (memory rule #10) silently drops clips. After every batch, run a quick `downloadOmniByPrompt --dry-run` or count IndexedDB tasks.
7. **Final ep12 cost target: < 2,000 cr** (1,875 cr ideal). If drifting up, a rule was missed.

## Verification for ep12+

1. `/produce-episode "<prompt>"` Phase A drafts spec
2. `validateClipCasting --episode=<NN>` exits 0 (no red-near-face, no horror-intensity, no airborne, 2+ camera-asks)
3. Phase D submit accepts decimal clips (e.g. `4.5.json`)
4. Phase E re-submission triggers visual audit
5. `validateEpisode --episode=<NN>` Google Ads compliance passes (no emoji-consecutive, no gimmicky CAPS, no parens > 15 chars)

## Hashed link reference

ep11 v6 keeper: https://youtu.be/N2CIcYQ3akY
