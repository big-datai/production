#!/usr/bin/env python3
"""
Poll Kling /account/costs for remaining trial-pack balance, read the active
episode's _pipeline_state.json for cumulative submitted-cost, project total
spend for the episode, and alert if it crosses the 2200u abort threshold.

Replaces "manually tail listKlingViaApi.mjs --balance and add it up" with a
single deterministic check.

Usage:
  python3 trackEpisodeBudget.py
  python3 trackEpisodeBudget.py --episode 15
  python3 trackEpisodeBudget.py --episode 16 --abort-threshold 2200

Notes:
  - /account/costs is NOT under /v1 (per lesson_kling_api_cost_rates.md)
  - Snake_case query params: start_time, end_time (ms epochs)
  - Empirical rate: kling-v3-omni std mode = 0.6 units/sec ($0.06/sec at trial pack)
"""
import argparse
import base64
import hashlib
import hmac
import json
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ENV_FILE = Path("/Volumes/Samsung500/goreadling-production/.env.local")
BASE = "https://api-singapore.klingai.com"


# ─── env ───────────────────────────────────────────────────────────────────
def load_env():
    if not ENV_FILE.is_file():
        print(f"!! .env.local not found at {ENV_FILE}", file=sys.stderr)
        sys.exit(1)
    env = {}
    for line in ENV_FILE.read_text().splitlines():
        if "=" not in line or line.strip().startswith("#"): continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip("'\"")
    return env


# ─── JWT (HS256) ───────────────────────────────────────────────────────────
def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def make_jwt(ak: str, sk: str) -> str:
    now = int(time.time())
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(json.dumps({"iss": ak, "exp": now + 1800, "nbf": now - 5}, separators=(",", ":")).encode())
    sig = b64url(hmac.new(sk.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def get(path: str, token: str):
    req = Request(BASE + path, headers={"Authorization": f"Bearer {token}"})
    try:
        with urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode())
    except HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


# ─── balance fetch ─────────────────────────────────────────────────────────
def fetch_balance(token: str, days_back: int = 90):
    now = int(time.time() * 1000)
    ago = now - days_back * 24 * 3600 * 1000
    status, body = get(f"/account/costs?start_time={ago}&end_time={now}", token)
    if body.get("code") != 0:
        return None, body
    return body.get("data", {}).get("resource_pack_subscribe_infos", []), None


# ─── pipeline state reader ─────────────────────────────────────────────────
def read_pipeline_state(ep_num: int):
    p = PROJECT_ROOT / "content" / "episodes" / f"ep{ep_num:02d}" / "_pipeline_state.json"
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError:
        return None


def project_episode_cost(state: dict, ep_dir: Path = None) -> dict:
    """Sum projected cost from pipeline state's clipTasks dict + episode.json.
    Each clipTask entry tracks a submitted Kling task; we estimate cost per
    clip from the corresponding clip JSON's durationSec + soundOn flag.

    Pricing (per lesson_kling_api_cost_rates.md): kling-v3-omni std = 0.6 cr/sec;
    sound:'on' adds ~33%. ep15 baselines: 10s no-sound = 6 cr (= ~90 cr in UI units),
    10s with sound = 8 cr; 15s no-sound = 9 cr. NB: cr unit conversion is approximate
    — the API charges in 0.6 units while episode.json budgets in 'credits' (≈15× ratio)."""
    if not state: return {"clips": 0, "projected": 0, "method": "no_state"}
    clip_tasks = state.get("clipTasks") or {}
    if not isinstance(clip_tasks, dict): clip_tasks = {}

    clips = len(clip_tasks)
    projected = 0
    method = "estimate"

    for task_id, info in clip_tasks.items():
        if not isinstance(info, dict): continue
        # task_id is "clip_<N>" — load matching clip JSON for true duration + sound flag
        clip_n = task_id.replace("clip_", "")
        spec_path = ep_dir / f"{clip_n}.json" if ep_dir else None
        duration = 10
        sound_on = False
        if spec_path and spec_path.is_file():
            try:
                spec = json.loads(spec_path.read_text())
                duration = spec.get("durationSec", 10)
                sound_on = bool(spec.get("nativeAudio") or spec.get("sound") == "on")
                method = "spec_based"
            except Exception:
                pass
        # 0.6 cr/sec * 15× UI-unit ratio ≈ 9 cr/sec; sound+33%
        rate = 9.0
        if sound_on: rate *= 1.33
        projected += int(duration * rate)

    return {"clips": clips, "projected": projected, "method": method}


# ─── main ──────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, help="episode number for projection (optional)")
    ap.add_argument("--abort-threshold", type=int, default=2200, help="abort threshold in cr")
    ap.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = ap.parse_args()

    env = load_env()
    ak, sk = env.get("KLING_ACCESS_KEY"), env.get("KLING_SECRET_KEY")
    if not ak or not sk:
        print("!! missing KLING_ACCESS_KEY / KLING_SECRET_KEY in .env.local", file=sys.stderr)
        sys.exit(1)

    token = make_jwt(ak, sk)
    packs, err = fetch_balance(token)
    if err:
        print(f"!! cost endpoint error: {err}", file=sys.stderr)
        sys.exit(2)

    out = {"packs": [], "episode": None}
    total_remaining = 0
    for p in packs:
        out["packs"].append({
            "name": p.get("resource_pack_name"),
            "remaining": p.get("remaining_quantity"),
            "total": p.get("total_quantity"),
            "type": p.get("resource_pack_type"),
            "expires": p.get("invalid_time"),
        })
        total_remaining += p.get("remaining_quantity", 0)

    if args.episode:
        state = read_pipeline_state(args.episode)
        ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}"
        proj = project_episode_cost(state, ep_dir) if state else {"clips": 0, "projected": 0, "method": "no_state"}
        out["episode"] = {
            "episode": args.episode,
            "clips_submitted": proj["clips"],
            "projected_cr": proj["projected"],
            "abort_threshold": args.abort_threshold,
            "method": proj["method"],
            "over_threshold": proj["projected"] > args.abort_threshold,
            "remaining_balance_after": total_remaining - proj["projected"],
        }

    if args.json:
        print(json.dumps(out, indent=2))
        sys.exit(0)

    print("=== Kling balance ===")
    for p in out["packs"]:
        print(f"  {p['name']}: {p['remaining']}/{p['total']} cr  (type={p['type']}, expires={p['expires']})")
    print(f"  TOTAL remaining: {total_remaining} cr\n")

    if args.episode:
        e = out["episode"]
        print(f"=== ep{args.episode:02d} projection ===")
        print(f"  clips submitted: {e['clips_submitted']}")
        print(f"  projected cost: {e['projected_cr']} cr  (method={e['method']})")
        print(f"  abort threshold: {e['abort_threshold']} cr")
        print(f"  remaining after: {e['remaining_balance_after']} cr")
        if e["over_threshold"]:
            print("\n🛑 OVER ABORT THRESHOLD: stop submitting more clips")
            sys.exit(3)
        elif e["projected_cr"] > e["abort_threshold"] * 0.85:
            print(f"\n⚠ approaching threshold ({int(e['projected_cr']/e['abort_threshold']*100)}%)")

    sys.exit(0)


if __name__ == "__main__":
    main()
