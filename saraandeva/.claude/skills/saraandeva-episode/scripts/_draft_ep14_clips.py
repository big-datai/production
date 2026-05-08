#!/usr/bin/env python3
"""
One-off draft for ep14 clip JSONs (anniversary special). Writes 31 clip
files to content/episodes/ep14/. Re-runnable — overwrites.

Per user direction "for 1 you keep doing" — I (the agent) author each
clip prompt manually, this script just batches the writes.
"""
import json
from pathlib import Path

EP_DIR = Path("/Volumes/Samsung500/goreadling-production/saraandeva/content/episodes/ep14")
EP_DIR.mkdir(parents=True, exist_ok=True)

# Common cast lock used in many clips — kept compact, repeated where needed
CAST_LOCK_CURRENT = (
    "Cast LOCKS: "
    "@Sara: 7yo wavy dark-blonde, fair skin, brown eyes, casual home outfit (cream sweater + denim leggings). "
    "@Eva: 3yo curly bright-blonde, fair skin, brown eyes, soft-pink long-sleeve onesie. "
    "@Papa: 100% HUMAN HEAD, bald + dark beard + glasses, navy henley + dark jeans, no costumes. "
    "@Mama: straight blonde hair, fair skin, sage-green knit sweater + dark jeans, friendly warm smile."
)

CAST_LOCK_YOUNG = (
    "Cast LOCKS: "
    "@young_Papa: 100% HUMAN HEAD, bald + dark beard + glasses (10 years younger but same identity). "
    "Brown leather backpack, navy henley + olive cargo pants, small DSLR camera in right hand. "
    "@young_Mama: straight blonde hair, fair skin (10 years younger but same identity), "
    "mustard-yellow knit sweater + cream pleated skirt + ankle boots, small leather crossbody bag."
)

NEG_BASE = [
    # anti-clone / anatomy
    "duplicate character", "twin", "clone", "two of the same", "mirrored figure",
    "second sara", "two sara", "second eva", "two eva", "third child",
    "extra child in background", "ghost figure", "ghost kid", "shadow children",
    "three arms", "third arm", "extra arm", "extra hand", "floating hand",
    "anatomy error", "morphing", "flickering", "disfigured", "distorted",
    "extra face", "unstable motion",
    # passive / horror — kid show baseline
    "papa standing still", "mama standing still", "scary face",
    "frightening expression", "horror lighting", "scary monster", "blood",
    "red liquid", "dark shadows", "predatory",
    # camera bad
    "dutch angle", "handheld shake", "whip pan", "jump cut",
    # color drift on Eva
    "eva with brown hair", "eva with red hair", "eva brunette",
    # sara identity
    "sara in ponytail",
]

NEG_YOUNG_PARENTS = NEG_BASE + [
    "young papa as different person", "young mama as different person",
    "younger versions look like other people", "papa with hair on head",
    "papa not bald", "young papa with full head of hair",
]

# ─── Clip definitions ──────────────────────────────────────────────────────
# Each clip: title, subjects, scene, prompt-paragraphs, durationSec (default 10), nativeAudio (default True)

CLIPS = [
    # ─── ACT 1 — cozy couch storytelling (4 clips) ──────────────────────
    (1, {
        "title": "Anniversary day — cozy couch establishing",
        "subjects": ["Sara", "Eva", "Papa"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT,
            "Multi-shot composition. Anniversary day inside the cozy decorated living room. Twinkling fairy lights along mantel, heart-shaped balloons in cream and dusty-rose pastels, photo collage on wall, warm orange floor-lamp glow.",
            "Shot 1 (0-3s, wide eye-level, slow hand-held settle on the couch) — @Papa center sitting on the beige sectional couch, autumn-orange throw blanket over his lap, mug of hot chocolate in his right hand at chest height. @Sara curled at his left side hugging his arm, mug in her left hand. @Eva snuggled at his right side leaning against his shoulder, small mug in her hands.",
            "Shot 2 (3-7s, soft medium close-up on Papa's warm face) — @Papa's mouth SMILES softly, his eyes CRINKLE in fond memory. @Papa, gentle warm dad-voice: \"Today is a very special day, my pumpkins.\"",
            "Shot 3 (7-10s, slow pan to the small ribbon-wrapped gift box on coffee table, hold) — soft focus on the glittering ribbon, @Sara's voice off-screen: \"What's special, Papa?\"",
        ],
        "negativePrompt": NEG_BASE + ["mom in scene", "mama in scene"],
    }),

    (2, {
        "title": "AUDIENCE-ASK 1 — what does anniversary mean?",
        "subjects": ["Sara", "Eva", "Papa"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT,
            "Continuity from clip 1 closing frame: Papa center, Sara left, Eva right on couch.",
            "Shot 1 (0-4s, MCU OTS over Sara's shoulder to Papa) — @Papa turns slightly toward Sara, his right HAND GENTLY RESTS on her cushion. @Papa, warm: \"It means Mama and I have been together for TEN years today.\"",
            "Shot 2 (4-7s, close on Sara's curious face, then quick cut to Eva) — @Sara's eyebrows LIFT, her HEAD TILTS. @Sara: \"What does anniversary MEAN?\" @Eva looks up at Papa, her tiny finger TAPS her chin.",
            "Shot 3 (7-10s, audience-ask camera-ask, soft direct-to-camera) — @Sara turns slightly to camera with a curious little smile. @Sara, to camera: \"Did YOU know what an anniversary is?\"",
        ],
        "negativePrompt": NEG_BASE + ["mom in scene"],
    }),

    (3, {
        "title": "Story setup — Eva: 'How did you meet Mom?'",
        "subjects": ["Sara", "Eva", "Papa"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT,
            "Shot 1 (0-3s, soft medium on couch) — @Papa, with warm storyteller voice: \"It means we celebrate the day we became a family. Mama and I met TEN years ago...\"",
            "Shot 2 (3-7s, push in on Eva's wide curious eyes) — @Eva's HEAD TILTS, her HANDS CUP under her chin in classic kid storytelling posture. @Eva, squeaky toddler voice: \"How did you MEET Mama, Papa?\"",
            "Shot 3 (7-10s, slow dolly push toward Papa's smiling face) — @Papa's eyes GO SOFT remembering, his smile WIDENS. @Papa, almost whispering: \"It started in a little cafe, very far away...\"",
        ],
        "negativePrompt": NEG_BASE + ["mom in scene"],
    }),

    (4, {
        "title": "Transition — hot chocolate steam dissolves into flashback",
        "subjects": ["Papa"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT,
            "Shot 1 (0-4s, extreme close-up on Papa's mug, steam rising) — soft golden lamp glow on the steam. The steam SWIRLS upward.",
            "Shot 2 (4-10s, dreamy slow zoom into the steam, focus pulls to soft white blur) — the steam gently DISSOLVES into a soft sepia-warm haze, suggesting we are entering a memory. Soft transition: the white haze CLEARS to reveal a charming European cobblestone street with autumn maple leaves drifting gently down.",
        ],
        "negativePrompt": NEG_BASE + ["sara in scene", "eva in scene", "mama in scene"],
    }),

    # ─── ACT 2 — flashback love story (20 clips) ────────────────────────
    (5, {
        "title": "FLASHBACK — Dad walking cobblestone street with backpack",
        "subjects": ["young_Papa"],
        "scene": "ep14-cafe-mams-country",
        "prompt": [
            CAST_LOCK_YOUNG,
            "Shot 1 (0-4s, wide low-angle on cobblestone street, soft autumn) — @young_Papa walking toward camera down the cobblestone street, brown leather backpack on his shoulders, small DSLR camera in his right hand at hip. Autumn maple leaves drifting from above. Charming European cafe storefronts framing both sides, warm afternoon light.",
            "Shot 2 (4-7s, MCU eye-level, slow tracking dolly with him) — @young_Papa's HEAD TURNS slightly to look at a cafe sign, mouth SMILES. He pauses.",
            "Shot 3 (7-10s, soft over-the-shoulder, camera looks at the cafe entrance) — @young_Papa's right HAND REACHES for the brass door handle of the cafe, the warm interior light glows through the window.",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["other people on street", "background pedestrians"],
    }),

    (6, {
        "title": "FLASHBACK — Dad enters cafe, sees Mom reading at corner table",
        "subjects": ["young_Papa", "young_Mama"],
        "scene": "ep14-cafe-mams-country",
        "prompt": [
            CAST_LOCK_YOUNG,
            "Shot 1 (0-3s, wide eye-level inside cafe) — @young_Papa enters through the door (left frame), warm wood interior with hanging brass pendants over marble tables. @young_Mama sitting at the corner window table (right frame), reading a paperback book, mug of coffee beside her.",
            "Shot 2 (3-6s, MCU on @young_Mama at her table) — @young_Mama's eyes STAY on her book but her mouth softens — @young_Papa just walked in. She doesn't look up yet.",
            "Shot 3 (6-10s, slow push-in on @young_Papa pausing) — @young_Papa stops mid-step, his HEAD TURNS toward @young_Mama at the corner table. His mouth FALLS slightly open. He smiles. He starts walking toward her table.",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["other cafe customers", "background patrons"],
    }),

    (7, {
        "title": "FLASHBACK — first conversation at cafe",
        "subjects": ["young_Papa", "young_Mama"],
        "scene": "ep14-cafe-mams-country",
        "prompt": [
            CAST_LOCK_YOUNG,
            "Shot 1 (0-4s, soft MCU on @young_Mama looking up) — @young_Mama's HEAD LIFTS from her book, her eyes MEET @young_Papa standing beside her table with backpack still on. Her mouth SMILES wide warm and friendly.",
            "Shot 2 (4-7s, OTS over @young_Mama's shoulder to @young_Papa) — @young_Papa's right HAND GESTURES at the empty chair across from her with a polite questioning look. @young_Papa, warm friendly: \"Is anyone sitting here?\"",
            "Shot 3 (7-10s, two-shot at the table, both seated) — @young_Mama gestures yes, @young_Papa sets his backpack down and sits. Their eyes hold contact across the table. @young_Mama's mouth SOFTENS into a long warm smile.",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["other cafe customers"],
    }),

    (8, {
        "title": "FLASHBACK — phone number on coffee receipt",
        "subjects": ["young_Papa", "young_Mama"],
        "scene": "ep14-cafe-mams-country",
        "prompt": [
            CAST_LOCK_YOUNG,
            "Shot 1 (0-4s, close-up on @young_Mama's right HAND writing) — @young_Mama's right HAND HOLDS a small pencil, her fingers slowly WRITE a phone number on the white paper coffee receipt on the marble table. Her left HAND HOLDS the receipt steady. The pencil tip moves softly.",
            "Shot 2 (4-7s, OTS as @young_Mama slides receipt across table) — @young_Mama's hand GENTLY SLIDES the receipt across the marble table to @young_Papa. @young_Mama, a soft kind voice: \"If you ever come back...\"",
            "Shot 3 (7-10s, two-shot, @young_Papa receives the receipt) — @young_Papa's right HAND TAKES the receipt carefully, he looks down at the number and his mouth SMILES wide. @young_Papa: \"I will. I promise.\"",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS,
    }),

    (9, {
        "title": "FLASHBACK — Dad at airport flying home, clutching receipt",
        "subjects": ["young_Papa"],
        "scene": "ep14-cafe-mams-country",
        "prompt": [
            CAST_LOCK_YOUNG,
            "Shot 1 (0-4s, wide soft-blue airport gate area, large window with planes outside) — @young_Papa sitting in a row of empty waiting chairs, brown backpack at his feet, his right HAND HOLDS the small folded coffee receipt at chest height. He looks down at the receipt with a soft smile.",
            "Shot 2 (4-7s, push-in MCU on the receipt in his hand) — the receipt has a phone number written in soft pencil, very visible.",
            "Shot 3 (7-10s, slow pull back, @young_Papa looks out the airport window thoughtfully) — @young_Papa's HEAD TURNS toward the airport window, his mouth SOFTENS into a private smile. The airplane silhouette is visible outside.",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["other airport passengers", "background travelers"],
    }),

    (10, {
        "title": "FLASHBACK — phone calls montage, split screen",
        "subjects": ["young_Papa", "young_Mama"],
        "scene": "ep14-cafe-mams-country",
        "prompt": [
            CAST_LOCK_YOUNG,
            "Multi-shot montage. Split-screen design — @young_Papa LEFT half of frame, @young_Mama RIGHT half of frame, both holding mobile phones to their ears.",
            "Shot 1 (0-3s, split — Papa left in his apartment looking out city window night, Mama right in her cozy kitchen daytime) — both LAUGH simultaneously, @young_Papa's mouth WIDENS in laugh, @young_Mama's HEAD TILTS BACK in laugh.",
            "Shot 2 (3-7s, time passes — same split, different outfits, different time of day, both still on phones) — @young_Papa's hand HOLDS phone, big smile. @young_Mama's hand TWIRLS hair, big smile.",
            "Shot 3 (7-10s, final split, both look down at phones with fond expressions) — @young_Papa's mouth SMILES softly. @young_Mama's mouth SMILES softly.",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["other people in apartment", "other people in kitchen"],
    }),

    (11, {
        "title": "PARENT-ACTIVITY — Dad at airport waiting with flowers, Mama runs to him",
        "subjects": ["young_Papa", "young_Mama"],
        "scene": "ep14-cafe-mams-country",
        "durationSec": 15,
        "prompt": [
            CAST_LOCK_YOUNG,
            "Setting: airport arrivals hall, soft afternoon light, large glass windows. @young_Papa standing center-frame holding a small bouquet of pink-and-white peonies in his right HAND.",
            "Shot 1 (0-4s, wide eye-level) — @young_Papa stands waiting, his eyes SCAN the arrivals doors. His left HAND ADJUSTS his collar in a small nervous gesture.",
            "Shot 2 (4-9s, parent-active 15s — Mama runs to him) — @young_Mama appears through the arrivals door (small wheeled suitcase behind her). Her HEAD LIFTS, her eyes WIDEN with joy seeing @young_Papa, her LEGS RUN forward toward him. @young_Papa's right ARM RAISES the bouquet, his left ARM EXTENDS open in welcome. @young_Mama RUNS into his hug, his ARMS WRAP around her, her HANDS GRIP his shoulders.",
            "Shot 3 (9-15s, MCU on the hug, slow swirl-pan around them) — @young_Papa's mouth KISSES the top of @young_Mama's head, @young_Mama's HEAD LIFTS smiling huge happy. The peonies are slightly crushed between them. @young_Papa, gentle: \"You're here.\"",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["other airport passengers"],
    }),

    (12, {
        "title": "GERMANY ROAD TRIP — autumn convertible, castle on hill",
        "subjects": ["young_Papa", "young_Mama"],
        "scene": "ep14-german-autumn-road",
        "prompt": [
            CAST_LOCK_YOUNG,
            "Shot 1 (0-4s, wide low-angle aerial-ish on the cobblestone autumn road) — small open cream-colored vintage convertible driving along the cobblestone road through south-German autumn vineyards. @young_Papa driving (left side of car, his hands on the steering wheel), @young_Mama in passenger seat next to him, her hair WHIPPING in the wind. Bavarian-style castle on the hilltop in soft background.",
            "Shot 2 (4-7s, MCU on @young_Mama in the convertible, slow tracking) — @young_Mama's HEAD TURNS to look at the castle, her right ARM POINTS up toward the castle, her mouth GASPS happy. @young_Papa's right HAND GESTURES toward the castle in agreement.",
            "Shot 3 (7-10s, two-shot in the convertible, both laughing) — @young_Papa's HEAD GLANCES at @young_Mama with adoring smile. @young_Mama's mouth LAUGHS, her hand TUCKS hair behind her ear.",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["other cars on road"],
    }),

    (13, {
        "title": "ROME — Colosseum + gelato",
        "subjects": ["young_Papa", "young_Mama"],
        "scene": "ep14-rome-colosseum",
        "prompt": [
            CAST_LOCK_YOUNG,
            "Shot 1 (0-4s, wide eye-level, sunny afternoon Rome) — @young_Papa and @young_Mama walking arm-in-arm in front of the Roman Colosseum. Each holds a small gelato cone in their free hand. @young_Mama's gelato is pink-strawberry, @young_Papa's is pistachio-green.",
            "Shot 2 (4-7s, MCU on @young_Mama tasting gelato) — @young_Mama's mouth SMILES wide as her tongue LICKS the gelato cone. Her eyes SPARKLE.",
            "Shot 3 (7-10s, two-shot, @young_Papa offers his cone) — @young_Papa offers his pistachio gelato to @young_Mama, his right HAND EXTENDS the cone. @young_Mama's mouth LAUGHS, she leans in and takes a tiny lick. @young_Papa, playful: \"Best gelato in Roma!\"",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["tourist crowds", "background pedestrians"],
    }),

    (14, {
        "title": "BULGARIA — first skis, snowy slope",
        "subjects": ["young_Papa", "young_Mama"],
        "scene": "ep14-bulgaria-ski-slope",
        "prompt": [
            CAST_LOCK_YOUNG,
            "Both wearing winter ski gear over their identity-locked outfits (puffy ski jackets, ski pants, helmets, goggles up on forehead, ski poles in hands).",
            "Shot 1 (0-4s, wide pull-back on snowy beginner slope) — @young_Mama at center frame on skis, knees BENT, her ARMS OUT for balance, slightly wobbly. @young_Papa next to her on his own skis, his left HAND HOLDS her right hand to help her stay upright.",
            "Shot 2 (4-7s, MCU on @young_Mama's nervous-but-laughing face) — @young_Mama's mouth LAUGHS nervously, her eyes WIDEN. @young_Mama, giggling: \"I'm doing it! I'm SKIING!\"",
            "Shot 3 (7-10s, soft pan to @young_Papa) — @young_Papa's mouth GRINS proud, his right HAND THUMBS-UP encouragingly. @young_Papa, encouraging: \"Look at you GO!\"",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["other skiers on slope", "ski instructor"],
    }),

    (15, {
        "title": "DISNEYLAND PARIS — Mom's lifelong dream, emotional payoff",
        "subjects": ["young_Papa", "young_Mama"],
        "scene": "ep14-disney-paris-castle",
        "prompt": [
            CAST_LOCK_YOUNG,
            "Both wearing iconic black mouse-ear headbands over their identity-locked outfits. Sleeping Beauty Castle in the background, golden-hour sky lit with soft fireworks.",
            "Shot 1 (0-3s, low-angle wide on the castle with fireworks) — @young_Papa standing center-left, @young_Mama center-right, both looking up at the castle with awe. Their HANDS HOLD between them.",
            "Shot 2 (3-6s, push-in on @young_Mama's face) — @young_Mama's eyes SLOWLY FILL with tears of joy, her mouth OPENS in a soft gasp, her HAND COVERS her mouth. @young_Mama, whispering: \"I... I can't believe it...\"",
            "Shot 3 (6-10s, OTS on @young_Papa watching her) — @young_Papa's mouth SMILES adoringly, his right ARM WRAPS around her shoulders, his head TILTS to rest on top of hers. @young_Papa, soft: \"It was always your dream. Today I made it come true.\"",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["other tourists at disney", "park crowds", "park staff"],
    }),

    (16, {
        "title": "WEDDING DAY — happy tears at altar",
        "subjects": ["young_Papa", "young_Mama"],
        "scene": "ep14-wedding-chapel",
        "prompt": [
            CAST_LOCK_YOUNG,
            "Wedding outfits: @young_Papa in a charcoal suit with white shirt + soft cream tie. @young_Mama in a simple flowing white wedding dress with delicate lace neckline + small floral hair pin in her hair. Both at the altar of the small stone chapel.",
            "Shot 1 (0-4s, wide medium on the couple at altar) — @young_Papa center-left, @young_Mama center-right, both holding hands facing each other. Soft afternoon light through stained glass.",
            "Shot 2 (4-7s, MCU on @young_Mama with happy tears) — @young_Mama's eyes FILL with tears, her mouth SMILES through them. Her right HAND SQUEEZES @young_Papa's left HAND.",
            "Shot 3 (7-10s, OTS over @young_Mama's shoulder to @young_Papa) — @young_Papa's eyes GLOSS WET, his mouth SOFT happy smile. @young_Papa: \"I do.\" @young_Mama, soft tear-laugh: \"I do too.\"",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["wedding guests", "officiant", "other people"],
    }),

    (17, {
        "title": "AUDIENCE-ASK 2 — has YOUR family been on a big trip?",
        "subjects": ["Sara", "Eva", "Papa"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT,
            "Brief return to present-day couch — Papa is mid-story.",
            "Shot 1 (0-3s, MCU on Papa storyteller pose) — @Papa, soft remembering: \"It was Mama's biggest dream...\" His mouth WIDENS in nostalgic smile.",
            "Shot 2 (3-7s, both girls listening intently, then Sara turns to camera) — @Sara's HEAD TILTS curious. @Eva's HEAD TILTS too. @Sara turns slightly to camera with wide curious eyes.",
            "Shot 3 (7-10s, audience-ask camera-direct) — @Sara, to camera: \"Has YOUR family ever been on a big trip?\" @Eva nods enthusiastically beside her.",
        ],
        "negativePrompt": NEG_BASE,
    }),

    (18, {
        "title": "MOM'S BIRTHDAY — cake + candles",
        "subjects": ["young_Papa", "young_Mama"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_YOUNG,
            "An older flashback styling — soft warm interior of their first home (could be any cozy apartment), birthday balloons in pastels, small round table with a chocolate birthday cake topped with lit candles in the middle.",
            "Shot 1 (0-4s, wide medium, both at the table) — @young_Mama sitting at the table, her HANDS CLASPED in front of cake, mouth EXHALES SOFTLY at the lit candles. @young_Papa standing behind her left shoulder, watching with adoring smile. A small ribbon-wrapped gift box sits on the table next to the cake.",
            "Shot 2 (4-7s, MCU on @young_Mama blowing candles) — @young_Mama's lips PURSE, she BLOWS softly across the cake. The candles FLICKER and one by one go out.",
            "Shot 3 (7-10s, OTS to @young_Papa, who SMILES AND LIFTS the gift box toward her) — @young_Papa's right HAND GENTLY PICKS UP the gift box and slides it forward toward @young_Mama. The box is small, has soft holes on top, and a slight movement inside.",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["birthday party guests"],
    }),

    (19, {
        "title": "PUPPY JOE GIFT — Mom gasps, Joe peeks out",
        "subjects": ["young_Papa", "young_Mama", "puppy_Joe"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_YOUNG + " @puppy_Joe: 2-month-old fluffy cream-and-gold Pomeranian puppy with oversized ears and bright button eyes. Sitting inside the open gift box with a yellow satin ribbon, looking up curiously.",
            "Shot 1 (0-3s, OTS over @young_Mama's shoulder to the box) — @young_Mama's HANDS REACH for the gift box, her fingers SLOWLY UNTIE the satin ribbon.",
            "Shot 2 (3-6s, MCU on the box opening) — @young_Mama lifts the lid. @puppy_Joe's tiny fluffy face POPS UP from inside the box, his ears OVERSIZED, his eyes BRIGHT. His tail wags inside the box.",
            "Shot 3 (6-10s, MCU on @young_Mama's reaction) — @young_Mama's mouth GASPS open big, her HANDS COVER her mouth in shock. Her eyes FILL with tears of joy. @young_Mama: \"OH MY GOODNESS!\" @young_Papa SMILES proud beside her. @puppy_Joe yips a tiny puppy yip from the box.",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["adult joe", "full-size pomeranian", "other dogs", "scary box reveal"],
    }),

    (20, {
        "title": "TRAVEL WITH JOE — Joe peeking from carry bag at landmark",
        "subjects": ["young_Papa", "young_Mama", "Joe"],
        "scene": "ep14-rome-colosseum",
        "prompt": [
            CAST_LOCK_YOUNG + " @Joe: adult fluffy cream-and-gold Pomeranian (now grown up from puppy version).",
            "Shot 1 (0-4s, wide medium, both at a generic European landmark) — @young_Papa and @young_Mama walking together at a sunny European piazza, @young_Mama carrying a soft pet carrier bag over her shoulder. @Joe's fluffy face PEEKS OUT from the top of the carrier, his tongue OUT panting happy.",
            "Shot 2 (4-7s, MCU on @Joe in the carrier) — @Joe's HEAD TURNS to look at the landmark, his ears PERK UP, his tongue OUT. He looks like a tiny travel mascot.",
            "Shot 3 (7-10s, two-shot, all three smiling) — @young_Papa's left HAND PETS @Joe's head through the carrier opening, @young_Mama's mouth LAUGHS happy.",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["puppy joe in this clip", "tiny puppy", "joe in costume", "other dogs"],
    }),

    (21, {
        "title": "PARENT-ACTIVITY — baby Sara is born, hospital",
        "subjects": ["young_Papa", "young_Mama", "baby_Sara"],
        "scene": "ep14-hospital-birth-room",
        "durationSec": 15,
        "prompt": [
            CAST_LOCK_YOUNG + " @baby_Sara: newborn baby (less than 1 day old), wavy dark-blonde wisps already showing on her tiny head, brown eyes closed sleeping, swaddled in soft pink-with-clouds blanket.",
            "Shot 1 (0-4s, wide soft pastel hospital recovery room) — @young_Mama in hospital bed in a soft white nightgown, holding @baby_Sara to her chest. @young_Papa sits on the edge of the bed beside her, his right HAND GENTLY TOUCHING @baby_Sara's tiny head.",
            "Shot 2 (4-9s, soft MCU on the new family) — @young_Mama's mouth SMILES exhausted-happy, her eyes FULL of tears of joy. @young_Papa's mouth WHISPERS soft, his ARM AROUND @young_Mama's shoulders. @baby_Sara softly STIRS in her swaddle, her tiny FIST UNCURLS once.",
            "Shot 3 (9-15s, slow push-in tight on @baby_Sara's face) — @baby_Sara's eyes SLOWLY OPEN for the first time. @young_Mama, whispered: \"Hi, little Sara.\" @young_Papa, soft warm tears in voice: \"Welcome to the world.\"",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["medical instruments visible", "other babies", "hospital staff", "scary hospital"],
    }),

    (22, {
        "title": "Sara as toddler, first steps with Joe",
        "subjects": ["baby_Sara", "Joe", "young_Mama", "young_Papa"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_YOUNG + " @baby_Sara: 1-2yo toddler, wavy dark-blonde hair growing in, lavender top + white tights + tiny shoes, big curious brown eyes, wobbly legs. @Joe: adult Pomeranian.",
            "Shot 1 (0-4s, wide medium on cozy living room floor) — @young_Mama kneeling on the floor at left, her ARMS OUT in catch-position. @young_Papa kneeling at right, also ARMS OUT. @baby_Sara stands in the middle on wobbly legs. @Joe sits at @baby_Sara's left side, looking up at her supportively.",
            "Shot 2 (4-7s, MCU on @baby_Sara taking first step) — @baby_Sara's right LEG STEPS forward bravely, her tiny ARMS OUT for balance, mouth GIGGLES happy. @Joe's tail WAGS faster.",
            "Shot 3 (7-10s, soft wide back to two parents catching her) — @baby_Sara wobble-runs into @young_Mama's open ARMS. @young_Papa's CLAPS in encouragement. @Joe LICKS @baby_Sara's hand once. @young_Mama, joyful: \"You did it, Sara!\"",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["puppy joe", "tiny puppy"],
    }),

    (23, {
        "title": "Baby Eva is born, Sara meets her in crib",
        "subjects": ["baby_Sara", "baby_Eva", "young_Mama"],
        "scene": "ep14-hospital-birth-room",
        "prompt": [
            CAST_LOCK_YOUNG + " @baby_Sara: 2yo toddler at this point, lavender top, big curious eyes. @baby_Eva: newborn baby (less than 1 day old), curly bright-blonde tufts already showing, brown eyes closed sleeping, swaddled in soft yellow blanket.",
            "Shot 1 (0-4s, wide soft pastel hospital room) — @young_Mama in hospital bed holding @baby_Eva. @baby_Sara on tiptoes at the edge of the bed peeking over the blanket at her new baby sister.",
            "Shot 2 (4-7s, MCU on @baby_Sara's curious face) — @baby_Sara's eyes WIDEN, her mouth FORMS a tiny O of wonder. @baby_Sara, soft toddler whisper: \"Baby!\"",
            "Shot 3 (7-10s, soft three-shot, sisters meet) — @baby_Sara's right tiny HAND GENTLY TOUCHES @baby_Eva's swaddle. @baby_Eva STIRS, tiny mouth YAWNS. @young_Mama's mouth SMILES adoringly. @young_Mama, soft: \"This is your baby sister, Eva.\"",
        ],
        "negativePrompt": NEG_YOUNG_PARENTS + ["other babies", "hospital staff", "young papa"],
    }),

    (24, {
        "title": "Ginger joins family — adoption / arrival",
        "subjects": ["Sara", "Eva", "Ginger", "Mama", "Papa"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT + " @Ginger: 4yo Jack Russell, white-and-tan, friendly bouncy posture, NOT a puppy.",
            "Shot 1 (0-4s, wide medium in cozy living room) — @Mama kneeling at left holding a soft blanket, @Papa standing center, @Sara (about 5yo here) at right, @Eva (about 1yo here, in @Mama's lap). @Ginger trotting through the doorway center toward the family, tail WAGGING wildly.",
            "Shot 2 (4-7s, MCU on @Ginger's joyful face approaching) — @Ginger's mouth SMILES open-tongue happy. Her LEGS RUN. She's clearly the new family addition.",
            "Shot 3 (7-10s, soft group hug) — @Ginger LANDS in @Sara's open arms. @Sara LAUGHS hard. @Eva's tiny hand REACHES from @Mama's lap to pet @Ginger's head. @Papa's mouth SMILES warm. @Papa: \"Welcome home, Ginger.\"",
        ],
        "negativePrompt": NEG_BASE + ["puppy ginger", "tiny ginger", "young mama", "young papa", "joe in this clip"],
    }),

    # ─── ACT 3 — present anniversary surprise (4 clips) + AUDIENCE-ASK 3 in clip 28
    (25, {
        "title": "BACK TO PRESENT — Sara: 'What's your gift this year?'",
        "subjects": ["Sara", "Eva", "Papa"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT,
            "Back to present-day cozy living-room couch (same as Act 1).",
            "Shot 1 (0-4s, soft MCU on the couch) — @Papa, finishing the story: \"...and that's how our family came to be.\" His mouth SMILES warm.",
            "Shot 2 (4-7s, push-in on @Sara) — @Sara's HEAD TILTS curious, her right HAND tugs gently on @Papa's sleeve. @Sara: \"What are you giving Mama THIS year?\"",
            "Shot 3 (7-10s, OTS on @Papa with knowing twinkle) — @Papa's eyes SPARKLE conspiratorially, his mouth WIDENS. @Papa, whispering like a secret: \"Something VERY special...\"",
        ],
        "negativePrompt": NEG_BASE + ["mom in scene", "young papa", "young mama"],
    }),

    (26, {
        "title": "CAMERA REVEAL — Papa shows new video camera",
        "subjects": ["Sara", "Eva", "Papa"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT,
            "Shot 1 (0-3s, MCU on @Papa lifting the small ribbon-wrapped gift box from coffee table) — @Papa's HANDS LIFT the small box, his fingers UNTIE the ribbon.",
            "Shot 2 (3-7s, push-in on the camera reveal) — Inside the box, a sleek black-and-silver mirrorless VIDEO CAMERA with a soft cream lens cap. @Sara's mouth GASPS open, @Eva's eyes WIDEN huge.",
            "Shot 3 (7-10s, soft three-shot all admiring camera) — @Sara's right HAND POINTS at the camera. @Sara, excited: \"It's a CAMERA!\" @Papa's mouth SMILES proud. @Papa: \"Mama LOVES making videos and helping people work out the right way. This is for her to share more with the world.\"",
        ],
        "negativePrompt": NEG_BASE + ["mom in scene"],
    }),

    (27, {
        "title": "AUDIENCE-ASK 3 + wrap the gift",
        "subjects": ["Sara", "Eva", "Papa"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT,
            "Shot 1 (0-4s, MCU on the gift box being wrapped) — @Papa's hands GENTLY PLACE the camera back in the box, @Sara's hands HOLD the ribbon, @Eva's tiny hand PATS the lid down. They wrap together.",
            "Shot 2 (4-7s, MCU on the wrapped box, fairy lights twinkling) — finished wrapped box on the coffee table.",
            "Shot 3 (7-10s, audience-ask direct-to-camera) — @Sara turns to camera with conspiratorial smile, finger over lips like 'shhh'. @Sara, to camera: \"What's the BEST gift YOU ever gave someone? Tell us!\"",
        ],
        "negativePrompt": NEG_BASE + ["mom in scene"],
    }),

    (28, {
        "title": "MOM COMES HOME — surprise reveal",
        "subjects": ["Sara", "Eva", "Mama", "Papa", "Joe", "Ginger"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT + " @Joe: adult Pomeranian. @Ginger: Jack Russell.",
            "Shot 1 (0-3s, wide low-angle on the entryway, family hidden) — Front door OPENS, @Mama enters in her work outfit (gym leggings + workout top, gym bag over shoulder). She steps inside.",
            "Shot 2 (3-6s, push-in on @Mama's face as she sees the decorated room) — @Mama's HEAD LIFTS, her eyes WIDEN, her HAND COVERS her mouth.",
            "Shot 3 (6-10s, family jumps out of hiding behind couch) — @Sara, @Eva, @Papa POP UP from behind the couch with arms wide open. @Joe RUNS forward wagging tail. @Ginger BOUNCES at @Mama's feet. ALL TOGETHER, joyful: \"SURPRISE! HAPPY ANNIVERSARY!\"",
        ],
        "negativePrompt": NEG_BASE + ["young mama", "young papa", "mama with camera"],
    }),

    (29, {
        "title": "MAMA UNWRAPS CAMERA — happy tears, family hug",
        "subjects": ["Sara", "Eva", "Mama", "Papa", "mama_with_camera"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT,
            "Cast addition: @mama_with_camera is the same Mama mid-gasp holding the new mirrorless video camera in both hands at chest height — used for shots 2/3 only. @Mama (her standard form) used for shot 1.",
            "Shot 1 (0-3s, MCU on @Mama unwrapping the gift box at the coffee table) — @Mama kneeling at the coffee table, her HANDS UNTIE the ribbon, her mouth STILL SMILES from surprise.",
            "Shot 2 (3-6s, push-in on @mama_with_camera reveal) — @mama_with_camera holding the new black-and-silver video camera in both hands at chest height. Her mouth GASPS open, her eyes FILL with happy tears. @mama_with_camera, voice trembling joy: \"You... you got me a CAMERA!\"",
            "Shot 3 (6-10s, soft wide family hug) — @Mama returns to her standard form. Whole family GROUP HUGS on the couch — @Papa wraps arms around @Mama, @Sara hugs from one side, @Eva hugs from other, all smiling and emotional.",
        ],
        "negativePrompt": NEG_BASE + ["young mama", "young papa", "joe in this clip", "ginger in this clip"],
    }),

    # ─── MUSIC BLOCK — Sara + Eva sing happy anniversary (2 letter clips, looped) ──
    ("A", {
        "title": "MUSIC VIDEO A — Sara at piano + Eva singing into mic, parents watching",
        "subjects": ["Sara", "Eva", "Mama", "Papa"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT,
            "Shot 1 (0-10s, wide low-angle eye-level, slow hand-held settle, hold composition for clean loop) — @Sara sitting at a small upright piano center-left, her HANDS GENTLY ON KEYS playing softly. @Eva standing center-right beside Sara holding a small handheld microphone. Both girls SINGING — mouths shape lyrics softly. @Mama and @Papa sitting on the couch in soft background watching with their HANDS HELD, Mama with happy tears on her cheeks, Papa with soft smile. Twinkling fairy lights all around. Slow camera drift left-to-right for cinematic loop. NO LIP-SYNC required (Suno song will be overlaid in post). Static formation, no character moves position.",
        ],
        "negativePrompt": NEG_BASE + ["singing along to specific words", "papa standing still", "joe in this clip", "ginger in this clip"],
    }),
    ("B", {
        "title": "MUSIC VIDEO B — family slow-dance hug during chorus, dogs at feet",
        "subjects": ["Sara", "Eva", "Mama", "Papa", "Joe", "Ginger"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT + " @Joe: adult Pomeranian (no costume — everyday). @Ginger: Jack Russell (no costume).",
            "Shot 1 (0-10s, wide medium eye-level, slow circular dolly around family, designed to LOOP cleanly) — Family slow-dancing on the cozy living-room rug. @Mama and @Papa center holding each other, gently SWAYING side-to-side. @Sara holding @Mama's free hand at left, @Eva holding @Papa's free hand at right. All four softly SWAY in one connected dance. @Joe and @Ginger sit at parents' feet watching contentedly. Twinkling fairy lights all around, golden lamp glow. Slow circular camera move (camera circles around the family). NO LIP-SYNC required. Static formation, slow continuous gentle sway only.",
        ],
        "negativePrompt": NEG_BASE + ["fast dancing", "spinning", "characters separating", "papa standing still"],
    }),

    # ─── FINAL CLIFFHANGER — AUDIENCE-ASK 4 ───────────────────────────────
    (30, {
        "title": "FINAL CLIFFHANGER — camera-ask: what's YOUR favorite memory?",
        "subjects": ["Sara", "Eva", "Mama", "Papa"],
        "scene": "ep14-anniversary-living-room",
        "prompt": [
            CAST_LOCK_CURRENT,
            "Shot 1 (0-3s, soft medium on couch all four together) — @Mama leans against @Papa's shoulder, both girls between them. All four SMILE happy.",
            "Shot 2 (3-7s, slow push-in on @Sara turning to camera) — @Sara's HEAD TURNS toward camera, her mouth SMILES wide direct-to-audience.",
            "Shot 3 (7-10s, audience-ask camera-direct, final cliffhanger) — @Sara, to camera: \"What's YOUR favorite family memory? Tell us in the comments!\" @Eva waves goodbye to camera, mouth SMILES big.",
        ],
        "negativePrompt": NEG_BASE + ["young versions", "joe", "ginger"],
    }),
]

# ─── Write each clip JSON ──────────────────────────────────────────────────
for clip_id, body in CLIPS:
    out_path = EP_DIR / f"{clip_id}.json"
    spec = {
        "episode": 14,
        "beat": clip_id,
        "clip": clip_id,
        "title": body["title"],
        "mode": "omni",
        "durationSec": body.get("durationSec", 10),
        "quality": "720p",
        "nativeAudio": body.get("nativeAudio", True),
        "expectedCredits": 90,
        "subjects": body["subjects"],
        "scene": body["scene"],
        "boundElements": [{"tag": s, "source": "library"} for s in body["subjects"]] + (
            [{"tag": body["scene"], "source": "library"}] if body.get("scene") else []
        ),
        "prompt": body["prompt"],
        "negativePrompt": body["negativePrompt"],
    }
    out_path.write_text(json.dumps(spec, indent=2, ensure_ascii=False) + "\n")
    print(f"  ✓ {out_path.name}")

print(f"\n{len(CLIPS)} clip JSONs written to {EP_DIR}")
