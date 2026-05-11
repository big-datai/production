#!/usr/bin/env python3
"""
Generate a single-character avatar PNG via Nano Banana Pro
(gemini-3-pro-image-preview), with style anchors locked to the
existing Sara&Eva Pixar 3D look and an optional layout reference
to preserve face/hair/skin/eye identity from a known character avatar.

Replaces ad-hoc inline scripts (e.g. `_gen_lisa_halloween.py` from this
session). Use this whenever you need a NEW costumed avatar for an episode
that the Nano Banana scene catalog doesn't yet cover.

Output filename convention:
    assets/scenes/group_ep<NN>_<char-lower>_<costume-slug>_preview.png

The `discoverAndRegisterAssets.py` phase 0.7 then auto-uploads + element-
registers it.

Usage:
  python3 generateCharacterAvatar.py \\
    --episode 14 \\
    --char Papa \\
    --costume "young traveling backpacker" \\
    --identity-ref assets/characters/papa_front.png \\
    --description "Papa as a 10-years-younger traveler — same bald head, dark beard, glasses, cozy gray cardigan, blue henley, dark jeans. Wears a brown leather backpack on his shoulders. Holds a small DSLR camera in his right hand. Standing on a cobblestone street with autumn leaves, charming European town in soft background."

Required:
  --episode N            episode number for filename
  --char Name            character name (Sara, Papa, Mama, baby_Sara, young_Mama, ...)
  --costume slug         short slug for filename (e.g. "young_backpacker")
  --description "..."    full Nano Banana prompt for what to generate

Optional:
  --identity-ref path    PNG of canonical character avatar to lock face/hair
  --style-refs p1 p2     PNG paths of style anchors (Pixar 3D look). Default:
                         pulls 2 from existing ep15 previews.
  --out path.png         override output path
  --force                regen even if file exists
"""
import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ENV_FILE = Path("/Volumes/Samsung500/goreadling-production/.env.local")
MODEL = "gemini-3-pro-image-preview"
API = "https://generativelanguage.googleapis.com/v1beta/models"

# DEFAULT_STYLE_REFS: must be character-NEUTRAL Pixar-style references.
# OLD bug 2026-05-08: defaults pointed to ep15 Isabel + Leo previews; those
# leaked into ep14 group-still generation as character templates → wrong
# Mama/Sara/Eva (rendered as Isabel/Leo/their-mom). FIX: use canonical
# Sara&Eva family avatars (correct identity, also serves as style anchor).
DEFAULT_STYLE_REFS = [
    PROJECT_ROOT / "assets" / "characters" / "sara_front.png",
    PROJECT_ROOT / "assets" / "characters" / "eva_front.png",
]

# Reject these as --char values — they imply a multi-character group still,
# which this script CAN'T handle (it's hardcoded for single-char output).
# Use content/generateGroupShot.py instead for group shots.
GROUP_CHAR_KEYWORDS = ("family", "group", "everyone", "all", "kids", "girls", "household")


def load_env():
    if not ENV_FILE.is_file():
        print("!! .env.local not found", file=sys.stderr); sys.exit(2)
    for line in ENV_FILE.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))
    keys = []
    for nm in ("GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
               "GEMINI_API_KEY_4", "GEMINI_API_KEY_5", "GEMINI_API_KEY_6"):
        v = os.environ.get(nm)
        if v: keys.append(v.replace('"', '').strip())
    if not keys:
        print("!! no GEMINI_API_KEY*", file=sys.stderr); sys.exit(2)
    return keys


def load_inline(p: Path) -> dict:
    return {"inlineData": {"mimeType": "image/png", "data": base64.b64encode(p.read_bytes()).decode()}}


def call_nano_banana(parts: list, key: str) -> bytes:
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE", "TEXT"], "temperature": 0.3},
    }
    data = json.dumps(body).encode()
    url = f"{API}/{MODEL}:generateContent?key={key}"
    req = Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=240) as r:
        rj = json.loads(r.read())
    cand = (rj.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
    for p in cand:
        inline = p.get("inlineData") or p.get("inline_data")
        if inline and (inline.get("mimeType") or inline.get("mime_type", "")).startswith("image/"):
            return base64.b64decode(inline["data"])
    finish = (rj.get("candidates") or [{}])[0].get("finishReason", "?")
    raise RuntimeError(f"no image in response (finish={finish})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--char", required=True)
    ap.add_argument("--costume", required=True, help="short slug for filename, e.g. 'young_backpacker'")
    ap.add_argument("--description", required=True, help="full Nano Banana prompt")
    ap.add_argument("--identity-ref", default=None, help="PNG of canonical avatar to lock face/hair")
    ap.add_argument("--style-refs", nargs="+", default=None,
                    help="PNG paths of style anchors. Default: 2 from ep15 previews")
    ap.add_argument("--out", default=None, help="override output path")
    ap.add_argument("--force", action="store_true", help="regen even if file exists")
    args = ap.parse_args()

    # GUARD: hard-reject group/family char values (script is single-character only)
    char_lower_check = args.char.lower().replace("_", " ")
    for kw in GROUP_CHAR_KEYWORDS:
        if kw in char_lower_check.split() or char_lower_check == kw:
            print(f"""
!! WRONG SCRIPT — generateCharacterAvatar.py rejected --char='{args.char}'

   What this script does:
     Generates a SINGLE-CHARACTER Pixar-3D frontal avatar PNG via Nano Banana.
     Designed for new costumes / age variants of ONE canonical character.
     The script's prompt explicitly says "NO other characters in frame. Only {{char}}."

   Why your call is wrong:
     '{args.char}' is a group/family identifier, not a single character name.
     The script would tell Nano Banana to render ONE person literally called
     '{args.char}' — which leaks adjacent style-ref characters as the rest.
     (This is exactly how ep14 clip 28 ended up with Leo-as-Eva and Isabel-as-Sara.)

   Use this instead (multi-character group still generator):

     python3 content/generateGroupShot.py ep<NN>_<scene_name> \\
       --chars sara,eva,mama,papa[,joe,ginger] \\
       --pose "<composition + pose description>" \\
       [--scene <scene_id_for_background>]

   Then audit BEFORE upload:
     python3 prodpipeline/auditScenePNG.py <output.png> --expect sara,eva,mama,papa
""", file=sys.stderr)
            sys.exit(2)

    # GUARD: --char must be a known canonical character name (or its variant)
    KNOWN_CHARS = {
        "sara", "eva", "mama", "papa", "joe", "ginger",
        "young_papa", "young_mama", "baby_sara", "baby_eva", "puppy_joe",
        "mama_with_camera", "isabel", "leo", "lisa", "mrs_patel", "mrs.patel",
    }
    if args.char.lower().replace(" ", "_").replace(".", "") not in KNOWN_CHARS:
        print(f"""
!! UNKNOWN CHARACTER — generateCharacterAvatar.py rejected --char='{args.char}'

   What this script does:
     Generates a Pixar-3D frontal avatar for ONE known character of the
     'Sara and Eva' series, with the option to apply a costume/age variant.
     The script uses canonical avatar refs from assets/characters/ to lock
     identity — but only for known names.

   Known character names (case-insensitive, underscores OK):
     {sorted(KNOWN_CHARS)}

   If you're adding a NEW canonical character, register it in:
     - assets/characters/<name>_front.png  (canonical avatar PNG)
     - content/elements_registry.json     (Kling element_id mapping)
   then add to KNOWN_CHARS in this script.
""", file=sys.stderr)
        sys.exit(2)

    keys = load_env()

    # Log this invocation to commands.log for traceability
    log_path = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}" / "commands.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "a") as lf:
        lf.write(json.dumps({
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "script": "generateCharacterAvatar.py",
            "episode": args.episode,
            "char": args.char,
            "costume": args.costume,
            "description": args.description[:300],
            "identity_ref": args.identity_ref,
            "style_refs": args.style_refs,
            "out": args.out,
        }) + "\n")

    char_lower = args.char.lower().replace(" ", "_").replace(".", "")
    costume_slug = args.costume.lower().replace(" ", "_").replace("-", "_")
    out = Path(args.out) if args.out else (
        PROJECT_ROOT / "assets" / "scenes" /
        f"group_ep{args.episode:02d}_{char_lower}_{costume_slug}_preview.png"
    )
    if out.exists() and not args.force:
        print(f"⏭️  {out.relative_to(PROJECT_ROOT)} already exists (use --force to regen)")
        sys.exit(0)
    out.parent.mkdir(parents=True, exist_ok=True)

    style_refs = ([Path(p) for p in args.style_refs] if args.style_refs else DEFAULT_STYLE_REFS)
    style_refs = [p for p in style_refs if p.is_file()]

    parts = []
    for p in style_refs:
        parts.append(load_inline(p))
    parts.append({"text": (
        f"☝️ The above {len(style_refs)} image(s) are LOCKED STYLE ANCHORS — Pixar 3D feature-render look "
        f"approved for the 'Sara and Eva' kids series. The output you generate MUST visually belong in the "
        f"same movie: identical 3D CG rendering treatment, physically-based materials and lighting, warm "
        f"storybook color grade, stylized cartoon-realism. NEVER 2D anime, flat cel-shading, or Studio "
        f"Ghibli look — match the anchors' full 3D feature-animation feel exactly."
    )})

    if args.identity_ref:
        ident = Path(args.identity_ref)
        if ident.is_file():
            parts.append(load_inline(ident))
            parts.append({"text": (
                f"☝️ The above image is the LAYOUT IDENTITY REFERENCE for {args.char} — preserve the face, "
                f"hair, skin tone, and eye color exactly. The new costume / pose / setting from the prompt "
                f"below applies on top of this identity."
            )})

    parts.append({"text": (
        f"Generate a SINGLE-CHARACTER Pixar-3D feature-render frontal of {args.char}. "
        f"{args.description}\n\n"
        f"Frame: 16:9 horizontal, single-character composition, character roughly centered occupying "
        f"about 40-50% of frame height, full body visible. Pose: standing facing camera, friendly posture. "
        f"Background: appropriate to the description, slightly out of focus.\n\n"
        f"CRITICAL: NO scary elements, NO horror, just sweet kid-show character costume design. "
        f"NO other characters in frame. Only {args.char}."
    )})

    last_err = None
    for attempt, key in enumerate(keys[:3], 1):
        print(f"  attempt {attempt}/{min(3, len(keys))}: calling Nano Banana...")
        try:
            png = call_nano_banana(parts, key)
            out.write_bytes(png)
            print(f"  ✓ saved {out.relative_to(PROJECT_ROOT)} ({out.stat().st_size // 1024} KB)")
            sys.exit(0)
        except (HTTPError, RuntimeError, OSError) as e:
            print(f"  ⚠ {type(e).__name__}: {e}", file=sys.stderr)
            last_err = e
            time.sleep(5)
    print(f"!! all attempts failed: {last_err}", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
