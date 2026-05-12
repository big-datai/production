#!/usr/bin/env python3
"""One-off: generate 8 ep14 scene PNGs via Nano Banana Pro.
Sequential to avoid burning rate limits.
"""
import base64, json, os, subprocess, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ENV_FILE = Path("/Volumes/Samsung500/goreadling-production/.env.local")
MODEL = "gemini-3-pro-image-preview"
API = "https://generativelanguage.googleapis.com/v1beta/models"

# Style anchors — Pixar 3D look from existing ep15 scene PNGs
STYLE_REFS = [
    PROJECT_ROOT / "assets" / "scenes" / "ep15_house4_isabel_cottage.png",
    PROJECT_ROOT / "assets" / "scenes" / "ep15_house2_pirate_ship.png",
]

SCENES = {
    "ep14_cafe_mams_country.png": (
        "Charming European cobblestone-street cafe — wide cinematic establishing shot. "
        "Warm wood interior visible through large window, hanging brass pendants over small marble tables, "
        "chalkboard menu, vintage posters on walls. Cobblestone street outside with autumn maple leaves "
        "drifting down, cafe's wooden front door painted soft sage-green, hand-painted sign 'CAFE' in "
        "elegant cursive above door. Soft golden afternoon light. NO PEOPLE in scene. "
        "Pixar 3D feature-render quality, photorealistic materials but stylized."
    ),
    "ep14_german_autumn_road.png": (
        "South German countryside autumn road — wide cinematic shot. Cobblestone-paved village road "
        "winding through autumn vineyards (red and gold leaves), lined with old stone walls and tall "
        "cypress trees. A romantic Bavarian-style fairytale castle visible on a soft hilltop in middle "
        "background, mist around its towers. Soft amber-gold afternoon light. NO PEOPLE, NO CARS. "
        "Romantische Strasse vibe. Pixar 3D quality, warm storybook color grade."
    ),
    "ep14_rome_colosseum.png": (
        "Roman Colosseum on a sunny afternoon — wide cinematic shot. The Colosseum's iconic stone arches "
        "fill center-frame, soft blue sky above, cypress trees framing left edge. Cobblestone piazza in "
        "foreground with a small white gelato cart blurred in soft focus to the right (no vendor visible). "
        "Soft warm Mediterranean light. NO PEOPLE, NO TOURISTS. Pixar 3D feature-render quality."
    ),
    "ep14_bulgaria_ski_slope.png": (
        "Snowy beginner ski slope in Bulgarian Pirin Mountains (Bansko-area vibe) — wide cinematic shot. "
        "Gentle slope of pristine white snow stretching down center-frame, dense pine trees flanking both "
        "sides with soft snow on branches, pastel-blue clear winter sky, faint gondola cables visible in "
        "soft background sky. NO PEOPLE on slope. Soft cool morning sunlight. Pixar 3D quality, "
        "kid-friendly winter atmosphere — NOT cold-feeling, just inviting."
    ),
    "ep14_disney_paris_castle.png": (
        "Disneyland Paris Sleeping Beauty Castle at golden-hour — wide cinematic establishing shot. "
        "The pink-and-blue iconic castle center-frame, sky filled with soft fireworks bursts in pink, "
        "purple, and gold pastels. Twinkling park lights below in soft focus. Romantic dreamy palette. "
        "NO PEOPLE visible. Soft glowing magical-hour atmosphere — Pixar 3D quality, fairytale feel. "
        "Mom's lifelong dream destination — emotional resonance."
    ),
    "ep14_wedding_chapel.png": (
        "Small intimate stone chapel interior at altar — wide cinematic shot. Soft afternoon light "
        "filtering through stained-glass windows on left and right, delicate white peony floral "
        "arrangement on wooden altar with green ivy trailing, a few warm candles burning in tall "
        "wrought-iron candelabras flanking the altar, oak pews barely visible in foreground edges. "
        "NO PEOPLE in scene PNG. Romantic but kid-friendly, warm honey-toned light. Pixar 3D quality."
    ),
    "ep14_hospital_birth_room.png": (
        "Warm pastel hospital recovery room — wide cinematic shot. Soft cream-yellow walls, large window "
        "with afternoon light streaming in, light blue blanket folded on the foot of an empty hospital "
        "bed, a small bouquet of pink balloons floating tied to the bedrail. Wooden side table with a "
        "vase of fresh white daisies + small framed sonogram picture. Soft pastel teddy bear on a chair. "
        "NO PEOPLE, NO CLINICAL EQUIPMENT VISIBLE — designed to feel like a cozy family welcome room "
        "more than a hospital. Pixar 3D quality, warm and tender atmosphere."
    ),
    "ep14_anniversary_living_room.png": (
        "Cozy modern living room dressed for anniversary celebration — wide cinematic establishing shot. "
        "String of golden twinkling fairy lights along the wooden mantel above a small electric fireplace, "
        "heart-shaped helium balloon arrangement in soft pastels (cream, dusty-rose, sage) above the couch, "
        "framed family photo collage on the wall (visible: small hints of family photos). Warm orange "
        "floor-lamp glow on the right, beige sectional couch with autumn-orange knitted throw blanket "
        "over the armrest, low wooden coffee table with two mugs of hot chocolate (steam visible) and a "
        "small ribbon-wrapped white gift box with a yellow satin bow. Soft golden-hour evening light. "
        "NO PEOPLE in scene PNG. Pixar 3D quality, cozy intimate family atmosphere."
    ),
}

def load_inline(p):
    return {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(p.read_bytes()).decode()}}

def main():
    # Load env
    for line in ENV_FILE.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))
    keys = []
    for nm in ("GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
               "GEMINI_API_KEY_4", "GEMINI_API_KEY_5", "GEMINI_API_KEY_6"):
        v = os.environ.get(nm)
        if v: keys.append(v.replace('"','').strip())
    if not keys:
        print("!! no GEMINI_API_KEY*", file=sys.stderr); sys.exit(2)

    out_dir = PROJECT_ROOT / "assets" / "scenes"
    out_dir.mkdir(exist_ok=True)

    style_parts = []
    for p in STYLE_REFS:
        if p.is_file(): style_parts.append(load_inline(p))
    style_parts.append({"text": (
        f"☝️ {len(STYLE_REFS)} LOCKED STYLE ANCHORS — Pixar 3D feature-render quality from "
        "the 'Sara and Eva' kids series. Match these exactly: 3D CG, physically-based materials, "
        "warm storybook color grade, stylized cartoon-realism. NEVER 2D anime, flat cel-shading, "
        "Studio Ghibli look."
    )})

    for fname, prompt in SCENES.items():
        out = out_dir / fname
        if out.is_file():
            print(f"⏭️  {fname} exists (skipping)")
            continue
        parts = list(style_parts) + [{"text": (
            f"Generate a Pixar-3D feature-render scene PNG. {prompt}\n\n"
            f"Format: 16:9 horizontal, 1376×768 or similar. Wide cinematic establishing shot. "
            f"Empty scene — NO characters, NO people, NO pedestrians."
        )}]
        body = {
            "contents": [{"parts": parts}],
            "generationConfig": {"responseModalities": ["IMAGE", "TEXT"], "temperature": 0.3},
        }
        data = json.dumps(body).encode()

        last_err = None
        for attempt, key in enumerate(keys[:3], 1):
            print(f"  [{attempt}/3] {fname} via Nano Banana...")
            try:
                req = Request(f"{API}/{MODEL}:generateContent?key={key}",
                              data=data, headers={"Content-Type":"application/json"}, method="POST")
                with urlopen(req, timeout=240) as r:
                    rj = json.loads(r.read())
                cand = (rj.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
                saved = False
                for p in cand:
                    inline = p.get("inlineData") or p.get("inline_data")
                    if inline and (inline.get("mimeType") or inline.get("mime_type","")).startswith("image/"):
                        out.write_bytes(base64.b64decode(inline["data"]))
                        print(f"    ✓ saved {out.relative_to(PROJECT_ROOT)} ({out.stat().st_size//1024} KB)")
                        saved = True
                        break
                if saved: break
                finish = (rj.get("candidates") or [{}])[0].get("finishReason","?")
                print(f"    no image (finish={finish})")
            except HTTPError as e:
                print(f"    HTTP {e.code}: {e.read()[:200]}", file=sys.stderr)
                last_err = e
                time.sleep(5)
            except Exception as e:
                print(f"    {type(e).__name__}: {e}", file=sys.stderr)
                last_err = e
                time.sleep(5)
        else:
            print(f"  ✗ FAILED {fname}: {last_err}", file=sys.stderr)

    print("\nDONE")

if __name__ == "__main__":
    main()
