---
name: Episode thumbnail recipe — frame + Pillow text overlay
description: Don't render thumbnails via Nano Banana per episode. Extract a frame from a body clip showing both anchors in the episode setting, then add a Pillow text overlay with Impact font, yellow #FFD60A fill, black stroke, soft drop shadow.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
**Recipe (proven on ep08, 30 seconds end-to-end):**

1. Pick a body clip with both Sara and Eva visible in the episode setting (clips 5 + 6 reliably work for "establishing-shot" scenes).
2. `ffmpeg -ss 4 -i clips/5.mp4 -frames:v 1 -q:v 2 thumb.jpg` — t=4s usually captures a good steady frame.
3. Overlay the episode tagline via Pillow:
   - Font: `/System/Library/Fonts/Supplemental/Impact.ttf` at 130pt
   - Fill: `#FFD60A` (yellow), stroke 8px black, gaussian-blurred drop shadow (offset 8px, blur 6px, alpha 220)
   - Position: `y=30` (top), centered horizontally
   - Text: SHORT episode hook in CAPS — `DENTIST DAY!`, `BIKE LESSON!`, `BEACH RESCUE!` etc.

**Pillow snippet (drop into a `scripts/generateEpisodeThumbnail.py` for ep09+):**
```python
from PIL import Image, ImageDraw, ImageFont, ImageFilter
img = Image.open(src).convert("RGBA")
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Impact.ttf", 130)
draw = ImageDraw.Draw(img)
bbox = draw.textbbox((0, 0), text, font=font, stroke_width=8)
x = (img.width - (bbox[2] - bbox[0])) // 2 - bbox[0]
y = 30 - bbox[1]
shadow = Image.new("RGBA", img.size, (0,0,0,0))
ImageDraw.Draw(shadow).text((x+6, y+6), text, font=font, fill=(0,0,0,220), stroke_width=8, stroke_fill=(0,0,0,220))
shadow = shadow.filter(ImageFilter.GaussianBlur(6))
img = Image.alpha_composite(img, shadow)
ImageDraw.Draw(img).text((x, y), text, font=font, fill=(255, 214, 10), stroke_width=8, stroke_fill=(0, 0, 0))
img.convert("RGB").save(out, "JPEG", quality=92)
```

**Why:** at 3 eps/day × 90 days, Nano-Banana-rendered thumbnails would cost time AND quota (per project memory: 270-episode sprint). This recipe is free and consistent across episodes — the brand looks unified.

**How to apply:** every episode gets `<season>/episode_<NN>/ep<NN>_thumbnail.jpg`. The text uses the episode's central hook, all caps, with `!`. Same yellow + black stroke + shadow. For shorts, reuse the same thumbnail file (YouTube crops it for the Shorts feed but it appears intact on the watch page).

**Upload integration:** `uploadEpisodeToSaraAndEva.mjs` now accepts `--thumbnail <path>` and calls `youtube.thumbnails.set` after `videos.insert`. Both main video and short use the same thumbnail.
