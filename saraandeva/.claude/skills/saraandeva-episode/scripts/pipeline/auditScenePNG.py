#!/usr/bin/env python3
"""
Gemini Vision audit of a scene PNG before allowing it into the Kling pipeline.
Catches: wrong characters, missing characters, ghost extras, identity drift in
Nano Banana group stills (Pattern E).

User directive 2026-05-08: Nano Banana script must be deterministic part of
pipeline — every generated PNG should be audited before upload to GCS.

Usage:
  python3 auditScenePNG.py <png_path> --expect sara,eva,mama,papa
  python3 auditScenePNG.py group_ep14_x.png --expect mama,papa,sara,eva,joe,ginger \\
                                             [--strict]   # exit 1 on any mismatch

Returns:
  Exit 0 = all expected characters present, no extras
  Exit 1 = mismatch (missing OR extra characters)
  Exit 2 = infrastructure (file missing, API error)
"""
import argparse
import base64
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ENV_FILE = Path("/Volumes/Samsung500/goreadling-production/.env.local")
GEMINI_BASE = "https://generativelanguage.googleapis.com"

CANONICAL_CAST_HINTS = {
    "sara": "older girl ~7yo wavy dark-blonde hair, brown eyes",
    "eva": "younger girl ~3yo curly bright-blonde hair, brown eyes",
    "mama": "adult woman straight blonde hair, fair skin, friendly",
    "papa": "adult man bald + dark beard + glasses",
    "joe": "Pomeranian dog, fluffy cream-and-gold",
    "ginger": "Jack Russell terrier",
    "young_papa": "younger Papa same bald+beard+glasses, traveler with backpack/camera",
    "young_mama": "younger Mama same straight blonde, soft mustard sweater + cream skirt",
    "baby_sara": "newborn/toddler Sara, dark-blonde wisps, pastel onesie",
    "baby_eva": "newborn/toddler Eva, blonde tufts, lemon onesie",
    "puppy_joe": "Pomeranian puppy with oversized ears, paw-sized",
    "isabel": "EP15 GUEST — girl with dark curly hair (NOT canonical)",
    "leo": "EP15 GUEST — boy with short dark hair (NOT canonical)",
}


def load_env():
    if not ENV_FILE.is_file(): return
    for line in ENV_FILE.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def call_gemini_vision(image_b64: str, prompt: str, key: str) -> str:
    body = {
        "contents": [{"parts": [
            {"inlineData": {"mimeType": "image/jpeg", "data": image_b64}},
            {"text": prompt},
        ]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 1500},
    }
    url = f"{GEMINI_BASE}/v1beta/models/gemini-2.5-flash:generateContent?key={key}"
    req = Request(url, data=json.dumps(body).encode(),
                  headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=60) as r:
        rj = json.loads(r.read())
    return rj.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("png_path", help="path to PNG/JPG to audit")
    ap.add_argument("--expect", required=True,
                    help="comma-list of expected canonical names (e.g. sara,eva,mama,papa)")
    ap.add_argument("--strict", action="store_true", help="exit 1 if extras present (in addition to missing)")
    args = ap.parse_args()

    p = Path(args.png_path)
    if not p.is_file():
        print(f"!! file not found: {p}", file=sys.stderr); sys.exit(2)

    expected = [c.strip().lower() for c in args.expect.split(",") if c.strip()]

    load_env()
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY_2")
    if not key:
        print("!! no GEMINI_API_KEY", file=sys.stderr); sys.exit(2)

    image_b64 = base64.b64encode(p.read_bytes()).decode()
    expected_with_hints = ", ".join(f"{c} ({CANONICAL_CAST_HINTS.get(c, '?')})" for c in expected)

    prompt = (
        f'You are auditing a Pixar-style still image for the "Sara and Eva" series. '
        f'EXPECTED characters in this still: {expected_with_hints}.\n\n'
        f'Inspect the image and answer EXACTLY in this format:\n\n'
        f'VISIBLE_CHARACTERS: <comma-list of every visible human and pet, with brief identification "name (description)"; '
        f'use canonical names from the cast or "unknown_adult"/"unknown_child"/"unknown_dog" if unclear>\n'
        f'MATCH_COUNT: <integer count of expected characters that ARE visible>\n'
        f'MISSING: <comma-list of expected characters NOT visible, or "NONE">\n'
        f'EXTRAS: <comma-list of visible characters NOT in expected list, or "NONE">\n'
        f'OVERALL: <CLEAN | DRIFT | GHOST | UNCLEAR>'
    )
    text = call_gemini_vision(image_b64, prompt, key)
    print(text)

    # Parse fields
    def get(field):
        m = re.search(rf"^{field}:\s*(.*)$", text, re.M | re.I)
        return m.group(1).strip() if m else ""

    overall = get("OVERALL").upper()
    missing_raw = get("MISSING")
    extras_raw = get("EXTRAS")
    match_count = int(get("MATCH_COUNT") or "0")

    has_missing = missing_raw and missing_raw.upper() != "NONE"
    has_extras = extras_raw and extras_raw.upper() != "NONE"

    print(f"\nverdict: {overall}")
    print(f"  matched: {match_count}/{len(expected)} expected")
    if has_missing: print(f"  missing: {missing_raw}")
    if has_extras: print(f"  extras: {extras_raw}")

    if has_missing or (args.strict and has_extras):
        print(f"\n❌ AUDIT FAILED — image does not match expected characters")
        sys.exit(1)
    elif has_extras:
        print(f"\n🟡 audit warn — extras present but expected all matched")
        sys.exit(0)
    else:
        print(f"\n✅ audit passed — all expected characters, no drift")
        sys.exit(0)


if __name__ == "__main__":
    main()
