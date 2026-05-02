#!/usr/bin/env python3
"""
One-off YouTube channel logo / profile picture generator (Nano Banana Pro).

Output: assets/branding/youtube_logo_v<N>_nano.png

YouTube displays the profile picture as a circle. Recommended source is
800x800; we render square and let YouTube crop. Important content must be
inside the inscribed circle, with breathing room from the edges.
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


PROMPT = """Create a YouTube CHANNEL LOGO / profile picture for a children's animated series called "Sara and Eva".

CRITICAL — THIS IS A CIRCULAR PROFILE PICTURE:
* Final canvas is a 1:1 SQUARE. YouTube displays it as a CIRCLE — anything in the corners of the square will be cropped off.
* All important content must sit inside the INSCRIBED CIRCLE, with comfortable breathing room from the circle edge (don't push faces or text right up against the rim).
* Tiny display sizes too — works at 48x48 in comments. Composition must read instantly at thumbnail size.

LAYOUT inside the circle:
* The two girls' faces side-by-side, half-body framing — Sara on the left, Eva on the right, leaning in close, both grinning warmly at camera.
* Sara: 5 years old, brown hair in two ponytails, freckles, yellow star headband, rainbow striped shirt. Match the reference.
* Eva: 3 years old, curly golden-brown hair, big brown eyes, pink t-shirt with a tiny rainbow. Match the reference.
* Background INSIDE the circle: bright cheerful sunny gradient (warm yellow into clear blue), soft puffy cloud, scattered colourful confetti / sparkle dots — same warm world as the channel banner.
* Outside the circle (the corners of the square): just a soft solid background colour or matching gradient — these pixels will be cropped, don't waste detail there.
* NO TEXT anywhere on the logo. No "Sara and Eva" lettering, no captions, no watermarks. The logo is faces only.

STYLE: Pixar Animation Studios signature CG style — production-render quality from films like Inside Out 2, Turning Red, Luca. Strongly stylized cartoon render, NOT photorealistic. Exaggerated cheerful colours, stylized simplified shapes, storybook-warm lighting, slightly chunky cartoon proportions, soft rounded edges. Colours pushed saturated, slight warmth on shadows. Faces should feel large, friendly, and inviting — premium kids-show channel art."""


def call_gemini(prompt: str, refs: list[Path], keys: list[str]) -> bytes:
    parts: list[dict] = []
    for p in refs:
        parts.append(load_inline(p))
    parts.append({"text": (
        f"☝️ The above {len(refs)} image(s) are LOCKED CHARACTER REFERENCES — "
        "the canonical look of Sara and Eva. Match their faces, hair, and "
        "outfits exactly. Do not invent new characters; use these.\n\n"
        + prompt
    )})

    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"],
            "temperature": 0.4,
            "imageConfig": {"aspectRatio": "1:1"},
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
        p = OUT_DIR / f"youtube_logo_v{n}_nano.png"
        if not p.exists():
            return p
        n += 1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", help="Explicit output path (defaults to next youtube_logo_v<N>_nano.png)")
    args = ap.parse_args()

    keys = get_api_keys()
    if not keys:
        raise SystemExit("No GEMINI_API_KEY in .env.local")

    refs = [
        CHARS_DIR / "sara_front.png",
        CHARS_DIR / "sara_3q.png",
        CHARS_DIR / "eva_sheet.png",
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
