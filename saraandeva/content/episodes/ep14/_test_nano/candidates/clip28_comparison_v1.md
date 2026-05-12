# ep14 clip 28 — Workflow A/B comparison

**Subjects:** Sara, Eva, Mama, Papa  
**Scene:** ep14-anniversary-living-room  
**Duration:** 10s  
**Canonical prompt length:** 440 chars  
**New action prompt length:** 65 chars  

## A. Canonical workflow (text-to-video, current)

```
Whole family at the front door of cozy anniversary living room with twinkling fairy lights and heart-shaped balloons, surprise reveal moment. @Mama center frame just stepped through, hand COVERS mouth in surprise, eyes WIDEN happy. @Papa LEFT-CENTER. @Sara far LEFT. @Eva far RIGHT. All three with arms wide open in celebration. All smiling huge joyful surprise expressions. Whole household together (joyful): "SURPRISE! HAPPY ANNIVERSARY!"
```

## B. New workflow (start-frame + end-frame + short action)

### B1. START FRAME pose (278 chars)

```
Whole family at the front door of cozy anniversary living room with twinkling fairy lights and heart-shaped balloons, surprise reveal moment. Mama center frame just stepped through, hand COVERS mouth in surprise, eyes WIDEN happy. Papa LEFT-CENTER. Sara far LEFT. Eva far RIGHT.
```

### B2. END FRAME pose (278 chars)

```
Whole family at the front door of cozy anniversary living room with twinkling fairy lights and heart-shaped balloons, surprise reveal moment. Mama center frame just stepped through, hand COVERS mouth in surprise, eyes WIDEN happy. Papa LEFT-CENTER. Sara far LEFT. Eva far RIGHT.
```

### B3. ACTION PROMPT (65 chars)

```
Whole household together (joyful): "SURPRISE! HAPPY ANNIVERSARY!"
```

## How to test in Kling

1. Submit to Kling via UI or API in first/last-frame mode:
   - First frame: `clip28_start.png`
   - Last frame: `clip28_end.png`
   - Animation prompt: paste contents of `clip28_action.txt`
2. Render → compare against the canonical-pipeline mp4 already in `season_01/episode_14/clips/28.mp4`
3. Score on: identity preservation, motion fidelity, smoothness, cost
