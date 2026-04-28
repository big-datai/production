#!/usr/bin/env python3
"""
Face-classify every photo in /Volumes/Samsung500/photo using Gemini
Vision, with user-labeled anchor photos as ground truth.

Why: I (Claude) was mis-labeling photos by eyeballing them — calling
Sara photos "Eva" and vice versa. The user explicitly said:
"use face recognition don't guess".

Approach:
    - Anchor set for each person = explicit user-labeled photos
      (e.g. sara_beach_bucket.jpg, sara_ski_with_papa.jpg for Sara;
       eva_bedroom_twirl_medium.jpg for Eva).
    - For each other photo, send Gemini: [sara_anchor, eva_anchor, photo]
      + a question asking which of the two children is in the photo
      (or both, or neither, or unclear). Gemini returns strict JSON.
    - Results written to _curation/_face_classifications.json.

Usage:
    python3 content/saraandeva/classifyFaces.py           # classify everything
    python3 content/saraandeva/classifyFaces.py --only sara_* eva_*
    python3 content/saraandeva/classifyFaces.py --dry-run
"""

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / ".env.local"
PHOTO_DIR = Path("/Volumes/Samsung500/photo")
OUT_FILE = ROOT / "content" / "saraandeva" / "_curation" / "_face_classifications.json"

# Using a cheap text-capable multimodal model for classification, not
# the expensive image-gen one. Flash tier is plenty for face comparison.
MODEL = "gemini-2.5-flash"
API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# Anchor photos — user-labeled ground truth. Sara has wavy lighter
# brown hair. Eva has big curly auburn hair.
SARA_ANCHORS = [
    "sara_beach_bucket.jpg",        # user-tagged "sara.jpg"
    "sara_ski_with_papa.jpg",       # user-tagged "sara ski.jpeg"
]
EVA_ANCHORS = [
    "eva_bedroom_twirl_medium.jpg",  # tight auburn curls, floral dress
    # second anchor can be added once a clean single-Eva shot is confirmed
]


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


def load_as_inline(path: Path) -> dict:
    raw = path.read_bytes()
    ext = path.suffix.lower()
    mime = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".heic": "image/heic",
    }.get(ext, "image/jpeg")
    return {"inlineData": {"mimeType": mime, "data": base64.b64encode(raw).decode("ascii")}}


PROMPT = """You are helping classify children's photographs for a family-series avatar project.

The FIRST images show SARA — a 6-year-old girl with wavy, slightly-curly lighter brown hair (not tightly curled), warm eyes, gap-tooth smile, freckles. She's the older sister.

The NEXT images show EVA — a 4-year-old girl with VERY curly, voluminous auburn/brown curls (tight dense ringlets), rounder cheeks. She's the younger sister.

The FINAL image is the one to classify.

Task: identify WHICH of the two sisters appear in the final image. Other people (mother, father, grandparents, strangers) may also be in the image — ignore them except to note their presence. Answer with STRICT JSON, no markdown fences:

{
  "sara": true | false,
  "eva": true | false,
  "sara_confidence": 0-100,
  "eva_confidence": 0-100,
  "other_children": true | false,
  "adults_present": true | false,
  "notes": "short description of who/what is visible (max 30 words)"
}

Answer ONLY with the JSON object. No preamble, no explanation."""


def classify(photo: Path, anchors: list[Path], keys: list[str]) -> dict:
    parts: list[dict] = []

    # Sara anchors
    parts.append({"text": "=== SARA REFERENCE IMAGES (below) ==="})
    for p in [a for a in anchors if "sara" in a.name.lower()]:
        parts.append(load_as_inline(p))

    # Eva anchors
    parts.append({"text": "=== EVA REFERENCE IMAGES (below) ==="})
    for p in [a for a in anchors if "eva" in a.name.lower()]:
        parts.append(load_as_inline(p))

    # Target
    parts.append({"text": "=== IMAGE TO CLASSIFY (below) ==="})
    parts.append(load_as_inline(photo))
    parts.append({"text": PROMPT})

    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
    }
    data = json.dumps(body).encode("utf-8")

    for attempt in range(5):
        key = keys[attempt % len(keys)]
        url = f"{API_BASE}/{MODEL}:generateContent?key={key}"
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                rj = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")[:300]
            if e.code == 429:
                time.sleep(30)
                continue
            print(f"   ❌ HTTP {e.code}: {err[:200]}", file=sys.stderr)
            time.sleep(2)
            continue
        except Exception as e:
            print(f"   ❌ {type(e).__name__}: {e}", file=sys.stderr)
            time.sleep(2)
            continue

        text = ""
        for cand in rj.get("candidates", []):
            for p in (cand.get("content") or {}).get("parts") or []:
                if p.get("text"):
                    text += p["text"]
        if not text.strip():
            print(f"   ⚠️  empty response", file=sys.stderr)
            time.sleep(2)
            continue
        # strip codefences just in case
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.DOTALL)
        try:
            return json.loads(text)
        except Exception as e:
            print(f"   ⚠️  bad JSON: {text[:200]}", file=sys.stderr)
            time.sleep(2)
            continue
    return {"error": "all attempts failed"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", default=None, help="Only classify files matching these glob patterns (relative to photo dir)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    keys = get_api_keys()
    if not keys:
        raise SystemExit("❌ No GEMINI_API_KEY* found")

    anchors = [PHOTO_DIR / n for n in (SARA_ANCHORS + EVA_ANCHORS) if (PHOTO_DIR / n).exists()]
    if not anchors:
        raise SystemExit(f"❌ No anchor photos found in {PHOTO_DIR}")
    print(f"🔗 Anchors ({len(anchors)}):")
    for a in anchors:
        print(f"     {a.name}")

    # Candidate photos — all stills in the main photo dir except anchors themselves.
    stills = sorted(
        p for p in PHOTO_DIR.iterdir()
        if p.suffix.lower() in (".jpg", ".jpeg") and p not in anchors and not p.name.startswith(".")
    )

    if args.only:
        pats = args.only
        stills = [p for p in stills if any(p.match(pat) for pat in pats)]

    if args.limit:
        stills = stills[: args.limit]

    print(f"\n📸 Classifying {len(stills)} photos…\n")
    results: dict[str, dict] = {}

    # Resume support — if output exists, merge.
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    if OUT_FILE.exists():
        try:
            results = json.loads(OUT_FILE.read_text())
            print(f"   ↪️  Resumed with {len(results)} prior results\n")
        except Exception:
            results = {}

    for i, photo in enumerate(stills, start=1):
        if photo.name in results and not args.dry_run:
            print(f"  [{i:>2}/{len(stills)}] ⏭️  cached: {photo.name}")
            continue
        print(f"  [{i:>2}/{len(stills)}] 🔍 {photo.name}", end=" ", flush=True)
        if args.dry_run:
            print("[dry]")
            continue
        t0 = time.time()
        r = classify(photo, anchors, keys)
        dt = time.time() - t0
        if "error" in r:
            print(f"FAILED ({r['error']}, {dt:.1f}s)")
        else:
            # Short one-line summary
            tag = []
            if r.get("sara"):
                tag.append(f"sara({r.get('sara_confidence', '?')})")
            if r.get("eva"):
                tag.append(f"eva({r.get('eva_confidence', '?')})")
            if not tag:
                tag.append("neither")
            print(f"→ {', '.join(tag)}  [{dt:.1f}s]  {r.get('notes', '')[:60]}")
        results[photo.name] = r
        # Persist incrementally so we don't lose progress
        OUT_FILE.write_text(json.dumps(results, indent=2))

    print(f"\n📒 Wrote {OUT_FILE.relative_to(ROOT)}  ({len(results)} entries)")


if __name__ == "__main__":
    main()
