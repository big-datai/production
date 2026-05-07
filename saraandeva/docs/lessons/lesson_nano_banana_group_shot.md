---
name: Nano Banana group-shot pre-render for 4+ char clips
description: For any clip with 4+ bound chars, generate the still composition in Nano Banana FIRST, verify count, then use as Kling image-to-video reference. Eliminates ghost-character renders.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
**Trigger** ep10 clip 11 (4-char family selfie): both Kling renders (original + retry with stricter prompt) produced a 5th phantom child. Nano Banana generated all 3 candidate stills with EXACTLY 4 people on the first attempt.

**Why Nano Banana wins for char-count anchoring:**
- Still-image model — generates 1 frame, not 240 (no temporal drift)
- Multi-image conditioning is much stronger: pass the actual character avatar PNGs as references
- ~$0.01/image and ~30s — cheap to iterate (3-5 candidates, pick the cleanest)
- Quadrant-based positional anchoring works reliably ("Papa LOWER-RIGHT QUADRANT")

**Workflow for any 4+ char clip:**
1. `python3 content/generateGroupShot.py <output_id> --chars mama,papa,sara,eva --pose "<composition>" --scene <scene_id> --n 3`
2. Visually pick the cleanest candidate (right count, right poses)
3. Use that PNG as Kling Omni's image-to-video reference (upload as a `source: "upload"` bound element OR as the scene image)
4. Kling animates FROM the locked still — preserves the count

**Script:** `saraandeva/content/generateGroupShot.py` (added 2026-05-03 post-ep10)

**Required prompt incantations the script bakes in:**
- "EXACTLY {n} PEOPLE — no fifth person, no extra child, no duplicate adult, no phantom figure anywhere"
- "Count again: {n} ({chars_str})"
- "{n} faces total. {n} bodies total. Count them before finalizing."
- Quadrant positioning: "Papa LOWER-RIGHT QUADRANT, Mama LOWER-LEFT QUADRANT, Sara UPPER-LEFT QUADRANT, Eva UPPER-RIGHT QUADRANT"

**How to apply:**
- Anytime a clip spec has 4+ entries in `subjects[]` or 4+ char tags in `boundElements[]`, run generateGroupShot first.
- Save output to `assets/scenes/group_<output_id>.png` so it's library-bindable.
- The clip JSON should reference the group still as a `source: "upload"` boundElement OR add it to the Kling library and bind by name.
- For the actual ep10 clip 11 fix: `python3 content/generateGroupShot.py ep10_clip11_selfie --chars mama,papa,sara,eva --pose "extreme tight selfie close-up..." --scene magic_forest_sandy --n 3` — produced 3 clean 4-person stills (v1, v2, v3) at `assets/scenes/group_ep10_clip11_selfie_v*.png`.

**Cost comparison for a 4-char clip:**
- Pure Kling video, 25%+ ghost rate at 4 chars → ~2.5 retries average → 225 cr ($1.30)
- Nano Banana 3 candidates + 1 Kling video → ~$0.03 + 90 cr ≈ $0.55 + zero ghost risk
- 2x cheaper AND more reliable.
