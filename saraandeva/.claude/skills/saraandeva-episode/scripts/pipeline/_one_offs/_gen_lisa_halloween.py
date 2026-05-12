#!/usr/bin/env python3
"""One-off: generate Lisa Halloween garden-fairy frontal via Nano Banana.

Uses the existing lisa_front.png as a layout reference to lock face+hair
identity; ep15_isabel_unicorn_preview.png + papa_werewolf as style anchors.
"""
import base64, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ENV_FILE = Path("/Volumes/Samsung500/goreadling-production/.env.local")
OUT = PROJECT_ROOT / "assets" / "scenes" / "group_ep15_lisa_garden_fairy_preview.png"
MODEL = "gemini-3-pro-image-preview"
API = "https://generativelanguage.googleapis.com/v1beta/models"

# Load env
for line in ENV_FILE.read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("'\""))

key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
if not key:
    print("missing GEMINI_API_KEY in .env.local", file=sys.stderr)
    sys.exit(1)


def load_inline(p: Path) -> dict:
    return {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(p.read_bytes()).decode()}}


prompt = (
    "Generate a SINGLE-CHARACTER Pixar-3D feature-render frontal of LISA "
    "in her ep15 HALLOWEEN GARDEN-FAIRY COSTUME. "
    "Lisa identity (preserve from layout reference): 6yo girl, copper-red hair "
    "in twin pigtails tied with green ribbons, sparkly green eyes, freckles "
    "across nose and cheeks, fair skin, friendly bright smile. "
    "Halloween COSTUME details (apply over identity): translucent pastel-green "
    "butterfly-shaped FAIRY WINGS attached to her back, a ring of small "
    "white-and-yellow daisy flowers worn as a HEADBAND on top of her head "
    "between the pigtails, soft mossy-green leafy fairy DRESS with petal-cut "
    "hem, holding a small wicker basket of candy in her left hand. "
    "Pose: standing facing camera, full body, friendly posture, looking up "
    "at viewer with a warm smile. "
    "Background: soft warm Halloween-night autumn street, slightly out of focus, "
    "faint pumpkin-orange porch glow in the distance, fall leaves on the "
    "ground around her feet, twilight purple-blue sky. "
    "MATCH the style anchors EXACTLY: same Pixar 3D feature-animation look, "
    "physically-based materials, warm storybook color grade, stylized "
    "cartoon-realism. "
    "Frame: 16:9 horizontal, single-character composition, character roughly "
    "centered occupying about 40% of frame height. "
    "CRITICAL: NO scary elements, NO horror, NO black, just SWEET friendly "
    "kid-show Halloween fairy costume. NO other characters in frame."
)

style_refs = [
    PROJECT_ROOT / "assets" / "scenes" / "group_ep15_isabel_unicorn_preview.png",
    PROJECT_ROOT / "assets" / "scenes" / "group_ep15_leo_dinosaur_preview.png",
]
layout_ref = PROJECT_ROOT / "assets" / "characters" / "lisa_front.png"

parts = []
for p in style_refs:
    if p.exists(): parts.append(load_inline(p))
parts.append({"text": "☝️ Style anchors — match these Pixar 3D Halloween-costume looks exactly."})
if layout_ref.exists():
    parts.append(load_inline(layout_ref))
parts.append({"text": "☝️ Lisa face + hair identity reference — preserve face/hair/freckles/eye color exactly."})
parts.append({"text": prompt})

body = {"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["IMAGE", "TEXT"], "temperature": 0.3}}
data = json.dumps(body).encode()

for attempt in range(3):
    print(f"attempt {attempt+1}/3...")
    url = f"{API}/{MODEL}:generateContent?key={key}"
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=240) as resp:
            rj = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read()[:400].decode(errors='replace')}")
        time.sleep(5)
        continue
    cand = (rj.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
    for p in cand:
        inline = p.get("inlineData") or p.get("inline_data")
        if inline and inline.get("mimeType", inline.get("mime_type", "")).startswith("image/"):
            OUT.write_bytes(base64.b64decode(inline["data"]))
            print(f"✓ saved {OUT.relative_to(PROJECT_ROOT)} ({OUT.stat().st_size // 1024} KB)")
            sys.exit(0)
    finish = (rj.get("candidates") or [{}])[0].get("finishReason", "?")
    print(f"  no image (finish={finish})")
    time.sleep(5)

print("failed")
sys.exit(2)
