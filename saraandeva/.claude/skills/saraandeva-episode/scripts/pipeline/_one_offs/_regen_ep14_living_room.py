#!/usr/bin/env python3
"""Regenerate ep14_anniversary_living_room.png with a wall photo collage
showing Mom + Dad at the actual travel destinations from this episode's
flashback (Germany, Rome, Bulgaria, Disney Paris, wedding).
"""
import base64, json, os, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ENV_FILE = Path("/Volumes/Samsung500/goreadling-production/.env.local")
MODEL = "gemini-3-pro-image-preview"
API = "https://generativelanguage.googleapis.com/v1beta/models"

# Travel scene refs to inform what's in the photos (wedding now garden, not chapel)
TRAVEL_REFS = [
    PROJECT_ROOT / "assets" / "scenes" / "ep14_german_autumn_road.png",
    PROJECT_ROOT / "assets" / "scenes" / "ep14_rome_colosseum.png",
    PROJECT_ROOT / "assets" / "scenes" / "ep14_bulgaria_ski_slope.png",
    PROJECT_ROOT / "assets" / "scenes" / "ep14_disney_paris_castle.png",
    PROJECT_ROOT / "assets" / "scenes" / "ep14_wedding_garden.png",
]
# Identity refs — CANONICAL avatars first (Papa is BALD per these refs).
# young_Papa was apparently rendering with hair in the small photo crops, so we use canonical first.
IDENT_REFS = [
    PROJECT_ROOT / "assets" / "characters" / "papa_front.png",       # CANONICAL bald Papa
    PROJECT_ROOT / "assets" / "characters" / "mama_front.png",       # CANONICAL Mama
    PROJECT_ROOT / "assets" / "scenes" / "group_ep14_young_papa_traveler_preview.png",
    PROJECT_ROOT / "assets" / "scenes" / "group_ep14_young_mama_cafe_local_preview.png",
    PROJECT_ROOT / "assets" / "scenes" / "group_ep14_baby_sara_newborn_preview.png",
    PROJECT_ROOT / "assets" / "scenes" / "group_ep14_baby_eva_newborn_preview.png",
]
# Style ref
STYLE_REFS = [
    PROJECT_ROOT / "assets" / "scenes" / "ep15_house4_isabel_cottage.png",
]


def load_env():
    for line in ENV_FILE.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def load_inline(p):
    return {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(p.read_bytes()).decode()}}


def main():
    load_env()
    keys = [os.environ.get(n) for n in ("GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3")]
    keys = [k.replace('"','').strip() for k in keys if k]

    parts = []
    # Style anchors
    for p in STYLE_REFS:
        if p.is_file(): parts.append(load_inline(p))
    parts.append({"text": "☝️ Pixar 3D feature-render style anchor."})
    # Identity refs for the couple in the photos
    for p in IDENT_REFS:
        if p.is_file(): parts.append(load_inline(p))
    parts.append({"text": (
        "☝️ IDENTITY REFERENCES — CRITICAL, every photo on the wall must show THESE specific people:\n"
        "  Image 1 (CANONICAL Papa): bald head — NO hair on top of head — dark beard, glasses, friendly. "
        "    EVERY photo of the man on the wall must show him BALD. Never give him hair. He is bald in every photo.\n"
        "  Image 2 (CANONICAL Mama): straight blonde hair, fair skin, warm friendly smile.\n"
        "  Image 3 (young_Papa stylized): same bald + beard + glasses, navy henley, traveler outfit.\n"
        "  Image 4 (young_Mama stylized): straight blonde hair, mustard sweater, cafe outfit.\n"
        "  Image 5 (baby_Sara): newborn baby with dark-blonde wisps, peaceful sleeping face, pink-with-clouds swaddle.\n"
        "  Image 6 (baby_Eva): newborn baby with curly bright-blonde tufts, peaceful sleeping face, lemon-yellow swaddle.\n"
        "Use Image 1 + Image 2 as the PRIMARY identity. The man is BALD in every single photo. NEVER add hair."
    )})
    # Travel scene refs
    for p in TRAVEL_REFS:
        if p.is_file(): parts.append(load_inline(p))
    parts.append({"text": (
        "☝️ These 5 reference images are the EXACT TRAVEL DESTINATIONS the couple visited. The photo "
        "collage on the wall MUST contain photos of the couple AT these destinations:\n"
        "  Photo 1: couple in convertible on the German autumn cobblestone road with castle on hilltop\n"
        "  Photo 2: couple eating gelato in front of the Roman Colosseum\n"
        "  Photo 3: couple on Bulgarian ski slope in winter ski gear\n"
        "  Photo 4: couple at Disneyland Paris in front of Sleeping Beauty Castle with fireworks (mouse ears)\n"
        "  Photo 5: wedding photo — couple in white dress + suit at intimate stone chapel altar\n"
        "Use the travel scene reference images to compose where the couple stands in each photo."
    )})

    parts.append({"text": (
        "Generate a Pixar-3D feature-render scene PNG. Cozy modern living room dressed for anniversary "
        "celebration — wide cinematic establishing shot.\n\n"
        "DESIGN ELEMENTS:\n"
        "- String of golden twinkling fairy lights along wooden mantel above small electric fireplace\n"
        "- Heart-shaped helium balloon arrangements in pastels (cream, dusty-rose, sage) flanking each side of the couch\n"
        "- Beige sectional couch with autumn-orange knitted throw blanket over armrest\n"
        "- Low wooden coffee table with two mugs of hot chocolate (steam visible) and small ribbon-wrapped white gift box with yellow satin bow\n"
        "- Soft warm orange floor-lamp glow on the right\n"
        "- Soft golden-hour light through window on the left\n\n"
        "WALL PHOTO COLLAGE — CRITICAL:\n"
        "Above the couch on the back wall, hang a CURATED PHOTO COLLAGE: "
        "7 framed photos in soft warm wood frames arranged organically (not grid-perfect, more curated-gallery feel). "
        "Each photo shows the SAME COUPLE from identity references — bald-head Papa with dark beard and glasses + "
        "blonde-hair Mama with fair skin. NO RELIGIOUS imagery in any photo. Photos:\n"
        "  - Photo CENTER-LARGE (biggest, focal): OUTDOOR GARDEN WEDDING — couple under a white-peony-and-ivy "
        "    arch, Papa in charcoal suit (BALD HEAD, dark beard, glasses), Mama in flowing white dress, "
        "    cream-petal aisle, golden-hour sunlight. NO chapel, NO cross, NO altar, NO religious symbols.\n"
        "  - Photo TOP-LEFT: Disneyland Paris Sleeping Beauty Castle behind the couple, both wearing black "
        "    mouse-ear headbands, soft pink fireworks above. (BALD Papa with mouse ears.)\n"
        "  - Photo TOP-RIGHT: Roman Colosseum behind the couple, both eating gelato in sunny afternoon light. "
        "    (BALD Papa.)\n"
        "  - Photo MID-LEFT: Germany cobblestone autumn road, couple smiling in cream vintage convertible, "
        "    castle on hilltop. (BALD Papa driving.)\n"
        "  - Photo MID-RIGHT: Bulgaria ski slope, couple in puffy winter ski gear holding ski poles, snowy pines. "
        "    (BALD Papa under helmet — or no helmet, bald head visible.)\n"
        "  - Photo BOTTOM-LEFT: 'Welcome Sara' family-portrait photo — BALD Papa + Mama hospital-bed scene, "
        "    both holding tiny newborn baby Sara wrapped in pink-with-clouds swaddle, dark-blonde wisps visible. "
        "    Both parents glowing happy-tired. NO RELIGIOUS imagery.\n"
        "  - Photo BOTTOM-RIGHT: 'Welcome Eva' family-portrait photo — BALD Papa + Mama same hospital-bed, "
        "    holding tiny newborn baby Eva wrapped in lemon-yellow swaddle, curly bright-blonde tufts visible. "
        "    Both parents glowing happy. NO RELIGIOUS imagery.\n\n"
        "ABSOLUTE RULES for every photo:\n"
        "  • Papa is BALD in every photo. No hair on top of head. NEVER render him with hair.\n"
        "  • NO religious symbols anywhere — no cross, no crucifix, no church interior, no chapel.\n"
        "  • NO Mickey/Minnie Mouse characters — just the couple wearing decorative mouse-ear headbands at Disney.\n"
        "  • Photos look like real-world snapshot/Instagram-style memories of THIS specific couple. Pixar 3D render.\n\n"
        "NO PEOPLE in the room itself (the couple are only inside the photos on the wall). "
        "Empty couch, empty floor. Pixar 3D quality, cozy intimate family atmosphere. "
        "Format: 16:9 horizontal, wide cinematic establishing shot."
    )})

    body = {"contents":[{"parts": parts}], "generationConfig":{"responseModalities":["IMAGE","TEXT"], "temperature": 0.3}}
    data = json.dumps(body).encode()
    out = PROJECT_ROOT / "assets" / "scenes" / "ep14_anniversary_living_room.png"

    last_err = None
    for attempt, key in enumerate(keys[:3], 1):
        print(f"  [{attempt}/3] regenerating with travel-photo collage...")
        try:
            req = Request(f"{API}/{MODEL}:generateContent?key={key}",
                          data=data, headers={"Content-Type":"application/json"}, method="POST")
            with urlopen(req, timeout=240) as r:
                rj = json.loads(r.read())
            cand = (rj.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
            for p in cand:
                inline = p.get("inlineData") or p.get("inline_data")
                if inline and (inline.get("mimeType") or inline.get("mime_type","")).startswith("image/"):
                    out.write_bytes(base64.b64decode(inline["data"]))
                    print(f"    ✓ saved {out.relative_to(PROJECT_ROOT)} ({out.stat().st_size//1024} KB)")
                    return
            finish = (rj.get("candidates") or [{}])[0].get("finishReason","?")
            print(f"    no image (finish={finish})")
        except HTTPError as e:
            print(f"    HTTP {e.code}: {e.read()[:200]}")
            last_err = e
        time.sleep(5)
    print(f"!! all attempts failed: {last_err}", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
