---
name: ALWAYS open assembled mp4 + risky clips in QuickTime BEFORE upload — score=200 doesn't mean clean
description: I shipped ep12 + ep13_v3 to YouTube on 2026-05-06 without opening either video to eyeball, then the user caught two real defects: (1) ep13 5.5.mp4 (Three Little Pigs music block) had ghost-cloned 2-Eva renders; (2) Papa stands passively in many clips that prompted active play (knock door, blow as wolf, chase in tag) — Kling didn't translate the action verbs to motion. The downloader matches by prompt-text similarity (score=200), NOT visual quality — so it can pick ghost/clone/wrong-take renders happily. Memory `lesson_manual_user_override_ghost_prone.md` already said to surface a "manual eyeball CTA" — I ignored it. Hard rule going forward.
type: feedback
severity: hard-rule
appliedTo: produceEpisode + every assemble-then-publish path
originSessionId: b923ac34-5ab5-423b-b230-8d3dc1dc3937
---
# Hard rule: eyeball BEFORE every YouTube upload

## What went wrong (2026-05-06)

Pipeline: download (score=200 prompt match) → loopVideoWithSong → assembleEpisode → produceEpisode --start-from 4 → uploadEpisodeToSaraAndEva. Zero visual review anywhere in the chain.

Defects shipped:
1. **ep13 5.5.mp4 had 2-Eva clone** in the Three Little Pigs music block. The base A.mp4 had a ghost twin and was looped 9× → propagated across the entire 60s music block.
2. **Papa stands passively in many clips** that prompted active play: knocking on the tower-house door as wolf, blowing it down, chasing kids in tag. Kling rendered him standing while the kids moved. This affects multiple episodes, not just 12/13.

User feedback: "no quality control?"

## The rule

**Before ANY produceEpisode phase ≥ 4 (thumbnail/short/upload), open the assembled mp4 in QuickTime and scrub through it.** Watch ALL of these:
- Every music-video block (60-90s loops amplify any defect 6-9×)
- Every 4+ character clip (memory: ghost rate 25%+ with BACKGROUND chars)
- Every clip that names Papa as the active subject (verify Papa actually does the action)
- Every clip with "morphing"-prone setups (preserve silhouette, hands holding props, anatomy locks)

If ANY clip looks bad, abort the upload. Either:
- Pull an alternate take from Kling library (search IndexedDB BEFORE running downloadOmniByPrompt, since it clears the cache)
- Re-submit the clip with a tightened prompt (especially Papa-active-with-girls scenes — see `lesson_papa_play_scene_per_episode.md`)
- Drop the bad clip and re-render

## Papa-passive failure mode (specific subset)

When the prompt says "@Papa knocks on the door / blows the house down / tags @Sara", Kling often:
- Renders Papa standing still while the action happens around him
- Or renders only the kids moving while Papa is a frozen anchor
- Or shows Papa with arms at side instead of mid-action

Mitigations to apply at prompt-write time:
- Use motion-locked verb phrases: "Papa raises his fist mid-knock", "Papa tilts his head back mid-blow with cheeks puffed", "Papa lunges forward arm extended toward Sara mid-tag"
- Anchor Papa's HANDS specifically: "Papa's right hand makes contact with the door panel, knuckles bent"
- Add EXACTLY-state: "Papa's mouth is open mid-puff", "Papa's stride caught mid-step"
- Negative prompt: "Papa standing still, Papa frozen, Papa motionless, Papa observing without acting"

## Workflow patch (going forward)

In `produceEpisode.mjs`, between PHASE 3 (assemble) and PHASE 4 (thumbnail), add a manual-review gate:

```bash
echo "🚦 MANUAL EYEBALL — opening ep${epPad}_v${ver}.mp4. Approve in next prompt or abort."
open season_01/episode_${epPad}/ep${epPad}_v${ver}.mp4
read -p "Looks good? (y/N): " ok
[ "$ok" = "y" ] || exit 1
```

Skip with `--skip-eyeball` only when it's a known-good re-cut of an already-reviewed video.

## Action items currently pending (post-feedback)

- [x] Both YouTube uploads (sX0b-ft0NQM, TqwA3u9CTOQ) flipped to PRIVATE
- [ ] Find clean A-clip alternative for ep13 (Kling library scroll OR re-submit)
- [ ] Identify Papa-passive clips across ep12 + ep13 (need user mark-up or re-watch)
- [ ] Re-render flagged clips with motion-locked verb prompts
- [ ] Re-assemble + re-publish (with eyeball gate this time)

## Sources

- `lesson_manual_user_override_ghost_prone.md` — already said this; I didn't apply it
- `lesson_papa_play_scene_per_episode.md` — Papa-active is top-3 retention driver
- `lesson_kling_motion_verbs_duplicate.md` — wrong verb phrasing duplicates chars
- `lesson_kling_continuity_locks.md` — anti-morph negatives + intensity tone-down
