---
name: Music-video loop blocks — cheap runtime + emotional peaks
description: Pattern for extending Sara & Eva episode length and hitting YouTube's 4+ min algorithmic threshold by looping a single 10s Kling render under a 30–60s Suno song, instead of rendering 3–6 normal clips for the same screen time.
type: feedback
originSessionId: <ep08-session>
---

When designing a Sara & Eva episode, plan **1–2 "music-video loop blocks"** at the emotional peaks of the story. Each block is:

- 1 Kling render at 10s, `nativeAudio: false` → 60 credits
- ffmpeg-looped 3–6× with 0.3s crossfades → 30–60s of screen time
- Full Suno song overlaid as the only audio track

**Why this matters:**
- Cost-per-second drops from ~9 cr/s (normal clip) to ~1–3 cr/s (loop block)
- Episode runtime can reach 5–6 min at lower credit cost than the old 4-min standard
- Emotional peaks (victory, montage, coaching, dance) work BETTER with music carrying meaning than with dialogue clips

**Visual prompt rules for the 10s render:**
- Pose returns to start at second 0 and second 10 (loopable)
- RHYTHMIC, danceable movement (spin → bop → pump → repeat)
- Solo character preferred (easier loop without continuity errors)
- Generic singing-along mouth movements — NEVER lip-sync to specific syllables (would mismatch the looped song)
- "designed to LOOP cleanly" should appear verbatim in the prompt

**ffmpeg recipe (6 iterations of 10s render → 58s output):**
```
ffmpeg -i 16.mp4 \
  -filter_complex "[0:v]split=6[v1][v2][v3][v4][v5][v6];\
                   [v1][v2]xfade=fade:duration=0.3:offset=9.7[ab];\
                   [ab][v3]xfade=fade:duration=0.3:offset=19.4[abc];\
                   [abc][v4]xfade=fade:duration=0.3:offset=29.1[abcd];\
                   [abcd][v5]xfade=fade:duration=0.3:offset=38.8[abcde];\
                   [abcde][v6]xfade=fade:duration=0.3:offset=48.5[v]" \
  -map "[v]" -an -c:v libx264 -crf 20 -y looped.mp4

ffmpeg -i looped.mp4 -i song.mp3 \
  -map 0:v -map 1:a -t 58 -c:v copy -c:a aac -shortest -y music_video.mp4
```

**Hard rules — don't break these:**
1. **Max 2 loop blocks per episode.** Three or more = repetition fatigue. Audience tunes out.
2. **Always crossfade** with `xfade=fade:duration=0.3` between loops. Hard cuts show the seam every 10s.
3. **Always `nativeAudio: false`** on the render. Saves 30 cr per block AND prevents Kling-rendered fake-music from clashing with Suno.
4. **Place at emotional peaks**, not as filler. The block should be the moment the audience remembers.
5. **Generate a dedicated short Suno song** for each block — don't try to wedge an existing song into a different scene. The lyrics should match the block's emotional context.
6. **Premium variant:** render TWO 10s clips (different camera angles or movements), alternate them ABABAB across 6 iterations. Costs 2× but eliminates the loop feel entirely.

**Originated:** ep08 ("Sara's Silver Tooth!") — Eva's solo brave-coin dance on the giant tooth chair, after the doctor presents her the BRAVE TOOTH coin. The 60s music-video block became the episode's emotional climax.
