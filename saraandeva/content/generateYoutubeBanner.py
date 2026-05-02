#!/usr/bin/env python3
"""
One-off YouTube channel banner generator (Nano Banana Pro).

Output: assets/branding/youtube_banner_v<N>.png

Designed for YouTube's 2560x1440 banner with the 1546x423 mobile/desktop
safe area dead-centre. Title + faces must live inside that strip;
decorative content extends out to the full 2560x1440 for TV view.
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / ".env.local"
SARAANDEVA_DIR = ROOT / "saraandeva"
CHARS_DIR = SARAANDEVA_DIR / "assets" / "characters"
OUT_DIR = SARAANDEVA_DIR / "assets" / "branding"
OUT_DIR.mkdir(parents=True, exist_ok=True)

MODEL = "gemini-3-pro-image-preview"
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
MAX_ATTEMPTS = 5
RATE_LIMIT_WAIT = 30


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def get_api_keys() -> list[str]:
    load_env(ENV_FILE)
    keys = []
    for name in (
        "GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
        "GEMINI_API_KEY_4", "GEMINI_API_KEY_5", "GEMINI_API_KEY_6",
    ):
        v = os.environ.get(name)
        if v:
            keys.append(v.replace('"', "").strip())
    return keys


def load_inline(path: Path) -> dict:
    raw = path.read_bytes()
    ext = path.suffix.lower()
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(ext, "image/jpeg")
    return {"inlineData": {"mimeType": mime, "data": base64.b64encode(raw).decode("ascii")}}


PROMPT = """Create a YouTube CHANNEL BANNER artwork for a children's animated series called "Sara and Eva".

CRITICAL — THIS IS A YOUTUBE BANNER, NOT A NORMAL FRAME:
* Final canvas is 16:9 (2560x1440), but YouTube only displays the CENTRAL HORIZONTAL STRIP on phones and most desktops — roughly the middle 60% width × middle 30% height of the canvas.
* All key content (the title text, both girls' faces, both dogs) MUST live inside that central horizontal strip — do not place anything important near the top, bottom, or far left/right edges.
* The areas above, below, and far-left/far-right of the central strip should contain only decorative background elements (sky gradient, soft clouds, sparkles, grass, blurred bokeh) — pretty if you see them on a TV, harmless if cropped on a phone.

LAYOUT (left to right inside the central strip):
* Far-left of strip: a friendly Jack Russell terrier dog (white with brown/tan patches, matching the reference) sitting and smiling.
* Left-of-centre: Sara — a 5-year-old girl with brown hair in two ponytails, freckles, yellow star headband, rainbow striped shirt, denim shorts. Standing, smiling at camera.
* Centred above the girls' heads: a big chunky cartoon TITLE that reads exactly "Sara and Eva" — bold, friendly, bubbly kids-show font, bright white fill with a navy outline, slight drop shadow. BELOW the title in smaller friendly font: "real sisters · real puppies · real adventures".
* Right-of-centre: Eva — a 3-year-old girl with curly golden-brown hair, big brown eyes, pink t-shirt with a tiny rainbow, blue jeans. Standing next to Sara, holding her hand, grinning.
* Far-right of strip: a small fluffy pomeranian puppy (creamy orange fur, matching the reference) sitting and smiling.

STYLE: Pixar Animation Studios signature CG style — production-render quality from films like Inside Out 2, Turning Red, Luca. Strongly stylized cartoon render, NOT photorealistic. Exaggerated cheerful colours, stylized simplified shapes, storybook-warm lighting, slightly chunky cartoon proportions, soft rounded edges. Colours pushed saturated, slight warmth on shadows, magical atmosphere.

BACKGROUND: bright cheerful sky gradient (soft sunny yellow on the left transitioning to clear blue on the right), a couple of soft puffy clouds, scattered colourful confetti / sparkle dots floating in the air, a low strip of cartoon green grass at the bottom of the central strip. Background extends seamlessly out to the full 2560x1440 canvas — same sky/clouds/grass continuing to the edges, with NO important content there.

Spell the title exactly "Sara and Eva" (capital S, capital E). No other text on the image. No watermarks, no logos."""


def call_gemini(prompt: str, refs: list[Path], keys: list[str]) -> bytes:
    parts: list[dict] = []
    for p in refs:
        parts.append(load_inline(p))
    parts.append({"text": (
        f"☝️ The above {len(refs)} image(s) are LOCKED CHARACTER REFERENCES — "
        "the canonical look of Sara, Eva, Joe (the Jack Russell), and "
        "Ginger (the pomeranian). Match their faces, hair, outfits, and "
        "proportions exactly. Do not invent new characters; use these.\n\n"
        + prompt
    )})

    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"],
            "temperature": 0.4,
            "imageConfig": {"aspectRatio": "16:9"},
        },
    }
    data = json.dumps(body).encode("utf-8")

    for attempt in range(MAX_ATTEMPTS):
        key = keys[attempt % len(keys)]
        url = f"{API_BASE}/{MODEL}:generateContent?key={key}"
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}, method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=240) as resp:
                rj = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")[:300]
            if e.code == 429:
                print(f"  ⏳ Rate limited, waiting {RATE_LIMIT_WAIT}s...")
                time.sleep(RATE_LIMIT_WAIT)
                continue
            print(f"  ⚠️  HTTP {e.code}: {err[:200]}", file=sys.stderr)
            time.sleep(3)
            continue
        except Exception as e:
            print(f"  ⚠️  {type(e).__name__}: {e}", file=sys.stderr)
            time.sleep(3)
            continue

        cand_parts = (rj.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
        for p in cand_parts:
            inline = p.get("inlineData") or p.get("inline_data")
            if inline and inline.get("mimeType", inline.get("mime_type", "")).startswith("image/"):
                return base64.b64decode(inline["data"])
        finish = (rj.get("candidates") or [{}])[0].get("finishReason", "unknown")
        text = next((p.get("text") for p in cand_parts if p.get("text")), None)
        print(f"  ⚠️  no image (finish={finish}{', text: ' + text[:120] if text else ''})")
        time.sleep(3)

    raise SystemExit("All retry attempts failed")


def next_version_path() -> Path:
    n = 1
    while True:
        p = OUT_DIR / f"youtube_banner_v{n}_nano.png"
        if not p.exists():
            return p
        n += 1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", help="Explicit output path (defaults to next youtube_banner_v<N>_nano.png)")
    args = ap.parse_args()

    keys = get_api_keys()
    if not keys:
        raise SystemExit("No GEMINI_API_KEY in .env.local")

    refs = [
        CHARS_DIR / "sara_front.png",
        CHARS_DIR / "sara_3q.png",
        CHARS_DIR / "eva_sheet.png",
        CHARS_DIR / "joe_front.png",
        CHARS_DIR / "ginger_front.png",
    ]
    missing = [r for r in refs if not r.exists()]
    refs = [r for r in refs if r.exists()]
    print(f"📸 refs: {[r.name for r in refs]}" + (f"  (missing: {[m.name for m in missing]})" if missing else ""))

    out = Path(args.out) if args.out else next_version_path()
    print(f"🖼️  generating → {out.name}")
    t0 = time.time()
    data = call_gemini(PROMPT, refs, keys)
    out.write_bytes(data)
    print(f"  ✅ {out.name}  ({len(data)/1024:.1f} KB, {time.time()-t0:.1f}s)")


if __name__ == "__main__":
    main()
