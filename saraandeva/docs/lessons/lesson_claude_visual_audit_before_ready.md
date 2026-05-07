---
name: Claude must visually audit assembled video frames before declaring "ready"
description: User feedback 2026-05-07 after the ep12+ep13 ghost-Eva and Papa-passive defects shipped: "add audit step where you compare final video you watch it and find all the bugs first before you tell me it is ready". Hard rule. Claude has Read-tool access to PNG/JPG; extract frames from each clip via ffmpeg, view them, compare against the clip's prompt spec, list every defect found. Never say "ready" / "done" / "looks good" without this evidence trail.
type: feedback
severity: hard-rule
appliedTo: every produceEpisode run, every re-render, every "is this good?" answer
originSessionId: b923ac34-5ab5-423b-b230-8d3dc1dc3937
---
# Hard rule: Claude visually audits before "ready"

## What changed

Two failures in two days (ep13 ghost-Eva 5.5, ep12 Papa-passive across many clips, ep12 clip 17.5 motion-mismatched-with-music) all shared the same root cause: I declared the episode ready WITHOUT looking at the rendered frames. Score=200 prompt-match downloads + clean ffmpeg assembly is not evidence of quality. The user's eyeball-gate (open in QuickTime) was added to memory but it asked them to do all the QC. They want ME to find the bugs first.

## The procedure (UPDATED 2026-05-07 — Gemini Flash beats contact sheets)

For every assembled episode and every re-rendered clip, before saying "ready":

**Preferred: Gemini 2.5 Flash full-video audit**

```bash
node .claude/skills/saraandeva-episode/scripts/auditClipsWithGemini.mjs \
  season_01/episode_NN/clips \
  --out /tmp/epNN_audit_report.json \
  --concurrency 3
```

Cost: ~$0.002/clip (~$0.05/episode for 21 clips). Time: ~2 min. The script uploads each mp4 to Gemini Files API, calls `gemini-2.5-flash:generateContent` with a structured QA prompt, parses the response into per-clip findings (description / animals / human count / actions / defects / overall verdict). Defects flagged: ghost-clones, anatomy errors, character-passive, wrong-extra-character, prop-missing, scene-mismatch, horror-tone, visual-clone, fox/animal renders.

Gemini Flash beats my contact-sheet hand-audit by a wide margin — on ep12 the contact-sheet read flagged 1.5 D and 17.5 C as critical defects, but Gemini watching the actual videos correctly identified them as CLEAN. Trust the video audit, not 4 stills.

**Legacy fallback: 4-frame contact sheets** (use only if Gemini API is down or you want to also eyeball quickly)

1. Extract via ffmpeg + Read tool. Useful for spot checks but unreliable for 60s music loops (random 4 frames miss most of the action).
2. Always cross-check contact-sheet findings with the user — Sara/Eva visual collision and arm-stretch glitches are sub-second issues that don't show up in contact sheets.
3. **For each clip, compare the visual against the spec** (`content/episodes/ep<NN>/<clip>.json`). Check:
   - Character count matches `subjects` (no ghost twins / extra kids / wrong adults)
   - Named characters are visible (Papa is actually in the frame for Papa-active beats)
   - Action verbs are visibly happening (knock = fist near door, push = hands on swing, jump = mid-air)
   - Anatomy locks hold (2 arms, 2 hands per character; no third arm / floating hand)
   - Scene matches (`scene` field == visible setting)
   - No tone defects (no horror lighting, no real-blood, no scary face for kid show)
   - Static-Papa flag: if Papa is named-but-stationary across all 4 sample frames → flag as Papa-passive failure
4. **Write a per-clip findings table**: clip number / visible characters / action vs spec / defects list.
5. **Compile a top-line summary**: how many clips have defects, how many need re-render, recommended fix per defect.
6. **Only then** can I say "ready" — and only when every defect is either (a) fixed, (b) accepted by user, or (c) explicitly out-of-scope.

## What "ready" requires

A "ready" claim must be backed by:
- A timestamped audit report in this conversation
- Per-clip findings (visible characters + actions checked against spec)
- A specific list of defects = empty (or all explicitly accepted)
- The user's prior approval of any defects we're shipping anyway

Never declare ready based on: ffprobe output alone, "downloads completed successfully", "assembleEpisode finished without errors", or "score=200 prompt match". Those are pipeline-success signals, not quality signals.

## Cost / latency

ffmpeg frame extraction is ~1s per clip. Reading 1 contact sheet per clip takes one Read call. For a 22-clip episode: ~22 Read calls + 22 ffmpeg invocations. Total wall time ~1–2 minutes. Negligible compared to a $14 wasted upload.

## Sources

- `lesson_always_eyeball_before_publish.md` — establishes the user-side eyeball gate (kept; this rule adds the Claude-side audit BEFORE handing off to the user)
- `lesson_manual_user_override_ghost_prone.md` — said to flag risky clips; this rule operationalizes that with frame-level evidence
