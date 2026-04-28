#!/usr/bin/env python3
"""
Sara & Eva — Family Avatar Generator

Locks canonical 3-view character sheets (front / 3-quarter / profile)
for every recurring cast member of the Sara & Eva YouTube series.

Uses Nano Banana Pro (gemini-3-pro-image-preview) via the public REST
API. Photos of the real family are passed as reference inputs to
stylize-from-photo; output is a 3D CG Like-Nastya-style animated
character.

Usage:

    # Front view (no prior views — pure photo references)
    python3 content/saraandeva/generateFamilyAvatars.py \\
        --character sara \\
        --view front \\
        --refs /path/to/sara.jpg,/path/to/sara-ski.jpeg,/path/to/sara-pool.jpeg

    # 3-quarter (compounding: pass the locked front PNG as a reference)
    python3 content/saraandeva/generateFamilyAvatars.py \\
        --character sara \\
        --view 3q \\
        --refs assets/characters/saraandeva/sara_front.png,/path/to/sara.jpg,/path/to/sara-ski.jpeg

    # Profile (compounding: pass front + 3q as references)
    python3 content/saraandeva/generateFamilyAvatars.py \\
        --character sara \\
        --view profile \\
        --refs assets/characters/saraandeva/sara_front.png,assets/characters/saraandeva/sara_3q.png,/path/to/sara.jpg

Output:
    assets/characters/saraandeva/<character_id>_<view>.png

Character descriptions live in CHARACTERS below. Gemini accepts at
most 3 reference images per call, so --refs is capped at 3.
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

# ───────────────────────── Paths & Constants ──────────────────────────

ROOT = Path(__file__).resolve().parents[2]  # /Volumes/Samsung500/goreadling
ENV_FILE = ROOT / ".env.local"
OUTPUT_DIR = ROOT / "assets" / "characters" / "saraandeva"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MODEL = "gemini-3-pro-image-preview"  # Nano Banana Pro
MAX_REFS = 3
MAX_ATTEMPTS = 5
RATE_LIMIT_WAIT = 60
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# ───────────────────────── Series Style (inlined) ──────────────────────
# Mirrors seriesStyle.py — inlined here so the script has no internal
# imports (the content/saraandeva/ directory isn't a Python package).

SERIES_STYLE_OPTIONS = {
    # The currently-locked default — general 2026 feature-animation CG
    "default": (
        "Modern Pixar / DreamWorks / Illumination 2026-era feature-animation quality. "
        "Full 3D volumetric rendering with real geometry, real materials, real "
        "cinematic lighting — NOT 2D illustration, NOT cel-shaded, NOT a flat "
        "children's-book paint style. Think Inside Out 2, Elemental, The Wild Robot, "
        "Trolls Band Together, Despicable Me 4 production-render quality. "
        "Physically-based shading: visible subsurface scattering on skin, real "
        "specular highlights on eyes and lips, realistic hair with individual strand "
        "translucency and light transmission through flyaways, cloth rendered with "
        "actual weight, fold geometry, and micro-surface detail. Large expressive "
        "stylized eyes with full iris detail (pupil, iris fibers, corneal highlight, "
        "wet surface reflection, a soft catchlight). Slightly stylized proportions "
        "(larger head, expressive eyes) but rendered with feature-film realism, not "
        "flat shapes. Cinematic three-point lighting: warm key light from upper "
        "front-left, cool fill from the right, bright rim light separating the "
        "character from the background. Saturated but natural palette, subtle "
        "atmospheric depth, soft background bokeh. Clean, vibrant, premium. "
        "Always bright, warm, safe, inviting, but rendered, not painted."
    ),

    # Strong Pixar signature — Inside Out 2, Turning Red, Elemental look
    "pixar": (
        "Pixar Animation Studios signature style — production-render quality from "
        "films like Inside Out 2, Turning Red, Elemental, Luca, Soul. Hallmark "
        "Pixar characteristics: slightly larger-than-natural round head, "
        "oversized expressive eyes with prominent sparkling catchlights and "
        "detailed iris patterns, small rounded nose (soft button shape), "
        "friendly natural mouth. Soft subsurface-scattered skin with gentle "
        "rosy cheeks. Hair rendered as real 3D groom with individual strands, "
        "soft secondary-light transmission, realistic highlights. Clothing has "
        "visible fabric weave, soft wrinkles, realistic folds. Signature Pixar "
        "lighting: warm golden key from the upper front, cool sky-blue fill, "
        "strong clean rim light for character separation. Palette leans warm "
        "and saturated with cool accent tones. Composition feels like a "
        "promotional character poster for a feature film. Fully 3D, volumetric, "
        "cinematic, never flat or illustrated."
    ),

    # Walt Disney Animation Studios — Encanto / Moana / Wish / Frozen
    "disney": (
        "Walt Disney Animation Studios signature style — the Encanto, Moana, "
        "Wish, Frozen II, Tangled lineage. Hallmarks: wider heart-shaped face, "
        "very large expressive eyes with intricate iris detail and starry "
        "catchlights, small feminine rounded nose, dainty rosebud mouth, "
        "luxuriously-detailed hair (individual strand rendering with subtle "
        "highlights, flowing movement, a touch of magic to the way it catches "
        "light). Skin has a soft radiant glow with painterly subsurface "
        "scattering. Clothing is rendered with a hint of storybook magic — "
        "embroidery, fine embellishment details, flowing fabrics with grace. "
        "Lighting is slightly more theatrical than Pixar — warm golden keys, "
        "deep blue-violet fills, bright rim halos, a sense of magical "
        "atmosphere. Palette is vibrant and painterly, with rich jewel tones. "
        "Still fully 3D and volumetric, but with that hand-of-an-illustrator "
        "warmth. Disney princess-era energy, friendly and aspirational."
    ),

    # More photoreal — MetaHuman / Unreal Engine stylized kid
    "realistic": (
        "Hyper-realistic 3D character render in a modern Unreal Engine / "
        "MetaHuman / RenderMan style. Near-photoreal skin with visible pores, "
        "fine peach fuzz, natural capillary redness on cheeks and ears, real "
        "eyelashes individually rendered, eyes with full anatomical iris "
        "structure (fibers, limbal ring, wet reflective cornea, multiple "
        "catchlights). Hair is simulated strand-by-strand with real anisotropic "
        "highlights, flyaway wisps, natural root-to-tip color variance. "
        "Clothing has accurate cloth simulation — fold physics, fabric weave, "
        "small imperfections. Physically-based rendering throughout. Lighting "
        "is soft natural studio — large diffused key, gentle fill, subtle rim. "
        "Palette is natural, not overly saturated. Just-slightly-stylized "
        "proportions — head about 1.1× natural size, eyes about 1.2× — so the "
        "character still reads as a character for kids' animation, but the "
        "rendering is film-quality photoreal. Think a children's animated "
        "series shot in Unreal Engine 5."
    ),

    # Generic modern AI aesthetic — Midjourney / Flux default "animated 3D"
    "ai_trending": (
        "Trending 2026 AI-generated 3D character-art aesthetic — the "
        "hyper-polished look commonly produced by Midjourney v7+, Flux Pro, "
        "and Nano Banana's default 3D-character mode. Ultra-clean, hyper-"
        "detailed, slightly dreamy rendering. Skin is flawless and glowing "
        "with subtle micro-detail, eyes are enormous and ultra-expressive "
        "with multiple layered catchlights and rainbow iris detail, hair has "
        "individual strand-level detail with magical subtle iridescence. "
        "Clothing has every stitch and fabric detail visible. Lighting is "
        "soft and dreamy — wraparound ambient glow, gentle rim, a hint of "
        "bokeh depth-of-field. Colors are vibrant, slightly oversaturated, "
        "with that characteristic AI-art cleanness. Fully 3D, stylized "
        "proportions, trending toward the 'perfect-looking digital doll' end "
        "of the spectrum. Polished, aesthetic, Pinterest-friendly."
    ),
}

# LOCKED SERIES STYLE = Pixar. Confirmed by user (2026-04-22) after
# comparing 5 variants (default/pixar/disney/realistic/ai_trending).
# Pixar wins for the SaraandEva channel. Do not change without
# regenerating every character to keep visual consistency across
# episodes.
DEFAULT_STYLE_KEY = "pixar"
SERIES_STYLE = SERIES_STYLE_OPTIONS[DEFAULT_STYLE_KEY]

AVATAR_BACKGROUND = (
    "Plain soft warm cream/ivory background with a very gentle radial gradient. "
    "No props, no environment, no shadows except a small soft contact shadow "
    "under the feet."
)

AVATAR_FRAMING = (
    "Full body, head to feet visible, character centered, filling about 75% of "
    "frame height. Arms slightly away from the body in a natural rest pose "
    "(weight on one leg, not rigid T-pose). Neutral friendly expression, gentle "
    "natural smile, looking toward the camera unless the view says otherwise. "
    "EYES: natural parallel gaze — BOTH eyes looking the same direction, NOT "
    "converged toward the nose bridge, NOT cross-eyed, NOT staring dead-center. "
    "Iris centered in each eye with consistent parallel orientation, a single "
    "soft catchlight positioned in the upper-left of each pupil (matching the "
    "key-light direction). The gaze should feel present and alive, like a "
    "real animated character in a feature film, not a frozen doll stare."
)

VIEW_CAMERAS = {
    "front": (
        "Camera directly in front of the character at the character's eye level. "
        "The character faces the camera head-on."
    ),
    "3q": (
        "Camera at 45 degrees to the character's right, at the character's eye "
        "level. The character's body is turned slightly to show the three-quarter "
        "angle. Face still visible, nose silhouette begins to appear. Match the "
        "face, outfit, hair, and proportions EXACTLY from the front-view "
        "reference — this is the same character, same moment, different angle."
    ),
    "profile": (
        "Camera at 90 degrees to the character's right, at the character's eye "
        "level. Strict side profile. Match the face, outfit, hair, and "
        "proportions EXACTLY from the front and 3-quarter references — this is "
        "the same character, same moment, different angle."
    ),
}

# ───────────────────────── Characters ──────────────────────────
# Descriptions keyed to real-life observed features. Keep these tight —
# the photo references carry most of the identity signal; the text fills
# in show-wardrobe and personality-in-pose context.

CHARACTERS = {
    "sara": {
        "name": "Sara",
        "role": "The Big Sister, age 6",
        "look": (
            "Six-year-old girl with wavy honey-brown / light-brown hair that "
            "falls past her shoulders, WARM RICH BROWN EYES (dark chocolate "
            "brown irises — NOT hazel, NOT green, NOT gray; every family "
            "member has brown eyes), soft freckles across the "
            "nose, rosy cheeks, a bright gap-toothed smile. Slim build, average "
            "height for a 6-year-old."
        ),
        "wardrobe": (
            "Series-canonical outfit: a coral-pink t-shirt with a small yellow "
            "star on the chest, denim shortalls over it, bright teal sneakers "
            "with white laces."
        ),
        "pose": (
            "Stands with a slight hip-tilt, one hand loosely on her hip, the "
            "other relaxed at her side. Thoughtful older-sister energy."
        ),
    },
    "eva": {
        "name": "Eva",
        "role": "The Little Sister, age 4",
        "look": (
            "Four-year-old girl with a big halo of bouncy LIGHT GOLD-BROWN "
            "curly hair — honey/caramel/wheat blonde with a warm golden tone, "
            "NOT auburn, NOT reddish, NOT dark brown. Think honey-blonde with "
            "warm golden highlights, sun-kissed curls. LIGHT FAIR SKIN — "
            "pale-warm Caucasian/European skin with a healthy peachy-cream "
            "tone and rosy cheeks. She is NOT dark-skinned, NOT Black, NOT "
            "tan — fair, light, warm-peachy skin. Same skin tone as her "
            "sister Sara (full biological sisters). WARM CHOCOLATE-BROWN EYES "
            "(not hazel, not green, not gray — every family member has brown eyes), "
            "round cheeks, a wide dimpled smile with tiny baby-teeth. Small "
            "compact build, shorter than Sara, about two-thirds her height. "
            "The distinctive features are the light-gold-brown curly hair "
            "and the fair skin."
        ),
        "wardrobe": (
            "Series-canonical outfit: a soft pink sweatshirt with a small "
            "rainbow on the chest, lavender leggings, light pink sneakers. A "
            "tiny pastel hair bow clipped into her curls on the right side."
        ),
        "pose": (
            "Stands with both feet close together, hands clasped in front, a "
            "small forward lean like she's just about to bounce. Playful "
            "younger-sibling energy."
        ),
    },
    "mama": {
        "name": "Mama",
        "role": "Sara and Eva's mom — fitness coach, healthy eater, active and strong",
        "look": (
            "Woman in her mid-thirties with straight shoulder-length golden "
            "blonde hair (sometimes in a loose ponytail, sometimes a top-knot "
            "bun), WARM BROWN EYES (every family member has brown eyes — "
            "no hazel, no green, no gray), a bright natural smile, light skin "
            "with a healthy sun-kissed warmth. TRIM ATHLETIC BUILD — clearly "
            "strong and fit: toned arms and shoulders, good posture, the "
            "physicality of a working fitness coach. Not stick-thin — visibly "
            "muscled in a healthy way. Glowing, energetic presence."
        ),
        "wardrobe": (
            "Series-canonical outfit: a fitted coral-pink athletic tank top, "
            "high-waist heather-gray training leggings, clean white cross-"
            "training sneakers. A slim fitness watch on the left wrist. Hair "
            "in a neat top-knot or ponytail."
        ),
        "pose": (
            "Stands tall with excellent posture, shoulders back, one hand on "
            "hip or loosely holding a reusable water bottle, warm confident "
            "smile. Active, capable, approachable coach energy."
        ),
    },
    "papa": {
        "name": "Papa",
        "role": "Sara and Eva's dad",
        "look": (
            "Man in his mid-thirties with a clean-shaven head (bald by choice), "
            "a neat full dark beard with a hint of auburn, warm dark-brown eyes "
            "behind rectangular modern eyeglasses, broad friendly smile, medium "
            "build."
        ),
        "wardrobe": (
            "Series-canonical outfit: a navy henley shirt with the top two "
            "buttons undone, charcoal chinos, warm brown casual sneakers."
        ),
        "pose": (
            "Stands relaxed and open, one hand in pocket, the other slightly "
            "gesturing as if mid-conversation. Warm dad energy."
        ),
    },
    "grandma": {
        "name": "Grandma",
        "role": "Papa's mom — a LOVING, huggable, warm-hearted grandma who adores her granddaughters and always arrives with presents for them",
        "look": (
            "Woman in her early 60s. Dark tousled wavy hair (dark brown, "
            "almost black, softly styled with a little volume) chin-to-"
            "shoulder length with soft fringe/bangs. WARM BROWN EYES "
            "that crinkle at the corners with JOY — she's always happy to "
            "see the girls. Olive-warm skin, natural gentle aging (not "
            "smoothed young, not heavily wrinkled — real mid-60s character). "
            "SIGNATURE bold red lipstick. Soft natural smile that reaches "
            "her eyes — this is a woman who genuinely delights in her "
            "grandchildren. Fuller, rounder, huggable figure (NOT slim, NOT "
            "strict — softly plush, with a cuddly warmth, the kind of "
            "grandma kids RUN to hug). Approachable, loving, expressive."
        ),
        "wardrobe": (
            "Series-canonical outfit: an artistic embroidered jacket — "
            "copper/bronze velvet base with intricate Bukharan / "
            "Middle-Eastern ornamental embroidery along the lapels and "
            "cuffs. Underneath: a dark teal or black silk blouse. A long "
            "flowing dark skirt (softens the silhouette more than trousers). "
            "Signature jewelry: turquoise statement ring, turquoise bangle, "
            "long silver chain necklace. Red manicured nails. Comfortable "
            "low-heel boots or flats. ALWAYS carrying a brightly-wrapped "
            "gift for the girls — a colorful present box with a ribbon, or "
            "a small bakery box of treats."
        ),
        "pose": (
            "Stands with a WARM, WELCOMING, open stance — arms out slightly "
            "as if about to open them for a hug. One hand holds or extends a "
            "colorful wrapped gift. Face lit up with a big natural warm "
            "smile, eyes soft and loving. 'Just arrived at the girls' door "
            "and can't wait to see them' energy. This is the grandma every "
            "kid wants — loving, huggable, generous with presents. NOT "
            "strict, NOT thin, NOT wry — warm and cuddly and joyful."
        ),
    },
    "grandpa": {
        "name": "Grandpa",
        "role": "Papa's dad — kind, steady, full of stories",
        "look": (
            "Man in his early 60s with short salt-and-pepper hair (more salt "
            "than pepper), warm brown eyes with soft laugh lines, a "
            "neatly-trimmed short gray beard, a kind thoughtful smile, warm "
            "light skin. Average build, a touch softer than Papa's."
        ),
        "wardrobe": (
            "Series-canonical outfit: a sky-blue button-down shirt with the "
            "sleeves rolled to the forearms, khaki chinos, warm brown leather "
            "loafers."
        ),
        "pose": (
            "Stands calmly with one hand lightly in his chino pocket, the other "
            "holding a folded newspaper or a small potted plant. Wise, warm "
            "grandpa energy."
        ),
    },
    "ginger": {
        "name": "Ginger",
        "role": "The family Jack Russell Terrier",
        "look": (
            "Adult Jack Russell Terrier, compact and athletic. Predominantly "
            "white short coat with clear tan/ginger markings: a tan patch "
            "covering most of the head and ears (with a white blaze down the "
            "center of the face), and a tan 'saddle' patch on the back and "
            "shoulders. Short legs, strong chest, alert amber eyes, small black "
            "nose, small triangular flop-ears that perk up when curious. Short "
            "naturally-docked tail held upright when alert."
        ),
        "wardrobe": (
            "A bright red fabric collar with a small silver bone-shaped name "
            "tag."
        ),
        "pose": (
            "Stands with all four paws on the ground, head up, ears perked, "
            "body slightly leaning forward — about to spring into action. Mouth "
            "slightly open in a relaxed terrier 'smile'."
        ),
    },
    "postman": {
        "name": "Postman",
        "role": "Friendly USPS mail carrier — recurring guest character. Delivers packages to the family's home. Always polite, always smiling. Never alone with the kids: Mama or Papa always answers the door (safety beat).",
        "look": (
            "Friendly adult man in his late 30s. Average build, warm tan/light-"
            "brown skin, dark short cropped hair, kind brown eyes, a clean-"
            "shaven warm friendly smile. Approachable, professional, "
            "trustworthy postman — someone you'd be happy to see at your door."
        ),
        "wardrobe": (
            "USPS UNIFORM — official US Postal Service style. KEY ELEMENTS: a "
            "navy-blue uniform short-sleeve POLO SHIRT with the USPS-style "
            "patch on the left chest (eagle-style emblem in red/white/blue, "
            "no real logo text — generic mail-carrier patch). Navy-blue "
            "WALKING SHORTS to the knee, dark navy crew socks, sturdy "
            "BLACK LEATHER WORK SHOES. A LIGHT BLUE BASEBALL CAP with a "
            "matching mail-carrier patch on the front. A LARGE BLUE-CANVAS "
            "MAIL SATCHEL slung crossbody from one shoulder, the strap "
            "running diagonally across the chest, the bag resting on the hip "
            "— stuffed visibly with envelopes and parcels. CARRIES A "
            "MEDIUM-SIZE BROWN CARDBOARD PACKAGE in both hands held at chest "
            "height (the package destined for the family). UNAMBIGUOUSLY "
            "READS as 'a postman/mail carrier' to a 4-year-old — uniform is "
            "the silhouette read."
        ),
        "pose": (
            "Stands at the front door of the family home, package held in "
            "front of him at chest height with both hands, friendly polite "
            "smile, mid-step or just-arrived posture. Calm, professional, "
            "non-threatening. NEVER reaching toward the camera, NEVER "
            "interacting with kids — just delivering."
        ),
    },
    "joe": {
        "name": "Joe",
        "role": "The family Pomeranian (Eva calls him 'Zhorik')",
        "look": (
            "Young adult Pomeranian with an extremely fluffy double coat that "
            "is mostly cream-white with warm pale-gold highlights along the "
            "back, ruff, and tail (classic white Pomeranian with gold/biscuit "
            "ticking). Small wedge-shaped head buried in fluff, dark round "
            "button eyes, tiny black button nose, small triangular ears barely "
            "poking out of the ruff. Plumed tail that curls high over his back. "
            "Tiny — about two handfuls of dog."
        ),
        "wardrobe": (
            "A soft sky-blue fabric collar with a small silver heart-shaped "
            "name tag."
        ),
        "pose": (
            "Stands squarely on all four tiny paws, fluff slightly tousled, "
            "soft natural Pom smile, tail curled proudly over the back. "
            "Looking slightly up toward the camera."
        ),
    },
}

# ───────────────────────── Env / API Keys ──────────────────────────

def load_env(path: Path) -> None:
    """Parse a minimal .env.local file into os.environ (no dotenv dep)."""
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
        "GEMINI_API_KEY",
        "GEMINI_API_KEY_2",
        "GEMINI_API_KEY_3",
        "GEMINI_API_KEY_4",
        "GEMINI_API_KEY_5",
        "GEMINI_API_KEY_6",
    ):
        v = os.environ.get(name)
        if v:
            keys.append(v.replace('"', "").strip())
    return keys


# ───────────────────────── Prompt Assembly ──────────────────────────

def build_prompt(character_id: str, view: str, style_key: str = "default") -> str:
    if character_id not in CHARACTERS:
        raise SystemExit(f"Unknown character: {character_id}")
    if view not in VIEW_CAMERAS:
        raise SystemExit(f"Unknown view: {view} (expected one of {list(VIEW_CAMERAS)})")
    if style_key not in SERIES_STYLE_OPTIONS:
        raise SystemExit(f"Unknown style: {style_key} (expected one of {list(SERIES_STYLE_OPTIONS)})")

    c = CHARACTERS[character_id]
    view_note = VIEW_CAMERAS[view]
    view_label = {"front": "FRONT", "3q": "3-QUARTER", "profile": "PROFILE"}[view]
    series_style = SERIES_STYLE_OPTIONS[style_key]

    return f"""Create a canonical {view_label} VIEW character-sheet portrait of {c['name']}, {c['role']}, for a recurring animated children's YouTube series called "Sara and Eva".

LOOK (stylize from the real photos provided, do NOT photorealistically copy them — translate into the series' animated style):
{c['look']}

WARDROBE (this is the character's SIGNATURE series outfit — always the same across every episode, regardless of what the real person is wearing in the reference photos):
{c['wardrobe']}

POSE:
{c['pose']}

CAMERA VIEW:
{view_note}

FRAMING:
{AVATAR_FRAMING}

BACKGROUND:
{AVATAR_BACKGROUND}

ART STYLE:
{series_style}

This image is the CANONICAL REFERENCE for {c['name']} and will be reused across hundreds of episodes. Make it distinctive, expressive, warm, and on-brand for a flagship kids' YouTube channel. No text or watermarks anywhere in the image.
""".strip()


# ───────────────────────── Gemini Call ──────────────────────────

def load_image_as_inline_data(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"Reference image not found: {path}")
    raw = path.read_bytes()
    ext = path.suffix.lower()
    mime = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(ext, "image/jpeg")
    return {
        "inlineData": {
            "mimeType": mime,
            "data": base64.b64encode(raw).decode("ascii"),
        }
    }


def call_gemini(prompt: str, ref_paths: list[Path], keys: list[str]) -> bytes:
    parts: list[dict] = []
    if ref_paths:
        for p in ref_paths:
            parts.append(load_image_as_inline_data(p))
        ref_label = (
            "Above is the STYLIZATION REFERENCE"
            if len(ref_paths) == 1
            else f"Above are {len(ref_paths)} STYLIZATION REFERENCE images"
        )
        parts.append({
            "text": (
                f"{ref_label} of the real person (or previously-locked character sheet) "
                f"this character is based on. Preserve the identity cues (face shape, "
                f"hair color and texture, eye color, skin tone, characteristic smile) "
                f"while translating the character fully into the animated series style.\n\n"
                + prompt
            )
        })
    else:
        parts.append({"text": prompt})

    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"],
            "temperature": 0.3,
        },
    }
    data = json.dumps(body).encode("utf-8")

    last_err = None
    for attempt in range(MAX_ATTEMPTS):
        key = keys[attempt % len(keys)]
        url = f"{API_BASE}/{MODEL}:generateContent?key={key}"
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                response = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            err_text = e.read().decode("utf-8", errors="replace")[:400]
            last_err = f"HTTP {e.code}: {err_text}"
            if e.code == 429:
                print(f"  ⏳ Rate limited on key #{(attempt % len(keys)) + 1}, waiting {RATE_LIMIT_WAIT}s...")
                time.sleep(RATE_LIMIT_WAIT)
                continue
            print(f"  ⚠️  attempt {attempt + 1}/{MAX_ATTEMPTS} failed: {last_err}")
            time.sleep(3)
            continue
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            print(f"  ⚠️  attempt {attempt + 1}/{MAX_ATTEMPTS} failed: {last_err}")
            time.sleep(3)
            continue

        candidate = (response.get("candidates") or [{}])[0]
        cand_parts = (candidate.get("content") or {}).get("parts") or []
        for p in cand_parts:
            inline = p.get("inlineData") or p.get("inline_data")
            if inline and inline.get("mimeType", inline.get("mime_type", "")).startswith("image/"):
                return base64.b64decode(inline["data"])
        finish_reason = candidate.get("finishReason", "unknown")
        text_part = next((p.get("text") for p in cand_parts if p.get("text")), None)
        print(
            f"  ⚠️  attempt {attempt + 1}/{MAX_ATTEMPTS}: no image in response "
            f"(finish: {finish_reason}{', text: ' + text_part[:120] if text_part else ''})"
        )
        time.sleep(3)

    raise SystemExit(f"Gemini call failed after {MAX_ATTEMPTS} attempts. Last error: {last_err}")


# ───────────────────────── CLI ──────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="Generate a single canonical 3-view avatar image for a Sara & Eva show character.")
    ap.add_argument("--character", required=True, choices=sorted(CHARACTERS.keys()), help="Which character to render")
    ap.add_argument("--view", required=True, choices=list(VIEW_CAMERAS.keys()), help="Which view (front, 3q, profile)")
    ap.add_argument("--style", default=DEFAULT_STYLE_KEY, choices=list(SERIES_STYLE_OPTIONS.keys()), help=f"Which art style variant to use. Default: {DEFAULT_STYLE_KEY} (locked series style)")
    ap.add_argument("--refs", default="", help="Comma-separated list of reference image paths (up to 3). For 3q and profile, include the previously-locked views as refs to lock identity across angles.")
    ap.add_argument("--output", default="", help="Output PNG path. Defaults to assets/characters/saraandeva/<character>_<view>[_<style>].png")
    ap.add_argument("--force", action="store_true", help="Overwrite existing output")
    ap.add_argument("--dry-run", action="store_true", help="Print the prompt and reference list without calling the API")
    args = ap.parse_args()

    ref_paths: list[Path] = []
    if args.refs.strip():
        for r in args.refs.split(","):
            r = r.strip()
            if not r:
                continue
            p = Path(r)
            if not p.is_absolute():
                # Try resolving relative to repo root first, then CWD
                candidate = (ROOT / r).resolve() if (ROOT / r).exists() else p.resolve()
                p = candidate
            ref_paths.append(p)
        if len(ref_paths) > MAX_REFS:
            print(f"  ⚠️  {len(ref_paths)} refs provided; Gemini caps at {MAX_REFS}. Using the first {MAX_REFS}.")
            ref_paths = ref_paths[:MAX_REFS]

    for p in ref_paths:
        if not p.exists():
            raise SystemExit(f"❌ Reference not found: {p}")

    if args.output:
        output_path = Path(args.output).resolve()
    else:
        suffix = "" if args.style == DEFAULT_STYLE_KEY else f"_{args.style}"
        output_path = OUTPUT_DIR / f"{args.character}_{args.view}{suffix}.png"
    if output_path.exists() and not args.force and not args.dry_run:
        raise SystemExit(f"❌ Output already exists (use --force to overwrite): {output_path}")

    prompt = build_prompt(args.character, args.view, args.style)

    print(f"\n🎨 Generating {args.character.upper()} — {args.view.upper()} view")
    print(f"   Model:   {MODEL}")
    print(f"   Output:  {output_path}")
    print(f"   Refs ({len(ref_paths)}):")
    for p in ref_paths:
        print(f"     - {p}")
    if args.dry_run:
        print("\n--- PROMPT ---\n" + prompt + "\n---")
        return

    keys = get_api_keys()
    if not keys:
        raise SystemExit("❌ No GEMINI_API_KEY* found in env (checked .env.local and os.environ).")

    t0 = time.time()
    image_bytes = call_gemini(prompt, ref_paths, keys)
    elapsed = time.time() - t0

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(image_bytes)
    kb = len(image_bytes) / 1024
    print(f"\n✅ Wrote {output_path.name}  ({kb:.1f} KB, {elapsed:.1f}s)")


if __name__ == "__main__":
    main()
