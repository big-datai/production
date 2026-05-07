---
name: Music-clip audio swap — re-loop the original visual base, don't re-render
description: When a music-block clip needs a new song, RE-LOOP the original 10s base render (e.g. clips/C.mp4) under the new song instead of re-rendering visuals via Kling. Cost ≈ $0 (just ffmpeg). User feedback ep12 v2: my new Kling-rendered 17.5 visual was "fully off style" — the original C.mp4 visual was preferred. Re-looping with the new song fixed it for free.
type: lesson
severity: nice-to-know
appliedTo: every music-block fix where viz is fine but song needs swapping
originSessionId: b923ac34-5ab5-423b-b230-8d3dc1dc3937
---
# The pattern

Music-block file naming: clips/{N}.mp4 = 60s loop = original 10s base render `{LETTER}.mp4` looped 6× under a song.

If user wants a different song under the same visual:

```bash
node .claude/skills/saraandeva-episode/scripts/loopVideoWithSong.mjs \
  season_01/episode_NN/clips/C.mp4 \
  "assets/music/New Song.mp3" \
  season_01/episode_NN/clips/17.5.mp4 \
  --duration=60
```

Cost: zero. Time: ~15s. No Kling credits, no Nano Banana, no risk of new render worse than original.

If user wants a different VISUAL (not just song): re-render via Kling. Cost ~$0.60 + ~5min wall time + risk new visual lands in style mismatch (happened on ep12 17.5 — gen rendered Sara without ponytail despite anchor still locking it).

# Decision tree

- Visual OK, song wrong → re-loop with new song (free)
- Song OK, visual wrong → Nano Banana + Kling re-render (~$0.60)
- Both wrong → re-render + new song

# Source of original base renders

`.{LETTER}.mp4.original-{tag}` backups created before any re-loop. Or the raw `.mp4` is still in clips/ if the placement file is different (e.g. C.mp4 base + 17.5.mp4 looped from it both coexist).
