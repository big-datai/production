# ep14 clip 5 — Workflow A/B comparison

**Subjects:** young_Papa  
**Scene:** ep14-cafe-mams-country  
**Duration:** 10s  
**Canonical prompt length:** 470 chars  
**New action prompt length:** 70 chars  

## A. Canonical workflow (text-to-video, current)

```
@young_Papa walking toward camera down the cobblestone street, brown leather backpack on his shoulders, small DSLR camera in his right hand at hip. Autumn maple leaves drifting from above. Charming European cafe storefronts framing both sides, warm afternoon light. @young_Papa's HEAD TURNS slightly to look at a cafe sign, mouth SMILES. He pauses. @young_Papa's right HAND REACHES for the brass door handle of the cafe, the warm interior light glows through the window.
```

## B. New workflow (start-frame + end-frame + short action)

### B1. START FRAME pose (146 chars)

```
young_Papa walking toward camera down the cobblestone street, brown leather backpack on his shoulders, small DSLR camera in his right hand at hip.
```

### B2. END FRAME pose (120 chars)

```
young_Papa's right HAND REACHES for the brass door handle of the cafe, the warm interior light glows through the window.
```

### B3. ACTION PROMPT (70 chars)

```
young_Papa's HEAD TURNS slightly to look at a cafe sign, mouth SMILES.
```

## How to test in Kling

1. Submit to Kling via UI or API in first/last-frame mode:
   - First frame: `clip5_start.png`
   - Last frame: `clip5_end.png`
   - Animation prompt: paste contents of `clip5_action.txt`
2. Render → compare against the canonical-pipeline mp4 already in `season_01/episode_14/clips/5.mp4`
3. Score on: identity preservation, motion fidelity, smoothness, cost
