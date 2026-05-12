#!/usr/bin/env python3
"""Materialize 22 clip JSON files for ep16 "The Tooth Fairy's Big Mistake!"

Per Pattern Z (R21) + R14/R19/R22/E1/E9 compliance:
  - Every bare-name reference uses @Char prefix (binding form)
  - Drop "Cast LOCKS:" section (R14)
  - nativeAudio=true clips include explicit dialogue OR silence directive (R19)
  - Every subject gets ≥1 @-placement (R22)
  - Camera-ask clips marked "AUDIENCE-ASK" in title (E1)
  - One clip carries questionBeat (E9)
"""
from __future__ import annotations
import json
from pathlib import Path

EP = 16
EP_DIR = Path(f"/Volumes/Samsung500/goreadling-production/saraandeva/content/episodes/ep{EP:02d}")

BASE_NEG = [
    "duplicate character",
    "ghost figure",
    "extra arm",
    "anatomy error",
    "morphing",
    "flickering",
    "disfigured",
    "scary face",
    "horror lighting",
    "blood",
    "dutch angle",
    "handheld shake",
    "jump cut",
    "eva with brown hair",
    "sara in ponytail",
    "live action footage",
    "photographic realism",
]

SILENCE = (
    " Absolutely NO dialogue, NO voices, NO speech in any language. "
    "Only soft music and ambient sound effects."
)


def credits(duration: int) -> int:
    return duration * 9


def clip(beat: int, clip_id, title: str, duration: int,
         subjects: list[str], scene: str, prompt: str,
         extra_neg: list[str] | None = None,
         native_audio: bool = True,
         question_beat: dict | None = None) -> dict:
    bound = [{"tag": s, "source": "library"} for s in subjects]
    bound.append({"tag": scene, "source": "library"})
    neg = list(BASE_NEG)
    if extra_neg:
        neg.extend(extra_neg)
    out = {
        "episode": EP,
        "beat": beat,
        "clip": clip_id,
        "title": title,
        "mode": "omni",
        "durationSec": duration,
        "quality": "720p",
        "nativeAudio": native_audio,
        "expectedCredits": credits(duration),
        "subjects": subjects,
        "scene": scene,
        "boundElements": bound,
        "prompt": [prompt],
        "negativePrompt": neg,
    }
    if question_beat:
        out["questionBeat"] = question_beat
    return out


def build_all() -> list[dict]:
    BATH = "ep16-bathroom-mirror"
    LIVING = "ep16-living-room-detective"
    BEDROOM = "ep16-evas-bedroom-night"
    KITCHEN = "kitchen_morning"

    clips: list[dict] = []

    # 1 — HOOK (AUDIENCE-ASK)
    clips.append(clip(
        beat=1, clip_id=1,
        title="AUDIENCE-ASK HOOK — Eva wiggles loose tooth to camera",
        duration=5, subjects=["Eva"], scene=BATH,
        prompt=(
            "@Eva at the bathroom mirror facing camera directly. Right INDEX "
            "FINGER WIGGLES her front loose tooth side to side, tongue PUSHES "
            "against it from inside. Eyes WIDEN with excitement. Mouth OPENS "
            "in a bright smile showing the wobbling tooth. Bright warm "
            "bathroom daylight, kid-friendly. @Eva (excited): \"Hi friends! "
            "Look at this! Tap subscribe so you don't miss this!\""
        ),
        extra_neg=["adult teeth", "missing all teeth"],
    ))

    # 2 — Tooth FALLS out
    clips.append(clip(
        beat=2, clip_id=2,
        title="Tooth FALLS into Eva's palm",
        duration=5, subjects=["Eva", "Sara"], scene=BATH,
        prompt=(
            "@Eva and @Sara at the bathroom mirror. @Eva's mouth OPENS wide. "
            "A tiny WHITE TOOTH POPS out and DROPS into a small cupped palm "
            "at chest level. Both girls' eyes WIDEN. @Sara's mouth GASPS, "
            "hands FLY UP to cheeks. The other hand HOVERS over the tooth "
            "protectively. Warm bathroom daylight." + SILENCE
        ),
        extra_neg=["red liquid near mouth", "blood"],
    ))

    # 3 — Eva runs to Mama
    clips.append(clip(
        beat=3, clip_id=3,
        title="Eva runs to Mama with tooth held high",
        duration=5, subjects=["Eva", "Mama"], scene=KITCHEN,
        prompt=(
            "@Eva RUNS into the kitchen, right hand held HIGH above head "
            "showing a tiny tooth pinched between thumb and finger, new "
            "gap visible in her smile. @Mama at the counter TURNS, eyes "
            "WIDEN, mouth SMILES. Hands LOWER from the counter, OPEN "
            "palms-up to receive. Warm morning kitchen daylight. @Eva "
            "(thrilled): \"MAMA! My TOOTH!\""
        ),
        extra_neg=["standing still"],
    ))

    # 4 — Mama explains Tooth Fairy
    clips.append(clip(
        beat=4, clip_id=4,
        title="Mama explains the Tooth Fairy",
        duration=10, subjects=["Mama", "Eva"], scene=KITCHEN,
        prompt=(
            "@Mama kneels to @Eva's eye level in the kitchen. Both hands "
            "GENTLY CUP a small hand holding a tiny tooth. Lips MOVE "
            "warmly, eyes SOFTEN. Young eyes WIDEN with wonder, mouth "
            "slowly OPENS in awe. The right hand RISES and GESTURES "
            "upward as if describing a tiny fairy. A small head TILTS, "
            "eyebrows LIFT. Warm motherly nod, gesture sweeps down to "
            "mime tucking under a pillow. Warm morning kitchen daylight. "
            "@Mama (gentle): \"Put it under your pillow tonight, and the "
            "Tooth Fairy will leave you a special coin.\""
        ),
        extra_neg=["standing still", "looking away"],
    ))

    # 5 — Place tooth under pillow
    clips.append(clip(
        beat=5, clip_id=5,
        title="Eva carefully places tooth under pillow",
        duration=5, subjects=["Eva"], scene=BEDROOM,
        prompt=(
            "@Eva kneeling on the bed at NIGHT. Soft moonlight through "
            "the window + warm fairy lights along the headboard. Left "
            "hand LIFTS the lavender pillow corner carefully. Right "
            "hand PLACES a tiny white tooth dead center on the sheet "
            "beneath. The other hand SMOOTHS the pillow back down "
            "gently. Face GLOWS with a quiet excited smile, eyes "
            "shining." + SILENCE
        ),
        extra_neg=["rushed motion", "papa in scene"],
    ))

    # 6 — CAMERA-ASK #1
    clips.append(clip(
        beat=6, clip_id=6,
        title="AUDIENCE-ASK — Do YOU believe in the Tooth Fairy?",
        duration=5, subjects=["Eva"], scene=BEDROOM,
        prompt=(
            "@Eva sitting cross-legged on the bed at night, facing camera "
            "directly. Eyes BIG and SPARKLING under the fairy lights. "
            "Both hands COME UP under the chin, fingers INTERLACED in a "
            "wishing pose. Head TILTS slightly, eyebrows LIFT. Pink "
            "pajamas, gap-tooth grin. Soft moonlight + fairy lights. "
            "@Eva (wonder): \"Do YOU believe in the Tooth Fairy?!\""
        ),
        extra_neg=["adult voice", "boring delivery"],
    ))

    # 7 — Night falls
    clips.append(clip(
        beat=7, clip_id=7,
        title="Night falls — Eva drifts to sleep",
        duration=5, subjects=["Eva"], scene=BEDROOM,
        prompt=(
            "@Eva tucked into bed under the purple+pink comforter, head "
            "on the lavender pillow. Eyelids slowly DROOP and CLOSE. "
            "Chest RISES and FALLS gently with peaceful breathing. The "
            "plush bunny LEANS against a small shoulder. Fairy lights "
            "softly TWINKLE around the headboard. Moonlight beam moves "
            "imperceptibly across the floor. Calm sleepy mood." + SILENCE
        ),
        extra_neg=["scary shadows", "monsters"],
        native_audio=False,
    ))

    # 8 — Joe sneaks in
    clips.append(clip(
        beat=8, clip_id=8,
        title="Joe sneaks into Eva's bedroom",
        duration=5, subjects=["Joe", "Eva"], scene=BEDROOM,
        prompt=(
            "@Joe the small fluffy Pomeranian PADS quietly through the "
            "bedroom doorway. Tiny PAWS step softly one at a time. EARS "
            "perk forward, NOSE TWITCHES sniffing. TAIL wags low and "
            "slow. The little dog JUMPS lightly up onto the foot of the "
            "bed, four paws landing softly on the comforter. @Eva still "
            "SLEEPS peacefully on the lavender pillow, undisturbed. Soft "
            "moonlight + warm fairy-light glow." + SILENCE
        ),
        extra_neg=["large dog", "german shepherd", "flying"],
        native_audio=False,
    ))

    # 9 — Joe nose finds tooth
    clips.append(clip(
        beat=9, clip_id=9,
        title="Joe's nose finds the tooth under the pillow",
        duration=5, subjects=["Joe", "Eva"], scene=BEDROOM,
        prompt=(
            "Close shot. @Joe's small NOSE pushes UNDER the corner of "
            "@Eva's lavender pillow. The wet nose TWITCHES, nostrils "
            "FLARE. EARS PERK straight up. A small mouth OPENS slightly. "
            "The tiny white TOOTH appears at the very corner of the "
            "pillow, caught lightly between front teeth. Eyes GLEAM "
            "excited in the moonlight. The sleeping girl stays "
            "undisturbed." + SILENCE
        ),
        extra_neg=["large dog", "blood", "scary tooth"],
        native_audio=False,
    ))

    # 10 — Joe trots away
    clips.append(clip(
        beat=10, clip_id=10,
        title="Joe trots down the hall with the tooth",
        duration=5, subjects=["Joe"], scene=BEDROOM,
        prompt=(
            "@Joe the Pomeranian TROTS away from the bed and out the "
            "bedroom doorway, the tiny white tooth held carefully "
            "between front teeth. TAIL high and PROUD. EARS forward, "
            "EYES satisfied. PAWS pad softly along the wood floor of "
            "the dim hallway beyond the door. Camera tracks from "
            "behind at low angle. Moonlight from bedroom + soft "
            "hallway glow." + SILENCE
        ),
        extra_neg=["large dog", "running fast", "blood near mouth"],
        native_audio=False,
    ))

    # 11 — Morning Eva checks pillow
    clips.append(clip(
        beat=11, clip_id=11,
        title="Morning — Eva CHECKS pillow, finds nothing",
        duration=5, subjects=["Eva"], scene=BEDROOM,
        prompt=(
            "Bright morning sunlight floods the bedroom. @Eva sits up "
            "in bed, hair messy. Both hands LIFT the lavender pillow "
            "EAGERLY. Eyes WIDEN searching — the sheet is EMPTY. No "
            "tooth. No coin. The mouth DROPS open. Hands FREEZE mid-"
            "air holding the pillow up. Eyebrows PULL together in "
            "confusion." + SILENCE
        ),
        extra_neg=["coin visible", "tooth visible", "happy face"],
        native_audio=False,
    ))

    # 12 — Eva sad
    clips.append(clip(
        beat=12, clip_id=12,
        title="Eva — 'Tooth Fairy FORGOT me!'",
        duration=5, subjects=["Eva", "Mama"], scene=KITCHEN,
        prompt=(
            "@Eva runs into the kitchen, eyes WELLING with tears, lower "
            "LIP TREMBLES. Small fists CLENCH at the sides. @Mama at "
            "the counter TURNS, eyes SOFTEN, brow furrows in concern, "
            "kneels with arms OPEN wide. The small girl runs into a "
            "warm hug, head BURIES in a soft shoulder. Warm morning "
            "kitchen light. @Eva (tearful): \"MAMA! The Tooth Fairy "
            "FORGOT me!\""
        ),
        extra_neg=["standing still", "fake crying"],
    ))

    # 13 — Sara: I have an idea (with questionBeat)
    clips.append(clip(
        beat=13, clip_id=13,
        title="AUDIENCE-ASK Sara — 'I have an idea!' (question beat)",
        duration=10, subjects=["Sara"], scene=LIVING,
        prompt=(
            "Close shot on @Sara in the living room. Eyes NARROW in "
            "detective focus. INDEX FINGER RAISES sharply into the air. "
            "Mouth OPENS confidently. Head TILTS, eyebrows LIFT. A kid "
            "magnifying glass held in the left hand at chest level. Warm "
            "morning daylight. After the declaration, the gaze FLICKS to "
            "camera, eyebrows ARCH inviting the viewer. @Sara (confident "
            "detective): \"I have an idea! But first — where do YOU "
            "think the tooth went?\""
        ),
        extra_neg=["blank stare"],
        question_beat={
            "question": "Where do YOU think Eva's tooth went?",
            "options": [
                "The Tooth Fairy took it (but no coin yet!)",
                "It fell under the bed",
                "Joe the puppy took it!",
            ],
            "correctIndex": 2,
            "displayHighlightAtSec": 7,
        },
    ))

    # 14 — Family detective mode
    clips.append(clip(
        beat=14, clip_id=14,
        title="Family searches living room — detective mode",
        duration=10, subjects=["Sara", "Eva", "Mama"], scene=LIVING,
        prompt=(
            "@Sara KNEELS beside the couch, hands LIFTING a cushion. "
            "@Eva on the floor PEEKS under the coffee table, eyes "
            "scanning. @Mama BENDS at the floor lamp, hands MOVING "
            "aside the lamp base to look behind it. A determined brow "
            "furrows on the older girl. A small mouth OPENS calling "
            "out. The mother SHAKES her head no, gives a comic shrug. "
            "Warm morning daylight in living room. @Eva (calling): "
            "\"Anything yet?\""
        ),
        extra_neg=["all standing still", "passive observing"],
    ))

    # 15 — Stash reveal (Nano candidate)
    clips.append(clip(
        beat=15, clip_id=15,
        title="REVEAL — Joe's secret stash behind the couch (NANO-FIRST)",
        duration=10, subjects=["Sara", "Eva", "Mama", "Joe"], scene=LIVING,
        prompt=(
            "Wide shot. @Sara, @Eva, and @Mama PEER behind the couch in "
            "a tight cluster, three heads leaning over together. All "
            "three mouths DROP open in shock. The youngest eyes are "
            "biggest. Behind the couch on the floor: the stash — a tiny "
            "WHITE TOOTH, a metal KEY RING, a small pearl EARRING, and "
            "an OLD PANCAKE. @Joe the Pomeranian sits beside the stash, "
            "EARS DROPPING down, eyes guilty, TAIL tucked. The older "
            "girl POINTS at the tooth. The youngest GASPS, hand TO "
            "MOUTH. The mother's eyes WIDEN. Warm morning living-room "
            "daylight." + SILENCE
        ),
        extra_neg=["empty stash", "different items", "joe happy",
                   "blood near tooth"],
        native_audio=False,
    ))

    # 16 — Eva confronts Joe
    clips.append(clip(
        beat=16, clip_id=16,
        title="Eva — 'Joe, YOU TOOK it!' (Joe guilty)",
        duration=5, subjects=["Eva", "Joe"], scene=LIVING,
        prompt=(
            "Close shot. @Eva kneels facing @Joe the Pomeranian on the "
            "living room rug. Small hands ON HIPS, eyebrows PULL "
            "TOGETHER. The little dog SITS, ears FLAT DOWN, eyes wide "
            "and guilty, tongue PEEKS out apologetically. TAIL gives "
            "one tiny wag. The girl's expression softens slightly. "
            "Warm morning daylight. @Eva (gentle scolding): \"Joe... "
            "you took it.\""
        ),
        extra_neg=["yelling angry", "joe scared", "scary tone"],
    ))

    # 17 — Sara writes letter
    clips.append(clip(
        beat=17, clip_id=17,
        title="Sara writes a letter to the Tooth Fairy",
        duration=10, subjects=["Sara", "Eva"], scene=KITCHEN,
        prompt=(
            "@Sara sits at the kitchen table, a pink CRAYON pinched in "
            "right fingers, drawing carefully on a sheet of paper. The "
            "tongue POKES out the side of the mouth in concentration. "
            "@Eva leans on the table beside, both elbows down, chin in "
            "palms, eyes WATCHING the paper. The paper shows a child-"
            "drawn fairy with wings and a wand. The crayon ADDS sparkly "
            "dots around the fairy. The younger girl POINTS to the "
            "paper, mouth OPENS adding an idea. Warm morning kitchen "
            "daylight. @Sara (focused): \"Dear Tooth Fairy...\""
        ),
        extra_neg=["adult handwriting", "blank paper", "standing still"],
    ))

    # 18 — PAPA-PLAY (mandatory 15s)
    clips.append(clip(
        beat=18, clip_id=18,
        title="PARENT-ACTIVITY — Papa pretends to be the Tooth Fairy",
        duration=15, subjects=["Papa", "Sara", "Eva"], scene=LIVING,
        prompt=(
            "@Papa enters the living room holding a sparkly star-topped "
            "TOY WAND in the right hand. The chest PUFFS OUT, mouth "
            "BOOMS a goofy laugh. The left hand SWEEPS the wand "
            "through the air in big arcs above the head, scattering "
            "imaginary fairy dust. @Sara and @Eva SQUEAL and RUN "
            "around the dad in a circle. The father SPINS in place, "
            "wand still SWEEPING. He BENDS DOWN and SCOOPS the older "
            "girl up under one arm. A TWIRL. The older girl LAUGHS. "
            "He SETS her down, IMMEDIATELY SCOOPS the younger girl up "
            "the same way. The younger SHRIEKS with joy. Another "
            "TWIRL. She LAUGHS. He sets her down. All three FALL "
            "backwards onto the couch giggling, three smiles wide. "
            "Warm afternoon daylight in the living room. @Papa "
            "(booming): \"I am the Tooth Fairy! SPARKLE SPARKLE!\""
        ),
        extra_neg=["papa standing still", "papa observing without acting",
                   "papa idle", "papa waiting passively", "papa overweight",
                   "kids standing still", "scary face", "thundering"],
    ))

    # 19 — Night 2
    clips.append(clip(
        beat=19, clip_id=19,
        title="Night 2 — Eva places tooth + letter, Joe locked out",
        duration=5, subjects=["Eva", "Joe"], scene=BEDROOM,
        prompt=(
            "@Eva at the bed at night, pink pajamas, careful pose. "
            "Both hands LIFT the lavender pillow, PLACE a tiny tooth "
            "AND a folded handwritten letter on the sheet, then "
            "SMOOTH the pillow back down. The young head GLANCES "
            "toward the bedroom doorway. Through the slightly-open "
            "door, @Joe the Pomeranian SITS in the dim hallway just "
            "outside, ears DROOPING, eyes sad, tail STILL. A small "
            "reassuring wave through the gap. Soft moonlight + fairy "
            "lights." + SILENCE
        ),
        extra_neg=["joe inside bedroom", "happy joe", "papa in scene"],
        native_audio=False,
    ))

    # 20 — Morning — two coins + note
    clips.append(clip(
        beat=20, clip_id=20,
        title="Morning — Eva discovers TWO coins and a note",
        duration=10, subjects=["Eva"], scene=BEDROOM,
        prompt=(
            "Bright morning sunlight on the bed. @Eva sits up, hair "
            "messy. Both hands LIFT the lavender pillow QUICKLY. Eyes "
            "WIDEN huge. On the sheet: TWO shiny gold COINS and a "
            "tiny folded NOTE. Fingers PICK UP the note, hands "
            "TREMBLE with excitement, UNFOLD it carefully. A tiny "
            "sparkle FLICKERS at the corner of the note. The eyes "
            "GLOW with joy. Warm morning daylight. @Eva (reading "
            "aloud with wonder): \"I understand. Joe's a good dog. "
            "Love, The Tooth Fairy.\""
        ),
        extra_neg=["empty pillow", "one coin only", "papa in scene"],
    ))

    # 21 — Eva hugs Joe
    clips.append(clip(
        beat=21, clip_id=21,
        title="Eva runs and hugs Joe — forgiveness",
        duration=5, subjects=["Eva", "Joe", "Sara"], scene=LIVING,
        prompt=(
            "@Eva RUNS into the living room, two gold coins clutched in "
            "the left hand. The small body DROPS to its knees in front "
            "of @Joe the Pomeranian, arms OPEN. A big squishy hug, "
            "face BURIED in fluffy neck fur. The little dog's TAIL "
            "WAGS fast, tongue PEEKS out, EARS PERK UP happy. A wet "
            "lick on a cheek. @Sara WATCHES from the couch, arms "
            "FOLDED, smiling warmly. Warm morning daylight." + SILENCE
        ),
        extra_neg=["scary hug", "joe sad", "joe scared"],
        native_audio=False,
    ))

    # 22 — CLIFFHANGER
    clips.append(clip(
        beat=22, clip_id=22,
        title="AUDIENCE-ASK CLIFFHANGER — Eva asks viewers",
        duration=5, subjects=["Eva"], scene=LIVING,
        prompt=(
            "Close shot. @Eva facing camera directly, big GAP-TOOTH "
            "GRIN, two gold coins held UP in right fingers like a "
            "tiny prize. Eyes SPARKLE. Mouth OPENS. The free hand "
            "WAVES to camera. Warm morning daylight. @Eva (delighted): "
            "\"Did YOU lose a tooth this year?! Tell us! See you "
            "tomorrow!\""
        ),
        extra_neg=["adult voice", "boring delivery", "no eye contact"],
    ))

    return clips


def main():
    EP_DIR.mkdir(parents=True, exist_ok=True)
    clips = build_all()
    assert len(clips) == 22

    total_credits = 0
    total_duration = 0
    for c in clips:
        out = EP_DIR / f"{c['clip']}.json"
        out.write_text(json.dumps(c, indent=2))
        total_credits += c["expectedCredits"]
        total_duration += c["durationSec"]
        flags = []
        if c["clip"] == 15: flags.append("🟠 NANO-FIRST")
        if c.get("questionBeat"): flags.append("❓ Q-BEAT")
        if "AUDIENCE-ASK" in c["title"]: flags.append("📣 ASK")
        flag_str = "  " + " ".join(flags) if flags else ""
        print(f"  ✅ clip {c['clip']:>2}  {c['durationSec']:>2}s  "
              f"{c['expectedCredits']:>3} cr  {c['title'][:50]}{flag_str}")

    print(f"\n━━━ ep16 SUMMARY ━━━")
    print(f"  Clips:           {len(clips)}")
    print(f"  Total duration:  {total_duration}s = {total_duration//60}:{total_duration%60:02d}")
    print(f"  Total credits:   {total_credits} (abort threshold 2200)")
    print(f"  Nano-first:      clip 15")
    print(f"  Question beat:   clip 13")
    print(f"  Audience-asks:   clips 1, 6, 13, 22")
    print(f"  Papa-active:     clip 18 (15s)")


if __name__ == "__main__":
    main()
