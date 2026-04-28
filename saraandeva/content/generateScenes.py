#!/usr/bin/env python3
"""
Sara & Eva — Scene (Background) Library Generator

Locks canonical background/location images in the same Pixar 2026
feature-animation style as the characters. These become the bound
"scene reference" inputs to Kling's Elements panel on every multi-shot
clip, so every episode's kitchen looks like the same kitchen, the
backyard like the same backyard, etc.

Output: assets/characters/saraandeva/scenes/<scene_id>.png

Uses the same gemini-3-pro-image-preview (Nano Banana Pro) endpoint
and the locked Pixar SERIES_STYLE paragraph as the character avatars.

Usage:
    python3 content/saraandeva/generateScenes.py --scene kitchen_morning
    python3 content/saraandeva/generateScenes.py --scene all     # parallel all
    python3 content/saraandeva/generateScenes.py --list

Refs: where a real-life photo exists (e.g. the family kitchen island,
the hedge-lined front walk), we pass it as a stylization reference
so the animated scene has the same layout as the real home. For
invented locations (park, bathroom, etc.) no refs are passed.
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
OUTPUT_DIR = ROOT / "assets" / "characters" / "saraandeva" / "scenes"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PHOTO_DIR = Path("/Volumes/Samsung500/photo")
HOUSE_DIR = Path("/Volumes/Samsung500/photo/house")

MODEL = "gemini-3-pro-image-preview"
MAX_REFS = 3
MAX_ATTEMPTS = 5
RATE_LIMIT_WAIT = 60
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# ── Style anchors: known-good Pixar 3D renders passed alongside the layout
# refs to lock every scene onto the same visual universe. The model treats
# these as STYLE references (look-and-feel), distinct from the layout/photo
# references which provide architecture and color palette.
STYLE_ANCHOR_REFS = [
    OUTPUT_DIR / "house_aerial.png",
]

# ─────────────────── Series style (matches avatars) ───────────────────
# Pixar-locked style paragraph (identical to generateFamilyAvatars.py's
# "pixar" variant so characters and scenes live in the same visual
# universe).
SERIES_STYLE = (
    "Pixar Animation Studios signature style — production-render quality from "
    "films like Inside Out 2, Turning Red, Elemental, Luca, Soul. STRONGLY "
    "STYLIZED CARTOON RENDER, NOT photorealistic, NOT a photograph. Even "
    "though reference photos are provided, the output MUST be a fully "
    "animated cartoon — exaggerated cheerful colors, stylized simplified "
    "shapes, cartoon-proportioned furniture and objects (slightly chunky, "
    "softened edges, rounded corners), storybook-warm lighting. Colors "
    "pushed MORE SATURATED than real life, slight warmth pushed onto "
    "shadows, a touch of magical atmosphere. Everything looks like a frame "
    "from a Pixar feature film, NOT like a photograph of a real room. "
    "Physically-based shading only for the purpose of looking like Pixar "
    "CG, not to look real. Clean, vibrant, premium, warm, inviting, "
    "unmistakably animated."
)

# ───────────────────────── Scenes ──────────────────────────
# Each scene: friendly description + optional real-photo references.
# Rendered empty (no characters) so they can be composited with any
# bound character(s) in Kling.

SCENES = {
    "kitchen_morning": {
        "label": "Kitchen (morning)",
        "refs": [
            "/Volumes/Samsung500/goreadling/assets/characters/saraandeva/photos/kitchen counter top.JPG",
            str(HOUSE_DIR / "kitchen.JPG"),
            str(HOUSE_DIR / "enterence_to_kitchen.JPG"),
        ],
        "description": (
            "The family's REAL kitchen — match the layout and key features "
            "from the reference photos EXACTLY. Galley-style layout: "
            "white Shaker cabinets both sides, cream/beige tile floor in a "
            "diagonal diamond pattern, wood-toned countertops. LEFT side: a "
            "tall black fridge covered in kids' artwork, a monthly wall "
            "calendar, photos, and magnets. RIGHT side: black range + oven, "
            "stainless dishwasher, corner sink with a tall gooseneck faucet, "
            "a coffee maker and blender on the counter. BACK of the room: a "
            "breakfast nook with a round/square table, upholstered chairs, a "
            "big multi-window wall looking into the sunny backyard (green "
            "visible beyond), an industrial pendant-bulb fixture over the "
            "table. CEILING: distinctive rectangular grid-panel skylight-"
            "style fixture above the main galley. Morning light streaming in "
            "from the back window. Empty of people. Wide establishing shot "
            "from the kitchen entrance looking straight back. Cinematic "
            "Pixar rendering, warm, cozy, lived-in."
        ),
    },
    "kitchen_evening": {
        "label": "Kitchen (evening)",
        "refs": [str(HOUSE_DIR / "kitchen.JPG"), str(HOUSE_DIR / "enterence_to_kitchen.JPG")],
        "description": (
            "SAME real kitchen as the morning scene (white Shaker cabinets, "
            "diamond-pattern cream tile floor, black fridge with kids' art, "
            "black range, corner sink with gooseneck faucet, back-window "
            "breakfast nook, grid-panel ceiling light). But now at golden-"
            "hour evening: warm amber light from the back window, cozy glow "
            "from the pendant over the table, the grid-panel light softly "
            "illuminating the galley. Lived-in end-of-day warmth. Same "
            "layout, same details, different lighting. Empty of people. "
            "Pixar render."
        ),
    },
    "livingroom": {
        "label": "Living room / play room",
        "refs": [str(HOUSE_DIR / "living_room_play_room.JPG"), str(HOUSE_DIR / "dining_room.JPG")],
        "description": (
            "The family's REAL living room / play room — match the "
            "reference photo EXACTLY. LIGHT HONEY WOOD FLOOR. LEFT wall: a "
            "sliding glass door opening to green outside. CENTER: a long "
            "beige day-bed-style couch covered with a vibrant rainbow "
            "chevron crochet afghan blanket and a few cushions. In front of "
            "the couch: a dark wicker+iron rectangular coffee table with "
            "books and a small bin below. RIGHT of couch: a pink-and-white "
            "toy play kitchen (little plastic fridge + stove), a pink doll "
            "house, a wooden wicker kids' chair, a small play table. On the "
            "back wall: alphabet letter decals spelling 'ABCDEFGHIJKLMNOP-"
            "QRSTUVWXY' (with the letters 'EV' on a second row — Eva's "
            "name). A pink felt board with shapes. CENTER of the room: a "
            "circular foam cartoon play mat and a small black mini-"
            "trampoline. FAR RIGHT: the long dining table with upholstered "
            "tufted chairs just visible. Warm daylight through the window, "
            "bright and cheerful. Empty of people, Pixar render."
        ),
    },
    "livingroom_wide": {
        "label": "Open-plan main floor — living + dining + kitchen wide",
        "refs": [
            "/Volumes/Samsung500/goreadling/assets/characters/saraandeva/photos/living room dining room and kitchen.JPG",
        ],
        "description": (
            "An OPEN-FLOOR-PLAN WIDE establishing shot of the family's REAL "
            "main floor — living room in the foreground, dining room "
            "mid-frame, kitchen visible through a wide doorway opening on "
            "the right. Match the reference photo's layout EXACTLY. "
            "FOREGROUND (lower half of frame): a large CREAM/BEIGE "
            "upholstered L-SHAPED SECTIONAL COUCH facing away from camera "
            "into the room, a few soft cushions on it. LEFT side: a kid's "
            "PINK-AND-WHITE TOY STROLLER, a small PINK DOLLHOUSE on the "
            "floor, a colorful play mat. A wooden-iron RECTANGULAR COFFEE "
            "TABLE in front of the couch with kids' books and blankets. "
            "LEFT WALL: a tall SLIDING GLASS DOOR opening to the backyard "
            "(soft green visible beyond). BACK WALL center: alphabet "
            "decals spelling 'ABCDEFGHIJKLMNOPQRSTUVWXY' across the wall "
            "— Eva's learning corner. MID-FRAME: the DINING ROOM with a "
            "long FARMHOUSE-STYLE wood DINING TABLE, six tufted "
            "CREAM-BEIGE high-back upholstered chairs, and ABOVE the "
            "table a MATTE-BLACK modern SPUTNIK-STYLE CHANDELIER with "
            "exposed edison-filament bulbs. A round wall clock on the "
            "back wall. RIGHT BACKGROUND: through a wide doorway opening, "
            "the KITCHEN is visible — white Shaker cabinets, gray tile "
            "floor, a hint of countertop. FLOOR: warm LIGHT-HONEY "
            "HARDWOOD flowing seamlessly from living to dining. Lighting: "
            "bright midday DIRECTIONAL natural light raking in from the "
            "left sliding-door wall, casting LONG SOFT SHADOWS across the "
            "hardwood and the back of the sectional, with a warm ambient "
            "fill. CRITICAL RENDER STYLE: this must be Pixar 3D CG with "
            "PHYSICALLY-BASED RENDERING — volumetric daylight, proper PBR "
            "materials (realistic fabric weave with subsurface scattering "
            "on the cream sectional, micro-reflections on the hardwood "
            "with subtle parallax, depth-of-field with the dining area "
            "slightly softer in focus, ambient occlusion in the corners "
            "and under furniture, real bounce light on the ceiling). "
            "ABSOLUTELY NOT 2D anime, NOT flat cel-shaded illustration, "
            "NOT Studio Ghibli, NOT a coloring-book look. Think 'frame "
            "from Inside Out 2' or 'frame from Elemental' — full 3D depth, "
            "tangible material weight, real-world light behavior. The "
            "sectional must read as real upholstered fabric with soft "
            "folds and SSS; the chandelier bulbs must glow with real "
            "bloom. EMPTY of people. This is the canonical 'main family "
            "living space' wide establishing shot — used whenever a scene "
            "begins or transitions through the open-plan main floor."
        ),
    },
    "entry_door": {
        "label": "Entry foyer / front door (interior view)",
        "refs": [
            "/Volumes/Samsung500/goreadling/assets/characters/saraandeva/photos/entry door.JPG",
            "/Volumes/Samsung500/goreadling/assets/characters/saraandeva/photos/entry door opened.JPG",
        ],
        "description": (
            "The family's REAL entry foyer — match the reference photos "
            "EXACTLY. View from inside the house looking AT the front "
            "door. KEY FEATURES: a BRIGHT VIVID RED-PAINTED PANELLED WOODEN "
            "front door (six-panel classic colonial style with raised "
            "mouldings) — saturated cherry / candy-apple red, NOT maroon, "
            "NOT burgundy, NOT wine, NOT dark brick — clearly RED at first "
            "glance, the kind of red that says 'welcome' on a Pixar house. "
            "with a DECORATIVE-GLASS TRANSOM PANEL above it (leaded "
            "arched/floral pattern, soft sunlight glowing through), white "
            "painted door frame and trim. ABOVE/BESIDE the door area: a "
            "tall white-paned WINDOW letting warm dappled sunlight spill "
            "in onto the floor. RIGHT side of frame: a small CONSOLE "
            "TABLE / decorative cabinet against a NATURAL WOOD-PLANK "
            "ACCENT WALL (vertical reclaimed-look planks), with a small "
            "framed picture and a clock on the wall above. FLOOR: warm "
            "light-honey HARDWOOD with a patterned NAVY-AND-CREAM ORIENTAL "
            "AREA RUG just inside the doorway. Walls beyond the wood "
            "accent: clean cream/white painted drywall. Pixar feature-"
            "render style — warm welcoming foyer mood, soft natural light, "
            "cozy lived-in family-home atmosphere. Door is CLOSED in this "
            "canonical version (a separate alternate variant exists for "
            "the door-open shot showing the sunny porch beyond). EMPTY of "
            "people, ready for characters to be composited in."
        ),
    },
    "dining_room": {
        "label": "Dining room",
        "refs": [
            "/Volumes/Samsung500/goreadling/assets/characters/saraandeva/photos/kitchen table.JPG",
            str(HOUSE_DIR / "dining_room.JPG"),
            str(HOUSE_DIR / "living_room_play_room.JPG"),
        ],
        "description": (
            "The family's REAL dining room — match the reference photos "
            "EXACTLY. LONG rustic-wood farmhouse dining table with visible "
            "distressed finish, set for the family: six circular RED silky-"
            "textured placemats arranged around the table. At the center, a "
            "small bowl of fresh fruit (oranges, tulips, dark vase). Tall "
            "UPHOLSTERED CREAM-BEIGE TUFTED HIGH-BACK WINGBACK chairs "
            "around the table — six (6) IDENTICAL chairs total, all the "
            "same wingback design with curved padded shoulders flanking "
            "the head, button-tufted backrest in cream-beige linen, "
            "stained-wood tapered legs. STRICT OVERRIDE: even if the "
            "reference photo shows mixed/different chair styles (parsons, "
            "Victorian, accent, polka-dot, or differing proportions), "
            "IGNORE that mix and render ALL SIX CHAIRS AS THE SAME "
            "WINGBACK MODEL. No mismatched chair styles anywhere in the "
            "frame, no accent chairs, no Victorian, no polka-dot. "
            "Likewise the living room visible through the back doorway "
            "must have ONLY the cream sectional couch — no extra accent "
            "chairs, no lamps as foreground subjects, no clutter. "
            "ABOVE the table: a modern MATTE-BLACK rectangular cage-style "
            "chandelier with six exposed filament bulbs. Warm light honey "
            "hardwood floor. WHITE walls. BEHIND the table, visible through "
            "the open doorway: the living room with the beige sectional and "
            "the big window looking out to green trees and lawn. Warm "
            "natural light. CRITICAL RENDER STYLE: this must be Pixar 3D "
            "CG with PHYSICALLY-BASED RENDERING throughout — volumetric "
            "daylight, proper PBR materials (real wood grain on the table "
            "with subtle reflections, fabric weave with subsurface "
            "scattering on the tufted chairs, glass and metal on the "
            "chandelier with realistic bulb bloom), depth-of-field, "
            "ambient occlusion in corners and under furniture, real "
            "bounce light. THE BACKGROUND ELEMENTS (trees through the "
            "window, distant living room sectional) MUST also be full 3D "
            "with depth and perspective — NOT flat 2D anime cutouts, NOT "
            "cardboard-tree silhouettes. Trees should have volumetric "
            "leaves with light filtering through, the sectional should "
            "have real fabric folds. ABSOLUTELY NOT 2D anime, NOT flat "
            "cel-shaded illustration, NOT Studio Ghibli. Think 'frame "
            "from Pixar's Inside Out 2 dining-table scene' — full 3D "
            "depth from foreground to background, tangible material "
            "weight everywhere. Empty of people, cozy family gathering "
            "space."
        ),
    },
    "bedroom_sisters": {
        "label": "Sisters' shared bedroom",
        "refs": [str(HOUSE_DIR / "girls_bed.JPG"), str(HOUSE_DIR / "girls_closet.JPG")],
        "description": (
            "The girls' REAL shared bedroom — match the reference photo "
            "layout and colors EXACTLY. SOFT PALE-PINK/LAVENDER walls. "
            "CEILING: a large white ceiling fan with 5 blades in the "
            "middle. WINDOW on one wall with white frame and purple window "
            "valance, pale daylight coming through. BELOW window: a low "
            "radiator / AC unit under purple curtains. DARK WOOD BEDROOM "
            "SET — a tall dark-wood dresser-hutch combo against one wall, "
            "shelves with children's books and pink toy bins, a matching "
            "dark-wood twin bed with storage drawers underneath and a "
            "little trundle peeking out. A plushie in a carrier on the "
            "shelf. FAR CORNER: a small pink play kitchen stand, a plush "
            "toy, a kids' art setup. FLOOR: light gray-beige soft carpet. "
            "Kids' artwork taped to the wall. Warm, cozy, happy "
            "girls-bedroom energy. Empty of people, Pixar render."
        ),
    },
    "girls_closet": {
        "label": "Girls' closet",
        "refs": [str(HOUSE_DIR / "girls_closet.JPG")],
        "description": (
            "The girls' REAL walk-in-ish closet — match the reference photo "
            "EXACTLY. Soft PALE-PINK walls, white-framed window with purple "
            "trim on the back wall letting in daylight. A large white built-"
            "in closet organizer with wire shelves and hanging rods, filled "
            "with colorful kids' clothes on hangers — dresses, cardigans, "
            "little outfits in pastel pinks, purples, teals. Folded sweaters "
            "stacked on top shelves. ONE small white vanity-desk with a "
            "matching chair under the window — a little kids' make-"
            "believe vanity with a pink mirror/toys on top. Light gray "
            "carpet. Warm, girly, dreamy, Pixar render. Empty of people."
        ),
    },
    "backyard": {
        "label": "Backyard (with trees + play toys)",
        "refs": [str(HOUSE_DIR / "back_yard.jpeg"), str(HOUSE_DIR / "house_dron_top.png")],
        "description": (
            "The family's REAL backyard — match the reference photo layout. "
            "Mowed green grass. A black iron fence along the back boundary "
            "with taller green trees and hedges beyond it. The driveway "
            "visible faintly through trees. Kids' playthings scattered "
            "playfully on the grass: a teal kid bike on its side, a pink "
            "bike with pink streamers tipped over, a small plastic foam "
            "sword or toy wand dropped nearby, a yellow toy. A tall leafy "
            "tree in the middle of the yard catching warm afternoon light. "
            "Late-afternoon golden-hour lighting. Pixar cartoon render, "
            "EMPTY of people and animals, ready for Sara + Eva + the dogs "
            "to be composited in."
        ),
    },
    "front_house": {
        "label": "Front of house (summer)",
        "refs": [str(HOUSE_DIR / "fron_house_lemonade_stand.jpeg"), str(HOUSE_DIR / "front_fence_school_buss.jpeg")],
        "description": (
            "The family's REAL home from the street side in a sunny Pixar-"
            "cartoon-stylized summer morning. KEY FEATURES: a BLACK "
            "IRON-BAR FENCE running along the front property line with "
            "alternating tall spear-tip pickets, a concrete sidewalk in "
            "front of the fence, and a residential street. Across the "
            "street is a tall STONE RETAINING WALL with mature trees and "
            "green hillside above it (the neighbor's property is elevated). "
            "Beyond the fence inside the yard: a big leafy Japanese maple "
            "tree, a green lawn with dappled sunlight, and the two-story "
            "STONE-CLAD FAMILY HOME with black-shuttered windows and a "
            "gable roof just visible behind the tree. Utility lines cross "
            "the sky. Bright summer daylight, cheerful cartoon mood. "
            "EMPTY of people. Wide establishing shot along the sidewalk."
        ),
    },
    "front_house_spring": {
        "label": "Front of house (spring — flowers in bloom)",
        "refs": [
            "/Volumes/Samsung500/goreadling/assets/characters/saraandeva/photos/house_front.jpg",
            str(HOUSE_DIR / "front_house_spring.jpg"),
        ],
        "description": (
            "The family's REAL home from the front yard in cheerful Pixar-"
            "cartoon-stylized SPRING. Two-story home: STONE-CLAD ground floor "
            "with a deep RED FRONT DOOR, WHITE-PAINTED CLAPBOARD second floor "
            "with BLACK-SHUTTERED windows, gable shingle roof. A flagstone "
            "walkway curves up to the front door. KEY SPRING FEATURE: a big "
            "ROUND PINK-RED AZALEA SHRUB in full bloom on the lawn, plus a "
            "tall feathery JAPANESE MAPLE with new red-tipped leaves "
            "framing the left side of the composition. Lush green spring "
            "lawn, healthy hedges along the foundation, daffodils or tulips "
            "in mulched beds. Bright cheerful blue sky with a few cotton "
            "clouds. Mid-morning warm light. Empty of people. Wide "
            "establishing shot from the front lawn looking at the house. "
            "Slight artistic drift from the reference (door slightly more "
            "vibrant, shutter detail subtly different) so the rendered home "
            "is unmistakably 'the show's house' but not a 1:1 photoreal "
            "match to any real-world property. Pixar feature-render quality."
        ),
    },
    "front_house_fall": {
        "label": "Front of house (autumn)",
        "refs": [str(HOUSE_DIR / "fron_house_in_fall.jpeg")],
        "description": (
            "SAME family home as front_house but in late autumn. The two-"
            "story STONE-CLAD house with black shuttered windows sits "
            "behind the black iron fence. A large Japanese maple on the "
            "lawn is BLAZING RED-ORANGE with autumn leaves, other trees in "
            "warm amber/gold/brown. Fallen leaves scattered across the "
            "grass and sidewalk. Dramatic soft golden-hour Pixar cartoon "
            "lighting, a touch of melancholy-but-cozy autumn atmosphere. "
            "Utility lines cross a partly-cloudy sky with hints of warm "
            "sunset to one side. Empty of people, cartoon render."
        ),
    },
    "pool": {
        "label": "Backyard pool",
        "refs": [str(HOUSE_DIR / "pool.jpeg"), str(HOUSE_DIR / "house_dron_top.png")],
        "description": (
            "The family's REAL backyard pool in sunny summer Pixar-cartoon "
            "stylization. RECTANGULAR in-ground pool with a concrete "
            "surround, pale-turquoise crystal-clear water, a black iron "
            "pool fence along the back, a RED BRICK RETAINING WALL and "
            "planted green hedges along one side. A small pool ladder and "
            "blue hose in the water. Behind the pool: tall mature green "
            "trees. To the right: the corner of the family's stone/cream "
            "two-story house with a window. Bright blue sky with a few "
            "puffy clouds. Warm summer day. Empty of people and dogs, "
            "cartoon render."
        ),
    },
    "front_fence_sidewalk": {
        "label": "Front fence + sidewalk (school morning)",
        "refs": [str(HOUSE_DIR / "front_fence_school_buss.jpeg")],
        "description": (
            "The concrete SIDEWALK running along the black iron-bar front "
            "fence of the family home — the canonical 'walking to school / "
            "waiting for the school bus' setting. BLACK IRON-BAR FENCE on "
            "the LEFT with alternating spear-tip pickets, dappled morning "
            "shade from tall mature trees overhead, green lawn behind the "
            "fence. On the RIGHT: the residential street (quiet, suburban) "
            "with maybe a glimpse of a parked car across the way. Warm "
            "early-morning sun filtering through leaves, long shadows on "
            "the sidewalk. Pixar cartoon render, cheerful safe "
            "school-morning mood. Empty of people."
        ),
    },
    "house_aerial": {
        "label": "Aerial / top-down establishing of the property",
        "refs": [str(HOUSE_DIR / "house_dron_top.png")],
        "description": (
            "An aerial bird's-eye establishing shot of the family's REAL "
            "property, fully stylized as a Pixar cartoon render — like the "
            "opening shot of a Pixar feature showing the hero's home. "
            "COMPOSITION: the two-story house with a dark shingle gable "
            "roof sits in the middle-back of the property. The RECTANGULAR "
            "BLUE POOL sits on the LEFT side of the house with a small "
            "cabana/pool house. A lush green backyard with trees "
            "surrounds the house. A driveway curves around the right side "
            "with a car parked on it. The front of the property meets a "
            "residential street. Everything framed in cheerful cartoon "
            "color, a charming 'this is the family's home' hero shot. "
            "Sunny afternoon, a few little white clouds casting gentle "
            "shadows. Empty of people, Pixar render."
        ),
    },
    "front_walk": {
        "label": "Front walk (dog walks)",
        "refs": ["family_dogwalk_01.jpg", "family_dogwalk_02.jpg", "family_dogwalk_03.jpg"],
        "description": (
            "The pavement walkway in front of the family's home — a "
            "well-trimmed tall green hedge running along the right side, a "
            "smooth light-gray concrete path on the left, the neighbor's "
            "manicured lawn in the distance. The path curves gently out of "
            "frame. Warm late-morning sunshine, long soft shadows from the "
            "hedge. This is the canonical 'walking the dogs' location — the "
            "exact same path where Sara and Eva walk Ginger and Joe each "
            "episode. Pixar render, empty of people/dogs, clean establishing."
        ),
    },
    "park": {
        "label": "Neighborhood park / playground",
        "refs": [],
        "description": (
            "A cheerful neighborhood park in Pixar style. A colorful modern "
            "kids' playground at center — a bright-red slide, a teal "
            "climbing frame, yellow swings with soft rubber seats. Soft "
            "wood-chip ground cover under the play equipment. Wide mowed "
            "grass lawn around the playground, a park path curving through, "
            "a wooden bench with a small trash can next to it. A few mature "
            "shade trees in the background, a hint of other houses beyond "
            "them. Warm sunny afternoon, blue sky, a few cotton clouds. "
            "Empty of people, ready for the characters."
        ),
    },
    "bathroom": {
        "label": "Kids' bathroom",
        "refs": [],
        "description": (
            "A cheerful, kid-friendly family bathroom. A double sink with a "
            "light-wood vanity, two rainbow-colored toothbrushes in a cup, "
            "two small step stools (one pink, one lavender) in front of the "
            "sink. A large oval mirror framed in white, warm vanity lights "
            "glowing above. Soft pastel tile backsplash. A fluffy white bath "
            "mat, a freestanding tub visible to one side with colorful bath "
            "toys along the edge. Bright daylight from a frosted window. "
            "Warm, clean, safe. Pixar render, empty of people."
        ),
    },

    "bike_circle": {
        "label": "Shared driveway / bike-riding circle (kids' play space)",
        "refs": [str(HOUSE_DIR / "bike_circle_01.jpg"), str(HOUSE_DIR / "bike_circle_02.jpg")],
        "description": (
            "A wide quiet asphalt cul-de-sac / shared driveway nestled "
            "between two suburban Pennsylvania-style homes — this is the "
            "canonical 'bike circle' where Sara and Eva ride their bikes. "
            "LAYOUT: a generous open expanse of clean dark-grey asphalt in "
            "the foreground, big enough for kids to ride loops and draw "
            "with chalk. LEFT side of frame: a two-story RED-BRICK COLONIAL "
            "home with white trim, a small white-paneled garage door, a "
            "tall mature evergreen tree behind it, brick chimney. RIGHT "
            "side of frame: a two-story WHITE CLAPBOARD HOME with grey-stone "
            "lower facade and BLACK SHUTTERED windows, neat lawn out front. "
            "BACK / CENTER: tall mature deciduous trees forming a leafy "
            "green wall, a single utility wire crossing the sky. Soft "
            "manicured green lawns, mulched garden beds with low shrubs "
            "between the houses. Mid-foreground on the asphalt: a SMALL "
            "TURQUOISE CHALK SCRIBBLE / kid's chalk drawing as a hint that "
            "kids actually play here. Lighting: warm golden-hour spring "
            "evening light, low sun warming the upper-right tree canopy, "
            "soft pastel sky with subtle wispy clouds. Bright, safe, "
            "inviting suburban play space. EMPTY of people, ready for "
            "Sara and Eva to be composited in riding bikes. Slight "
            "stylization drift from the photo references (different roof "
            "color, slight house proportions) so the rendered scene reads "
            "as 'the show's neighborhood' not a 1:1 photoreal copy."
        ),
    },
    "driveway": {
        "label": "Driveway (school morning departure)",
        "refs": [
            "/Volumes/Samsung500/goreadling/assets/characters/saraandeva/photos/driveway.JPG",
            str(HOUSE_DIR / "driveway.jpeg"),
        ],
        "description": (
            "The family's REAL driveway in Pixar feature-animation style. "
            "KEY FEATURES: a curving asphalt driveway sloping down from the "
            "house out to the residential street. Two GRAY cars parked: "
            "a GRAY JEEP RUBICON (boxy off-road SUV with round headlights, "
            "removable doors style) parked higher up, and a GRAY TESLA "
            "MODEL 3 (sleek aerodynamic electric sedan) parked lower down "
            "nearer the street. A mature RED-LEAFED Japanese maple tree on "
            "the front lawn casting soft dappled shadows. Trash and "
            "recycling bins (one yellow, one dark green, one black) lined "
            "up at the curb. A child's small ORANGE bicycle propped on "
            "the kerb-edge of the lawn. Black wrought-iron fence along "
            "the property line. Stone border landscaping with a mulched "
            "garden bed. Light cream stucco/clapboard side of the house "
            "just visible top right. Tall green and copper-leaf trees in "
            "the background, sunny spring morning, golden-hour warm "
            "light. Soft Pixar lighting, no people, no pets — just the "
            "empty driveway ready to film the family heading off to school."
        ),
    },
}


# ───────────────────────── Env / API ──────────────────────────

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


def build_prompt(scene_id: str) -> str:
    s = SCENES[scene_id]
    return f"""Create a canonical BACKGROUND SCENE image for a recurring animated children's YouTube series called "Sara and Eva". This image will be used as a locked environment reference in every episode — every time the story is set in this location, the same visual look must be preserved.

SCENE: {s['label']}

DESCRIPTION:
{s['description']}

ART STYLE:
{SERIES_STYLE}

CRITICAL STYLIZATION RULE: Reference photos (if provided) show the real-life location for LAYOUT and COLOR PALETTE reference ONLY. Do NOT reproduce the photograph — fully translate it into Pixar animated-film style. The final image MUST be unmistakably a Pixar CG frame (stylized proportions, exaggerated cheerful colors, cartoon-softened shapes, storybook warmth), NOT a photograph of a real room. If someone squints at the output they should immediately think "Pixar movie," not "photograph of a house." Err on the side of MORE stylization rather than less.

IMPORTANT: No people, no characters, no dogs. This is an empty establishing background that characters will be composited over later. No text or watermarks anywhere.

Framing: wide establishing shot (16:9 aspect feel), camera at kid eye-level when possible, clean composition, subject matter centered with some breathing room. Scene should feel inviting, warm, safe, premium — matching the production quality of a flagship 2026 CG kids' YouTube series.""".strip()


def call_gemini(prompt: str, layout_refs: list[Path], style_refs: list[Path], keys: list[str]) -> bytes:
    parts: list[dict] = []

    # Style anchors first — known-good Pixar 3D renders that lock the look.
    if style_refs:
        for p in style_refs:
            parts.append(load_inline(p))
        parts.append({"text": (
            f"☝️ The above {len(style_refs)} image(s) are LOCKED STYLE ANCHORS — "
            "approved Pixar 3D feature-render frames from this same children's "
            "series. The output you generate MUST visually belong in the same "
            "movie as these anchors: identical 3D CG rendering treatment, "
            "physically-based materials and lighting, the same warm storybook "
            "color grading, the same level of stylized cartoon-realism. NEVER "
            "render in 2D anime, flat cel-shading, or Studio Ghibli look — match "
            "the anchors' full 3D feature-animation feel exactly. The anchors "
            "are NOT layout references; they are style references only."
        )})

    # Layout/photo references second — architecture and color palette only.
    if layout_refs:
        for p in layout_refs:
            parts.append(load_inline(p))
        parts.append({"text": (
            f"☝️ The above {len(layout_refs)} image(s) are LAYOUT REFERENCE PHOTOS "
            "— real-life photographs of the actual location. Use these to preserve "
            "layout, color palette, and key architectural / furniture / object "
            "features. DO NOT reproduce the photo style or photo-realism — fully "
            "translate the scene into the locked Pixar 3D style of the anchors "
            "above.\n\n" + prompt
        )})
    else:
        parts.append({"text": prompt})

    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE", "TEXT"], "temperature": 0.3},
    }
    data = json.dumps(body).encode("utf-8")

    for attempt in range(MAX_ATTEMPTS):
        key = keys[attempt % len(keys)]
        url = f"{API_BASE}/{MODEL}:generateContent?key={key}"
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}, method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
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
        print(f"  ⚠️  no image (finish={finish}{', text: ' + text[:100] if text else ''})")
        time.sleep(3)

    raise SystemExit("All retry attempts failed")


def generate_scene(scene_id: str, keys: list[str], force: bool = False) -> Path:
    if scene_id not in SCENES:
        raise SystemExit(f"Unknown scene: {scene_id} (see --list)")
    out = OUTPUT_DIR / f"{scene_id}.png"
    if out.exists() and not force:
        print(f"⏭️  cached: {out.name}")
        return out
    refs = []
    for ref_name in SCENES[scene_id]["refs"]:
        p = Path(ref_name) if ref_name.startswith("/") else PHOTO_DIR / ref_name
        if p.exists():
            refs.append(p)
    refs = refs[:MAX_REFS]
    # Style anchors: skip if THIS scene IS one of the anchors (don't reference self).
    style_refs = [
        sr for sr in STYLE_ANCHOR_REFS
        if sr.exists() and sr.name != f"{scene_id}.png"
    ]
    prompt = build_prompt(scene_id)
    print(f"🖼️  {scene_id} ({SCENES[scene_id]['label']})  layout={len(refs)} style={len(style_refs)}")
    t0 = time.time()
    data = call_gemini(prompt, refs, style_refs, keys)
    out.write_bytes(data)
    print(f"  ✅ {out.name}  ({len(data)/1024:.1f} KB, {time.time()-t0:.1f}s)")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", help="Scene id, or 'all' for every scene. Use --list to see IDs.")
    ap.add_argument("--list", action="store_true", help="List available scene IDs")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if args.list:
        for sid, s in SCENES.items():
            print(f"  {sid:<22} — {s['label']}")
        return

    if not args.scene:
        raise SystemExit("Provide --scene <id> or --scene all")

    keys = get_api_keys()
    if not keys:
        raise SystemExit("No GEMINI_API_KEY* in env")

    targets = list(SCENES) if args.scene == "all" else [args.scene]
    for sid in targets:
        generate_scene(sid, keys, args.force)


if __name__ == "__main__":
    main()
