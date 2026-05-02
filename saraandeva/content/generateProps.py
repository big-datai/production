#!/usr/bin/env python3
"""
Sara & Eva — Prop (Bound Element) Generator

Sister to generateScenes.py. Produces square Pixar-style PROP images
that get bound in Kling's library and re-used across episodes (e.g.
ep07's coupon_book and papa_notepad). Each prop is rendered N times
(default 3) and saved as <id>_v1.png, <id>_v2.png, <id>_v3.png so the
human can pick the best variant before Kling library upload.

Reuses generateScenes.py's helpers for env loading, API key rotation,
Gemini call, and inline-data formatting — keeps the prop generator
small and avoids duplicating the call/retry logic.

Output: assets/scenes/<prop_id>_v{1..N}.png (matches ep07 convention)

Usage:
    python3 content/generateProps.py --prop gas_mask
    python3 content/generateProps.py --prop all --variants 3
    python3 content/generateProps.py --list
"""

import argparse
import sys
import time
from pathlib import Path

# Borrow helpers + style anchors from the scene generator.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import generateScenes as gs  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SARAANDEVA_DIR = ROOT / "saraandeva"
OUTPUT_DIR = SARAANDEVA_DIR / "assets" / "scenes"
PHOTOS_DIR = SARAANDEVA_DIR / "assets" / "photos"

# ───────────────────────── Prop catalog ──────────────────────────
# Same shape as SCENES in generateScenes.py — label + refs + description.
# Keep the description PROP-CENTRIC: a single object, centered, on a clean
# soft neutral backdrop (the prop will be composited into many scenes, so
# its background must be removable / neutral).

PROPS = {
    "brave_tooth_book": {
        "label": "Children's picture book — 'The Brave Little Tooth'",
        "refs": [],
        "description": (
            "A SINGLE small kids' hardcover PICTURE BOOK, propped open at "
            "an angle so we can see BOTH the FRONT COVER and a portion of "
            "an INTERIOR PAGE — like a beautifully posed object on a table. "
            "FRONT COVER (left side of the prop): a bright, cheerful "
            "illustrated cover with a smiling cartoon TOOTH CHARACTER "
            "(round, chunky, two dot-eyes, a wide happy curved mouth, two "
            "tiny stubby arms, both hands raised in a brave little fist-"
            "pump). The tooth character stands in front of a soft pastel "
            "sky-blue background with a few tiny stylized stars around it. "
            "TITLE printed above the tooth in large clear printed Roman "
            "block letters: 'THE BRAVE LITTLE TOOTH'. Below the title, in "
            "smaller printed Roman letters: 'a story about going to the "
            "dentist'. INTERIOR PAGE visible (right side of the prop, at "
            "an angle): a simple kids'-book-style spread — a tiny "
            "illustrated tooth character standing in a doorway with a "
            "speech bubble, and a few lines of large clean printed text "
            "underneath. Lower-right of the cover: a small rounded "
            "publisher badge with the word 'GOREADLING' in clean printed "
            "Roman letters. English text only, large clear printed Roman "
            "alphabet, NO foreign characters, NO garbled letters, NO "
            "scrambled text, every visible word fully legible and "
            "correctly spelled. PALETTE: soft cheerful pastels — sky "
            "blues, mint greens, sunshine yellows, gentle pinks; warm "
            "off-white paper interior. Centered in the frame on a soft "
            "off-white / pale-cream neutral backdrop with a gentle drop "
            "shadow underneath, lit from soft top-key with a fill — even "
            "studio-product feel. Pixar 3D render, premium paper-and-"
            "print materials, slight matte finish on the cover. NO "
            "watermark."
        ),
    },

    "gas_mask": {
        "label": "Pediatric pink-elephant nose-piece gas mask (comedy prop)",
        "refs": [],
        "description": (
            "A SINGLE pediatric DENTAL NITROUS-OXIDE NOSE-PIECE styled as "
            "a chunky cartoon PINK ELEPHANT — the iconic 'kid's gas mask' "
            "every American pediatric dental office has. SHAPE: a soft "
            "rounded pink-rubber nose-cup that fits over a child's nose "
            "ONLY (NOT covering the mouth), molded into the friendly head "
            "of a baby elephant — two big round white eyes with small "
            "black pupils on top, two flopped-down round pink ears on the "
            "sides, a tiny stylized trunk curling forward at the bottom. "
            "PALETTE: bubblegum pink rubber, soft white eye highlights, "
            "darker rose-pink ear interiors. Two soft TEAL flexible ribbed "
            "tubes plug into the back of the elephant head and trail off "
            "to one side of the frame. Clean cartoon-chunky proportions, "
            "rounded soft edges, NO sharp medical-equipment look — kid-"
            "friendly, NOT scary. Centered in the frame on a soft "
            "off-white / pale-cream neutral backdrop with a gentle drop "
            "shadow underneath. Lighting: soft top-key with a fill, even "
            "studio-product feel. Pixar 3D render, premium materials. NO "
            "text, NO labels, NO watermark."
        ),
    },

    "dental_coin": {
        "label": "Shiny gold 'BRAVE TOOTH' reward coin",
        "refs": [],
        "description": (
            "A SINGLE shiny GOLD METAL CHALLENGE COIN, roughly the size "
            "of a large American silver dollar (about 4 cm across), "
            "displayed face-up centered in the frame. FACE design: "
            "embossed in raised gold relief — a round border ring with a "
            "subtle dotted edge, then in the center a smiling cartoon "
            "TOOTH CHARACTER (a chunky molar with a smiling face, two "
            "tiny dot-eyes, a wide happy curved mouth, both little arms "
            "raised in a victory pose). Around the inner border, "
            "embossed text reading 'BRAVE TOOTH CLUB' in clean printed "
            "Roman block letters at the top arc and 'YOU DID IT!' along "
            "the bottom arc. English text only, large clear printed "
            "Roman alphabet, NO foreign characters. PALETTE: warm rich "
            "yellow-gold metal with subtle highlights catching the light, "
            "slightly darker gold in the recessed letter / character "
            "details. Centered on a soft off-white / pale-cream neutral "
            "backdrop with a gentle drop shadow underneath, lit from "
            "soft top-key with a fill — even studio-product feel. Pixar "
            "3D render, premium metallic materials, cheerful, kid-prize "
            "vibe. NO watermark."
        ),
    },

    "dentist_goodie_bag": {
        "label": "Pediatric dentist toothbrush goodie bag (TOOTHCO)",
        "refs": [
            str(PHOTOS_DIR / "Eva_dentis.JPG"),
        ],
        "description": (
            "A SINGLE small white kraft-paper-style PEDIATRIC DENTAL "
            "GOODIE BAG, roughly the proportions of a child's snack-size "
            "bag (taller than wide, with a folded-over top and small "
            "punched handle holes). Standing upright, centered in the "
            "frame, slightly facing the camera. FRONT of the bag: a "
            "cheerful cartoon BLUE TOOTHBRUSH icon in the upper portion, "
            "and below it the wordmark 'TOOTHCO' in clean bold printed "
            "Roman block letters in dark navy — followed by a smaller "
            "tagline 'BRUSH BRAVE!' in friendly playful printed text. A "
            "small smiling cartoon TOOTH icon sits to the right of the "
            "wordmark. English text only, large clear printed Roman "
            "alphabet, NO foreign characters. PALETTE: bright clean "
            "white kraft paper, navy and turquoise printed graphics, a "
            "small pop of bright pink on the toothbrush bristles. Peeking "
            "out of the open top of the bag: the colorful bristled head "
            "of a kids' toothbrush, a tiny tube of toothpaste, and the "
            "edge of a flat sticker. Centered on a soft off-white / "
            "pale-cream neutral backdrop with a gentle drop shadow "
            "underneath, lit from soft top-key with a fill — even studio-"
            "product feel. Pixar 3D render, premium paper-and-print "
            "materials, slight reflective sheen on the toothpaste tube. "
            "NO watermark. The reference photo (if provided) shows the "
            "real-life inspiration — translate it fully into Pixar style; "
            "do NOT reproduce the photo, do NOT include any real-world "
            "trademarks from the photo."
        ),
    },
}


def build_prop_prompt(prop_id: str) -> str:
    p = PROPS[prop_id]
    return f"""Create a canonical PROP image for a recurring animated children's YouTube series called "Sara and Eva". This image will be used as a locked PROP REFERENCE in Kling's library, so the same exact prop appears every episode it's used in.

PROP: {p['label']}

DESCRIPTION:
{p['description']}

ART STYLE:
{gs.SERIES_STYLE}

CRITICAL: This is a PROP, not a scene — frame is roughly SQUARE (1:1), the prop is CENTERED with breathing room around it on a clean SOFT NEUTRAL BACKDROP (off-white / pale cream). NO scene, NO room, NO characters, NO hands, NO people, NO dogs — just the prop itself, like a high-end product hero shot from a Pixar art-of-the-film book. Soft top-key lighting with gentle fill, gentle contact shadow underneath. NO text or watermarks anywhere EXCEPT exactly the printed text described above (if any) — that text MUST be English, large clear printed Roman alphabet, no garbled letters.

The output MUST be unmistakably Pixar 3D CG — physically-based premium materials, soft storybook-warm color, cartoon-chunky stylized proportions. NOT photorealistic, NOT 2D anime, NOT flat cel-shading.""".strip()


def generate_variant(prop_id: str, variant: int, keys: list, force: bool) -> Path:
    out = OUTPUT_DIR / f"{prop_id}_v{variant}.png"
    if out.exists() and not force:
        print(f"⏭️  cached: {out.name}")
        return out
    refs = []
    for ref_name in PROPS[prop_id]["refs"]:
        rp = Path(ref_name)
        if rp.exists():
            refs.append(rp)
    refs = refs[:gs.MAX_REFS]
    style_refs = [sr for sr in gs.STYLE_ANCHOR_REFS if sr.exists()]
    prompt = build_prop_prompt(prop_id)
    print(f"🎨 {prop_id}_v{variant} ({PROPS[prop_id]['label']})  layout={len(refs)} style={len(style_refs)}")
    t0 = time.time()
    data = gs.call_gemini(prompt, refs, style_refs, keys)
    out.write_bytes(data)
    print(f"  ✅ {out.name}  ({len(data)/1024:.1f} KB, {time.time()-t0:.1f}s)")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prop", help="Prop id, or 'all'. Use --list to see IDs.")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--variants", type=int, default=1, help="Number of candidate variants per prop (default 1)")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if args.list:
        for pid, p in PROPS.items():
            print(f"  {pid:<22} — {p['label']}")
        return

    if not args.prop:
        raise SystemExit("Provide --prop <id> or --prop all")

    keys = gs.get_api_keys()
    if not keys:
        raise SystemExit("No GEMINI_API_KEY* in env")

    targets = list(PROPS) if args.prop == "all" else [args.prop]
    for pid in targets:
        if pid not in PROPS:
            print(f"⚠️  unknown prop: {pid}")
            continue
        for v in range(1, args.variants + 1):
            generate_variant(pid, v, keys, args.force)


if __name__ == "__main__":
    main()
