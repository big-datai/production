#!/usr/bin/env python3
"""Submit a Kling image-to-video first/last-frame render.

Mirrors the auth + polling pattern of submitOmniViaApi.mjs but targets the
image2video endpoint with `image` (start frame) + `image_tail` (end frame) for
clean first/last-frame interpolation.

Usage:
    python3 submit_kling_image2video.py \
        --start-url https://storage.googleapis.com/.../start.png \
        --end-url https://storage.googleapis.com/.../end.png \
        --prompt-file action.txt \
        --duration 5 \
        --external-id ep16-clip15-1 \
        --out season_01/episode_16/clips/15.mp4

Notes:
  - Default model is kling-v1-6 (image2video supports first+last frame in v1-6 std)
  - duration 5 or 10 (Kling image2video limit)
  - aspect-ratio default 16:9
"""
from __future__ import annotations
import argparse
import base64
import hmac
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

PROJECT = Path("/Volumes/Samsung500/goreadling-production")
ENV_FILE = PROJECT / ".env.local"
BASE = "https://api-singapore.klingai.com"


def b64url(b: bytes) -> str:
    return base64.b64encode(b).decode().replace("+", "-").replace("/", "_").rstrip("=")


def load_env():
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        import os
        if k and k not in os.environ:
            os.environ[k] = v


def jwt_token() -> str:
    import os
    ak = os.environ.get("KLING_ACCESS_KEY")
    sk = os.environ.get("KLING_SECRET_KEY")
    if not ak or not sk:
        sys.exit("❌ missing KLING_ACCESS_KEY/SECRET_KEY in .env.local")
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"iss": ak, "exp": now + 1800, "nbf": now - 5}
    h = b64url(json.dumps(header, separators=(",", ":")).encode())
    p = b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = b64url(hmac.new(sk.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{sig}"


def http(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    token = jwt_token()
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            text = resp.read().decode()
            return resp.status, json.loads(text)
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(text)
        except Exception:
            return e.code, {"code": -1, "raw": text[:500]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start-url", required=True, help="Public URL of start frame PNG")
    ap.add_argument("--end-url", required=True, help="Public URL of end frame PNG (image_tail)")
    ap.add_argument("--prompt-file", required=True, help="Path to text file with the animation prompt")
    ap.add_argument("--negative-file", help="Optional negative-prompt text file")
    ap.add_argument("--duration", type=int, default=5, choices=[5, 10])
    ap.add_argument("--mode", default="std", choices=["std", "pro"])
    ap.add_argument("--aspect-ratio", default="16:9", choices=["16:9", "9:16", "1:1"])
    ap.add_argument("--model", default="kling-v1-6",
                    help="Model name (default kling-v1-6 supports image_tail)")
    ap.add_argument("--external-id", required=True)
    ap.add_argument("--out", required=True, help="Output mp4 path")
    ap.add_argument("--timeout-min", type=int, default=20)
    args = ap.parse_args()

    load_env()

    prompt = Path(args.prompt_file).read_text().strip()
    if len(prompt) > 2500:
        sys.exit(f"❌ prompt {len(prompt)} chars > 2500 cap")
    negative = ""
    if args.negative_file:
        np_path = Path(args.negative_file)
        if np_path.is_file():
            negative = np_path.read_text().strip()

    payload = {
        "model_name": args.model,
        "prompt": prompt,
        "image": args.start_url,
        "image_tail": args.end_url,
        "duration": str(args.duration),
        "mode": args.mode,
        "aspect_ratio": args.aspect_ratio,
        "external_task_id": args.external_id,
    }
    if negative:
        payload["negative_prompt"] = negative

    print(f"▶ POST /v1/videos/image2video")
    print(f"  model={args.model} mode={args.mode} duration={args.duration}s")
    print(f"  start={args.start_url}")
    print(f"  end  ={args.end_url}")
    print(f"  ext_id={args.external_id}")
    print(f"  prompt: {prompt[:150]}...")

    code, body = http("POST", "/v1/videos/image2video", payload)
    if body.get("code") != 0:
        sys.exit(f"❌ submit failed: HTTP {code}  {json.dumps(body, indent=2)[:800]}")

    task_id = body["data"]["task_id"]
    print(f">> task_id = {task_id}")

    print(f"\n⏳ Polling (timeout {args.timeout_min} min)")
    deadline = time.time() + args.timeout_min * 60
    last_status = None
    while time.time() < deadline:
        time.sleep(8)
        code, poll = http("GET", f"/v1/videos/image2video/{task_id}")
        d = poll.get("data", {}) or {}
        s = d.get("task_status")
        if s != last_status:
            elapsed = int(args.timeout_min * 60 - (deadline - time.time()))
            print(f"  [{elapsed:>3}s] status={s} {d.get('task_status_msg') or ''}")
            last_status = s
        if s == "succeed":
            videos = (d.get("task_result") or {}).get("videos") or []
            if not videos or not videos[0].get("url"):
                sys.exit("❌ succeed but no video url")
            video = videos[0]
            print(f"\n✓ render done  duration={video.get('duration')}s")
            print(f"  url={video['url']}")
            out_path = Path(args.out)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(video["url"]) as r:
                out_path.write_bytes(r.read())
            print(f"✓ saved → {out_path}  ({out_path.stat().st_size // 1024} KB)")
            return
        if s == "failed":
            sys.exit(f"❌ render failed: {json.dumps(d, indent=2)[:600]}")

    sys.exit(f"❌ polling timeout after {args.timeout_min} min")


if __name__ == "__main__":
    main()
