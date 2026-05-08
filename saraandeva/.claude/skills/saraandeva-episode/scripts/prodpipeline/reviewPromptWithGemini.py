#!/usr/bin/env python3
"""
Gemini 3 Pro Preview second-opinion review for a Kling Omni v3 prompt
BEFORE submitting. Catches static-render verbs, ambiguous action,
duplicate-character risk, horror tone, anatomy ambiguity.

Faithful Python port of reviewPromptWithGemini.mjs PLUS clip-JSON aware mode:
loads <ep>/<N>.json directly, joins paragraph array, includes negativePrompt.

Usage:
  # clip-JSON mode (recommended)
  python3 reviewPromptWithGemini.py --episode 15 --clip 17

  # arbitrary prompt mode (legacy)
  echo "$PROMPT" | python3 reviewPromptWithGemini.py
  python3 reviewPromptWithGemini.py --prompt-file path

  # batch all clips of an episode
  python3 reviewPromptWithGemini.py --episode 15 --all

Exit codes:
  0  PASS
  1  FAIL — review surfaces required fixes printed to stdout
  2  infrastructure error (missing env, API failure)
"""
import argparse
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ENV_CANDIDATES = [
    Path("/Volumes/Samsung500/goreadling-production/.env.local"),
    PROJECT_ROOT.parent / ".env.local",
]
GEMINI_BASE = "https://generativelanguage.googleapis.com"
MODEL = "gemini-2.5-flash"   # was gemini-3-pro-preview — flash returns full text
                              # without thinking-token truncation, plenty fast for reviews

REVIEWER_SYSTEM = '''You are a video-prompt reviewer for the Kling Omni v3 ("kling-v3-omni") image-to-video model used to produce the "Sara and Eva" Pixar-style children's animated series.

You will be given a prompt the user is about to submit. Identify any of these specific failure modes:

(1) STATIC-RENDER RISK: prompt uses gentle/soft/dreamy/subtle motion verbs without anchoring them to specific body parts. Kling renders "gentle sway" as nearly motionless. Required: every action beat must name a specific body part with the verb in CAPS (e.g. "Papa's right FIST KNOCKS", "cheeks SWELL", "hips SWAY left-then-right").

(2) AMBIGUOUS ACTION: a character is named but the prompt doesn't specify what body part of theirs is moving. Either delete the mention or add a body-part-locked verb beat.

(3) DUPLICATE-CHARACTER RISK: motion-toward verbs (walks toward, approaches, runs to, heads to) without a static placement, OR generic group nouns (the family, the kids, everyone) — known clone triggers.

(4) HORROR TONE for kid show: words like fangs, sharp teeth, scary, predatory, growl, snarl, blood, gore, real wolf snout, dark shadows, threatening — don't belong in Pixar kid show.

(5) ANATOMY AMBIGUITY: any beat where a character's hands/arms aren't explicitly anchored. Every character should have hand position locked at all times.

(6) SISTER VISUAL COLLISION: when both Sara AND Eva are in the same shot, the prompt MUST distinguish them (Sara: ponytail/wavy dark-blonde, Eva: curly bright-blonde). Generic "two girls" → Kling renders identical twins.

(7) COSTUME DRIFT RISK: when a character has an episode-specific costume (Papa werewolf, Eva pumpkin, etc), the prompt should remind the costume keyword in EACH shot where they appear. Without re-mention, Kling drifts to baseline character or full-version of costume (e.g. "werewolf" → full wolf instead of friendly-werewolf-with-mask).

(8) NEGATIVE PROMPT GAPS: if action is Papa-active or kids-active, negative MUST include passive-state bans (papa standing still, papa motionless, kids frozen). If 5+ characters in scene, negative MUST include extras/clones bans.

(9) NUMERIC PROP RISK: if prompt mentions a counted prop ("five stars", "three pumpkins"), Kling renders the wrong count. Either drop the visible count and put it only in audio, or accept the drift.

If the prompt is fine, reply with EXACTLY:
PASS

Otherwise reply with:
FAIL
1. <specific issue>: <suggested exact substitution>
2. ...

Be terse. Only flag real problems. Cap at 8 items.'''


def load_env():
    for p in ENV_CANDIDATES:
        if not p.is_file(): continue
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))
        return


def get_keys() -> list[str]:
    keys = []
    for nm in ("GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
               "GEMINI_API_KEY_4", "GEMINI_API_KEY_5", "GEMINI_API_KEY_6"):
        v = os.environ.get(nm)
        if v: keys.append(v.replace('"', '').strip())
    return keys


def coerce_prompt(v, sep: str = "\n\n") -> str:
    if v is None: return ""
    if isinstance(v, list): return sep.join(str(x) for x in v)
    return str(v)


def call_gemini(api_key: str, prompt_text: str, neg_text: str = "") -> str:
    user_msg = f"=== PROMPT ===\n{prompt_text}\n"
    if neg_text:
        user_msg += f"\n=== NEGATIVE PROMPT ===\n{neg_text}"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": REVIEWER_SYSTEM + "\n\n" + user_msg}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 2000},
    }
    req = Request(f"{GEMINI_BASE}/v1beta/models/{MODEL}:generateContent?key={api_key}",
                  data=json.dumps(payload).encode(),
                  headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=60) as r:
        body = json.loads(r.read().decode())
    return (body.get("candidates", [{}])[0]
                .get("content", {}).get("parts", [{}])[0].get("text", "")).strip()


def review_one(prompt_text: str, neg_text: str, keys: list[str]) -> tuple[str, bool]:
    """Returns (verdict_text, passed_bool)."""
    last_err = None
    for k in keys:
        try:
            text = call_gemini(k, prompt_text, neg_text)
            verdict = text.split("\n")[0].strip().upper()
            return text, verdict.startswith("PASS")
        except (HTTPError, OSError) as e:
            last_err = e
    return f"!! all Gemini keys failed: {last_err}", False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, default=None)
    ap.add_argument("--clip", "-c", type=int, default=None)
    ap.add_argument("--all", action="store_true", help="review all numeric clips of episode")
    ap.add_argument("--prompt-file", default=None)
    ap.add_argument("--negative-file", default=None)
    args = ap.parse_args()

    load_env()
    keys = get_keys()
    if not keys:
        print("No GEMINI_API_KEY* in env", file=sys.stderr); sys.exit(2)

    # Mode 1: episode + clip from JSON
    if args.episode and (args.clip or args.all):
        ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
        if args.all:
            clip_files = sorted(p for p in ep_dir.iterdir()
                                if p.suffix == ".json" and p.stem.isdigit())
        else:
            clip_files = [ep_dir / f"{args.clip}.json"]

        any_failed = False
        for cf in clip_files:
            if not cf.is_file():
                print(f"!! {cf} not found", file=sys.stderr); any_failed = True; continue
            spec = json.loads(cf.read_text())
            prompt = coerce_prompt(spec.get("prompt"))
            neg = coerce_prompt(spec.get("negativePrompt"), sep=", ")
            print(f"\n{'═'*70}\nReview {cf.name} (subjects={spec.get('subjects')})\n{'═'*70}")
            text, ok = review_one(prompt, neg, keys)
            print(text)
            if not ok: any_failed = True
        sys.exit(0 if not any_failed else 1)

    # Mode 2: arbitrary prompt
    if args.prompt_file:
        prompt = Path(args.prompt_file).read_text().strip()
    else:
        prompt = sys.stdin.read().strip()
    if not prompt:
        print("Empty prompt", file=sys.stderr); sys.exit(2)
    neg = Path(args.negative_file).read_text().strip() if args.negative_file else ""

    text, ok = review_one(prompt, neg, keys)
    print(text)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
