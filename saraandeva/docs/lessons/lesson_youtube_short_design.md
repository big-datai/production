---
name: YouTube Shorts vertical layout — designed bg, no blurred bars
description: For ep08 shorts, blurred-bg letterboxing of 16:9 footage looked unprofessional. Use a designed pastel-gradient background with persistent title at top + channel handle at bottom + 1080×1280 video region (1.78× zoom from 720p source) centered.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
**Bad pattern (what we threw away in ep08):** scale 16:9 source to 1080 wide → put on blurred-bg-of-itself filling 1080×1920. The 32% video region with 68% blurred bars looked low-effort and screenshot-bait-y, not like a kids-show short.

**Good pattern (the one we shipped):**
- Background: solid pastel teal→sky-blue vertical gradient (RGB(178,229,232) → RGB(255,247,230)). Generated once via Pillow, used as a static `-loop 1` ffmpeg input.
- Title block at top (y=60–290): `DENTIST DAY!` in Impact 130pt yellow `#FFD60A` with black stroke 10px and Gaussian-blurred drop shadow. Subtitle in Impact 55pt white with navy stroke (`🦷  BRAVE-TOOTH DANCE  🦷`).
- Video region: scale source to height 1280 (1.78× from 720p) → center-crop to 1080×1280 → overlay at y=320. Action takes ~67% of frame height. The 1.78× zoom is enough to fill, but not so aggressive that faces get cropped off (3× zoom did clip Eva's head off in an earlier attempt).
- Bottom block (y=1700–1860): `@SaraAndEva` in Impact 60pt yellow with black stroke.

**ffmpeg recipe:**
```
ffmpeg -y -loop 1 -i bg.png -i dance_video.mp4 \
  -filter_complex "[1:v]scale=-1:1280:flags=lanczos,crop=1080:1280[fg];[0:v][fg]overlay=0:320,format=yuv420p[v]" \
  -map "[v]" -map 1:a \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart -shortest \
  out.mp4
```

**Why:** burned ~30 min iterating short v1 (blurred bars, user rejected) → v2 (3× crop, Eva's face cut off) → v3 (designed bg, video too small) → v4 (this — shipped).

**How to apply:** every Sara & Eva short uses this template. Don't deviate to blurred bars unless the user specifically asks. The Pillow bg generator code is in the ep08 production transcript — keep a copy in `scripts/` next time as `generateShortBackground.py` so the recipe is reusable across episodes.
