# ep14 clip B — Workflow A/B comparison

**Subjects:** Sara, Eva, Mama, Papa, Joe, Ginger  
**Scene:** ep14-anniversary-living-room  
**Duration:** 10s  
**Canonical prompt length:** 537 chars  
**New action prompt length:** 44 chars  

## A. Canonical workflow (text-to-video, current)

```
Slow-dancing on a cozy living-room rug. @Mama and @Papa center holding each other, gently SWAYING side-to-side. @Sara holding her free hand at left, @Eva holding his free hand at right. All four softly SWAY in one connected dance. @Joe and @Ginger sit at parents' feet watching contentedly. Twinkling fairy lights all around, golden lamp glow. Slow circular camera move around the group. NO LIP-SYNC required. Static formation, slow continuous gentle sway only. Only soft music — NO voices, NO speech. Suno song will be overlaid in post.
```

## B. New workflow (start-frame + end-frame + short action)

### B1. START FRAME pose (199 chars)

```
Mama and Papa center holding each other, gently SWAYING side-to-side. Sara holding her free hand at left, Eva holding his free hand at right. Joe and Ginger sit at parents' feet watching contentedly.
```

### B2. END FRAME pose (199 chars)

```
Mama and Papa center holding each other, gently SWAYING side-to-side. Sara holding her free hand at left, Eva holding his free hand at right. Joe and Ginger sit at parents' feet watching contentedly.
```

### B3. ACTION PROMPT (44 chars)

```
All four softly SWAY in one connected dance.
```

## How to test in Kling

1. Submit to Kling via UI or API in first/last-frame mode:
   - First frame: `clipB_start.png`
   - Last frame: `clipB_end.png`
   - Animation prompt: paste contents of `clipB_action.txt`
2. Render → compare against the canonical-pipeline mp4 already in `season_01/episode_14/clips/B.mp4`
3. Score on: identity preservation, motion fidelity, smoothness, cost
