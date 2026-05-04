#!/usr/bin/env python3
"""
Sara & Eva — Multi-Character Group-Shot Generator (Nano Banana Pro)

Locks a 4+ character composition into a single still image BEFORE submitting
to Kling. This eliminates the dup-character ghost-girl bug that hits Kling
Omni renders when 4+ characters are bound — Kling's anchoring is unstable
with high character counts AND novel scenes, often spawning a 5th phantom
child or duplicating an adult.

Workflow:
  1. python3 generateGroupShot.py <output_id> --chars mama,papa,sara,eva \
       --pose "tight family selfie, magic forest behind" \
       [--scene magic_forest_sandy] \
       [--n 4]    # generate N candidates, pick the best one manually
  2. Visually verify the output has EXACTLY the right character count
  3. Use the still as a Kling Omni image-to-video upload reference

Output: assets/scenes/group_<output_id>.png (or _v1, _v2, _vN if --n>1)

Why this works:
  - Nano Banana is cheap (~$0.01/image) and fast (~10s)
  - Multiple candidates let us reject ghost-renders before spending Kling cr
  - Kling image-to-video locks to the still's composition

Usage examples:
  # Family selfie for ep10 clip 11
  python3 content/generateGroupShot.py ep10_clip11_selfie \
    --chars mama,papa,sara,eva \
    --pose "extreme tight selfie close-up — Papa lower-right with phone, Mama lower-left, Sara upper-left, Eva upper-right with tongue out, all 4 faces filling the frame, just visible behind: black Jeep with SARA AND EVA license plate" \
    --scene magic_forest_sandy \
    --n 3

  # 3-character family scene
  python3 content/generateGroupShot.py ep10_clip5_packing \
    --chars mama,sara,eva \
    --pose "Mama loads cooler into Jeep, Sara holds soccer ball, Eva holds tennis racket" \
    --scene driveway
"""

import argparse, base64, json, os, sys, time
import urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / ".env.local"
SARAANDEVA_DIR = ROOT / "saraandeva"
OUTPUT_DIR = SARAANDEVA_DIR / "assets" / "scenes"
CHAR_DIR = SARAANDEVA_DIR / "assets" / "characters"
SCENE_DIR = SARAANDEVA_DIR / "assets" / "scenes"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MODEL = "gemini-3-pro-image-preview"
MAX_ATTEMPTS = 5
RATE_LIMIT_WAIT = 60
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

SERIES_STYLE = (
    "Pixar Animation Studios signature style — production-render quality from "
    "films like Inside Out 2, Turning Red, Elemental, Luca, Soul. STRONGLY "
    "STYLIZED CARTOON RENDER, NOT photorealistic, NOT a photograph. "
    "Exaggerated cheerful colors, stylized simplified shapes, cartoon-"
    "proportioned figures, storybook-warm lighting. Colors pushed MORE "
    "SATURATED than real life, slight warmth pushed onto shadows."
)


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_api_keys() -> list[str]:
    load_env(ENV_FILE)
    keys = []
    for name in ("GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
                 "GEMINI_API_KEY_4", "GEMINI_API_KEY_5", "GEMINI_API_KEY_6"):
        v = os.environ.get(name)
        if v:
            keys.append(v.replace('"', "").strip())
    return keys


def load_inline(path: Path) -> dict:
    raw = path.read_bytes()
    ext = path.suffix.lower()
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(ext, "image/jpeg")
    return {"inlineData": {"mimeType": mime, "data": base64.b64encode(raw).decode("ascii")}}


def char_ref(name: str) -> Path:
    """Find the best character reference image: prefer _front then _3q then _sheet."""
    for variant in ["_front", "_3q", "_sheet", "_profile"]:
        p = CHAR_DIR / f"{name.lower()}{variant}.png"
        if p.exists():
            return p
    raise SystemExit(f"No avatar found for character '{name}' in {CHAR_DIR}")


def scene_ref(scene_id: str) -> Path | None:
    p = SCENE_DIR / f"{scene_id}.png"
    return p if p.exists() else None


def build_prompt(chars: list[str], pose: str, scene_id: str | None) -> str:
    n = len(chars)
    chars_str = ", ".join(chars)
    char_count_emphasis = f"EXACTLY {n} PEOPLE — no fifth person, no extra child, no duplicate adult, no phantom figure anywhere in the frame. Count again: {n} ({chars_str})."
    scene_part = f" SETTING: composite onto the background scene shown in the last reference image (the {scene_id})." if scene_id else ""

    return f"""Create a SINGLE still image showing a multi-character group composition for the "Sara and Eva" Pixar-style children's animated series.

CHARACTERS PRESENT (use the supplied character reference images for each face/outfit/proportions): {chars_str}.

{char_count_emphasis}

POSE / COMPOSITION:
{pose}

{scene_part}

ART STYLE:
{SERIES_STYLE}

CRITICAL CHARACTER-COUNT RULE: The output MUST contain EXACTLY {n} human characters and ZERO extras. Do NOT add a phantom child, duplicate adult, twin, mirror reflection, or ghost figure anywhere — not in the foreground, background, edges, or peeking out from behind anyone. {n} faces total. {n} bodies total. Count them before finalizing the output.

Framing: cinematic single-frame still suitable as the FIRST FRAME of an animated video. Camera and lighting should match a Pixar feature film.

Output: ONE high-quality 16:9 image. Single image only.""".strip()


def call_gemini(prompt: str, char_refs: list[Path], scene_ref_path: Path | None, keys: list[str]) -> bytes:
    parts: list[dict] = []

    # Character reference images first, with labeling text
    for cname, cpath in zip(char_refs[1::2], char_refs[::2]):  # placeholder split; real loop below
        pass
    # Actually just inline each character ref with a labeled hint
    for p in char_refs:
        parts.append(load_inline(p))
    parts.append({"text": (
        f"☝️ The above {len(char_refs)} image(s) are CHARACTER REFERENCES — locked "
        "look-and-feel for each character that must appear in the final composition. "
        "Match face, hair, outfit, and proportions for each character exactly."
    )})

    if scene_ref_path:
        parts.append(load_inline(scene_ref_path))
        parts.append({"text": (
            "☝️ The above image is the SCENE / BACKGROUND REFERENCE — composite the "
            "characters into this environment with consistent lighting and depth."
        )})

    parts.append({"text": prompt})

    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE", "TEXT"], "temperature": 0.4},
    }
    data = json.dumps(body).encode("utf-8")

    for attempt in range(MAX_ATTEMPTS):
        key = keys[attempt % len(keys)]
        url = f"{API_BASE}/{MODEL}:generateContent?key={key}"
        req = urllib.request.Request(url, data=data,
                                      headers={"Content-Type": "application/json"}, method="POST")
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
        print(f"  ⚠️  no image (finish={finish})")
        time.sleep(3)
    raise SystemExit("All retry attempts failed")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("output_id", help="Output filename stem — saved as group_<output_id>[_vN].png in assets/scenes/")
    ap.add_argument("--chars", required=True, help="Comma-separated character names (e.g. mama,papa,sara,eva)")
    ap.add_argument("--pose", required=True, help="Composition / pose description")
    ap.add_argument("--scene", help="Scene ID for background reference (e.g. magic_forest_sandy)")
    ap.add_argument("--n", type=int, default=1, help="Number of candidate images to generate (default 1)")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    chars = [c.strip().lower() for c in args.chars.split(",") if c.strip()]
    char_paths = [char_ref(c) for c in chars]
    scene_path = scene_ref(args.scene) if args.scene else None

    keys = get_api_keys()
    if not keys:
        raise SystemExit("No GEMINI_API_KEY* in env")

    prompt = build_prompt(chars, args.pose, args.scene)
    print(f"🖼️  group shot '{args.output_id}'  chars=[{','.join(chars)}]  scene={args.scene or '(none)'}")
    print(f"   refs: {len(char_paths)} chars + {1 if scene_path else 0} scene")
    print(f"   N candidates: {args.n}")

    for i in range(args.n):
        suffix = "" if args.n == 1 else f"_v{i+1}"
        out = OUTPUT_DIR / f"group_{args.output_id}{suffix}.png"
        if out.exists() and not args.force:
            print(f"  ⏭️  cached: {out.name}")
            continue
        t0 = time.time()
        data = call_gemini(prompt, char_paths, scene_path, keys)
        out.write_bytes(data)
        print(f"  ✅ {out.name}  ({len(data)/1024:.1f} KB, {time.time()-t0:.1f}s)")


if __name__ == "__main__":
    main()
