#!/usr/bin/env python3
"""
Deep audit of a per-clip Nano still BEFORE Kling submission.

Goes beyond identity-only checks (`auditScenePNG.py`) — verifies the still
matches the clip's INTENDED action, with no anatomy/physics defects.

User directive 2026-05-12 (post-clip-21 + tooth-floating-on-clip-2 incidents):
"when checking who is in the image also check that the image is good for
example a tooth is flying on image 2, that should have been detected"

5 audit dimensions per still:
  A. SUBJECTS       — correct characters present, no strangers, no missing
  B. ACTION         — what's happening matches the clip spec's described beat
  C. ANATOMY        — no extra/missing limbs, no floating body parts
  D. PHYSICS        — handheld objects ARE held (not floating mid-air), feet
                      touch ground, hair/cloth physics plausible
  E. WARDROBE       — characters in the LOCKED ep wardrobe (per memory canon)

Calls Gemini Vision Flash with a structured prompt referencing the clip
spec's exact action description. Per-dimension verdict + per-issue detail.

Cost: ~$0.005/still in Gemini. ~10s wall.

Usage:
    python3 auditClipStill.py --episode 16 --clip 2
    python3 auditClipStill.py --episode 16 --clip 2 --json
    python3 auditClipStill.py --episode 16 --all                 # every clip

Exit codes:
    0 = all dimensions PASS for the audited clip(s)
    1 = at least one dimension FAIL (fix locally before Kling)
    2 = infrastructure error (file missing, API error)
"""
from __future__ import annotations
import argparse
import base64
import json
import os
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ENV_FILE = Path("/Volumes/Samsung500/goreadling-production/.env.local")
GEMINI_BASE = "https://generativelanguage.googleapis.com"


def load_env():
    if not ENV_FILE.is_file(): return
    for line in ENV_FILE.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def call_gemini(image_b64: str, prompt: str, key: str) -> str:
    body = {
        "contents": [{"parts": [
            {"inlineData": {"mimeType": "image/png", "data": image_b64}},
            {"text": prompt},
        ]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 3000},
    }
    url = f"{GEMINI_BASE}/v1beta/models/gemini-2.5-flash:generateContent?key={key}"
    req = Request(url, data=json.dumps(body).encode(),
                  headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=90) as r:
        rj = json.loads(r.read())
    return rj.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")


def find_still(ep_dir: Path, clip_n: int) -> Path | None:
    stills = ep_dir / "stills"
    if not stills.is_dir(): return None
    for pat in (f"clip_{clip_n:02d}_*.png", f"clip_{clip_n}_*.png"):
        m = sorted(p for p in stills.glob(pat) if p.is_file() and "old" not in p.parts)
        if m: return m[0]
    return None


def extract_action_summary(prompt_text: str, max_chars: int = 800) -> str:
    """Pull the action-describing prose from the clip spec prompt (strip @ refs)."""
    p = re.sub(r"@([A-Za-z][A-Za-z0-9_]*)", r"\1", prompt_text)
    return p[:max_chars]


def audit_one_clip(ep_num: int, clip_n: int, api_key: str) -> dict:
    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{ep_num:02d}"
    clip_p = ep_dir / f"{clip_n}.json"
    if not clip_p.is_file():
        return {"clip": clip_n, "error": f"spec missing: {clip_p}"}
    still = find_still(ep_dir, clip_n)
    if not still:
        return {"clip": clip_n, "error": f"still missing for clip {clip_n}"}

    clip = json.loads(clip_p.read_text())
    subjects = clip.get("subjects") or []
    prompt_text = " ".join(clip["prompt"]) if isinstance(clip.get("prompt"), list) else (clip.get("prompt") or "")
    action = extract_action_summary(prompt_text)
    scene = clip.get("scene") or "(unknown)"

    image_b64 = base64.b64encode(still.read_bytes()).decode()

    # Try to load the wardrobe theme from episode.json so audit knows the locked state
    ep_json = ep_dir / "episode.json"
    wardrobe_theme = ""
    if ep_json.is_file():
        try:
            wardrobe_theme = json.loads(ep_json.read_text()).get("wardrobeTheme", "")
        except Exception:
            pass

    audit_prompt = (
        f'You are deep-auditing a Pixar-style still image for the "Sara and Eva" kids\' '
        f'animated series. This still will be the start-frame for a Kling video render '
        f'costing ~$0.70-1.40, so we must catch defects NOW.\n\n'
        f'CLIP SPEC:\n'
        f'  Scene tag: {scene}\n'
        f'  Subjects (must be visible, no strangers, no extras): {subjects}\n'
        f'  Wardrobe theme for this episode: {wardrobe_theme[:200] if wardrobe_theme else "(none)"}\n'
        f'  Intended action / composition:\n    {action}\n\n'
        f'Inspect the image and answer EXACTLY in this format. Be strict — '
        f'if anything is off, flag it.\n\n'
        f'A_SUBJECTS_VERDICT: <PASS | FAIL>\n'
        f'A_SUBJECTS_DETAIL: <one-line — list visible characters/pets, note any missing/extra/stranger>\n\n'
        f'B_ACTION_VERDICT: <PASS | FAIL>\n'
        f'B_ACTION_DETAIL: <one-line — does the composition match the spec\'s described beat? '
        f'e.g. for a "tooth drops into palm" spec, is the tooth IN the palm and not floating>\n\n'
        f'C_ANATOMY_VERDICT: <PASS | FAIL>\n'
        f'C_ANATOMY_DETAIL: <one-line — any extra/missing limbs, fused fingers, wrong-number hands, twisted joints>\n\n'
        f'D_PHYSICS_VERDICT: <PASS | FAIL>\n'
        f'D_PHYSICS_DETAIL: <one-line — be aggressive: look for FLOATING objects (tooth, coin, paper, '
        f'toy mid-air with no hand or surface contact); levitating props; feet not touching ground; '
        f'hair/cloth in physically impossible positions. If the spec says "drops into palm" verify the '
        f'object is RESTING ON the palm not separated from it by visible gap. FAIL if ANY object floats>\n\n'
        f'E_WARDROBE_VERDICT: <PASS | FAIL>\n'
        f'E_WARDROBE_DETAIL: <one-line — wardrobe matches episode theme (e.g. pajamas); no day-clothes if episode is pajama-themed>\n\n'
        f'OVERALL: <CLEAN | REGENERATE>\n'
        f'TOP_DEFECT: <one-sentence summary of the worst issue if FAIL, else "none">'
    )
    text = call_gemini(image_b64, audit_prompt, api_key)

    def grep(field: str) -> str:
        m = re.search(rf"^{field}:\s*(.*?)$", text, re.M)
        return m.group(1).strip() if m else ""

    result = {"clip": clip_n, "still": still.name,
              "spec_subjects": subjects, "spec_scene": scene}
    dims = {"A": "subjects", "B": "action", "C": "anatomy", "D": "physics", "E": "wardrobe"}
    fails = []
    for k, name in dims.items():
        verdict = grep(f"{k}_{name.upper()}_VERDICT").upper()
        detail = grep(f"{k}_{name.upper()}_DETAIL")
        result[f"{k}_{name}"] = {"verdict": verdict, "detail": detail}
        if verdict == "FAIL":
            fails.append(f"{k}.{name}: {detail}")
    result["overall"] = grep("OVERALL").upper()
    result["top_defect"] = grep("TOP_DEFECT")
    result["fails"] = fails
    result["raw"] = text
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--episode", "-e", type=int, required=True)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--clip", "-c", type=int)
    g.add_argument("--all", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    load_env()
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY_2")
    if not key:
        print("!! no GEMINI_API_KEY", file=sys.stderr); sys.exit(2)

    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
    if not ep_dir.is_dir():
        print(f"!! episode dir not found: {ep_dir}", file=sys.stderr); sys.exit(2)

    if args.all:
        clip_nums = sorted(int(p.stem) for p in ep_dir.iterdir()
                          if re.fullmatch(r"\d+\.json", p.name))
    else:
        clip_nums = [args.clip]

    results = []
    any_fail = False
    for n in clip_nums:
        r = audit_one_clip(args.episode, n, key)
        results.append(r)
        if r.get("error"):
            print(f"  ✗ clip {n}: {r['error']}")
            any_fail = True
            continue
        if r["overall"] == "REGENERATE" or r["fails"]:
            any_fail = True
            print(f"  ❌ clip {n}: {len(r['fails'])} fail(s)")
            for f in r["fails"]:
                print(f"     • {f}")
            if r.get("top_defect") and r["top_defect"].lower() != "none":
                print(f"     ⤷ top defect: {r['top_defect']}")
        else:
            print(f"  ✓ clip {n}: PASS")

    if args.json: print(json.dumps(results, indent=2))
    sys.exit(1 if any_fail else 0)


if __name__ == "__main__":
    main()
