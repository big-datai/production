#!/usr/bin/env python3
"""
List Kling resources via the official AK/SK API.

Faithful Python port of listKlingViaApi.mjs. Uses standard library only
(urllib + hmac + hashlib + base64).

Usage:
  python3 listKlingViaApi.py --elements                          # custom element library
  python3 listKlingViaApi.py --presets                           # 54 official preset elements
  python3 listKlingViaApi.py --videos [--mode multi-image2video] # video tasks (default: omni-video)
  python3 listKlingViaApi.py --balance                           # remaining trial-pack units
  python3 listKlingViaApi.py --all                               # all of the above
"""
import argparse, base64, datetime, hashlib, hmac, json, os, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ENV_FILE = Path("/Volumes/Samsung500/goreadling-production/.env.local")
BASE = "https://api-singapore.klingai.com"


def load_env():
    if not ENV_FILE.is_file():
        print(f"!! {ENV_FILE} not found", file=sys.stderr); sys.exit(1)
    for line in ENV_FILE.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))
    ak, sk = os.environ.get("KLING_ACCESS_KEY"), os.environ.get("KLING_SECRET_KEY")
    if not ak or not sk:
        print("missing KLING keys in .env.local", file=sys.stderr); sys.exit(1)
    return ak, sk


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def make_token(ak: str, sk: str) -> str:
    now = int(time.time())
    h = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    p = b64url(json.dumps({"iss": ak, "exp": now + 1800, "nbf": now - 5}, separators=(",", ":")).encode())
    s = b64url(hmac.new(sk.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{s}"


def get(path: str, ak: str, sk: str):
    req = Request(BASE + path, headers={"Authorization": f"Bearer {make_token(ak, sk)}"})
    try:
        with urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except HTTPError as e:
        try: body = json.loads(e.read().decode())
        except Exception: body = {}
        return e.code, body
    except URLError as e:
        return -1, {"_error": str(e)}


def list_envelope(path: str, label: str, ak: str, sk: str, max_pages: int = 10, page_size: int = 500):
    print(f"\n=== {label}  ({path}) ===")
    all_envelopes = []
    for page in range(1, max_pages + 1):
        status, body = get(f"{path}?pageNum={page}&pageSize={page_size}", ak, sk)
        if body.get("code") != 0:
            print(f"  page {page}: {json.dumps(body)[:200]}")
            return
        data = body.get("data") or []
        all_envelopes.extend(data)
        if len(data) < page_size:
            break
    elements = []
    for env in all_envelopes:
        elements.extend((env.get("task_result") or {}).get("elements") or [])
    print(f"  {len(elements)} element(s) across {len(all_envelopes)} envelope(s)")
    for el in elements:
        tags = ",".join(str(t.get("tag_id", "")) for t in (el.get("tag_list") or []))
        desc = (el.get("element_description") or "")[:50]
        eid = str(el.get("element_id", ""))
        nm = json.dumps(el.get("element_name", ""))
        print(f"  id={eid:<20}  name={nm:<28}  tags=[{tags}]  {json.dumps(desc)}")


def list_videos(mode: str, ak: str, sk: str, limit: int = 30):
    path = "/v1/videos/omni-video" if mode == "omni-video" else f"/v1/videos/{mode}"
    print(f"\n=== Video tasks  ({path}) ===")
    status, body = get(f"{path}?pageNum=1&pageSize={limit}", ak, sk)
    if body.get("code") != 0:
        print(json.dumps(body)[:300]); return
    tasks = body.get("data") or []
    print(f"  {len(tasks)} task(s)")
    for t in tasks:
        ts = "?"
        if t.get("created_at"):
            try: ts = datetime.datetime.fromtimestamp(t["created_at"] / 1000).strftime("%Y-%m-%dT%H:%M:%S")
            except Exception: ts = "?"
        st = str(t.get("task_status") or "?").ljust(10)
        ext = (t.get("task_info") or {}).get("external_task_id", "")
        ext = f"ext={ext}" if ext else ""
        url = "(has-mp4)" if (t.get("task_result") or {}).get("videos") else ""
        prompt = ((t.get("task_info") or {}).get("parameter") or {}).get("prompt", "")[:80]
        print(f"  {ts}  {st}  {t.get('task_id')}  {ext}  {url}")
        if prompt:
            print(f"      \"{prompt}...\"")


def list_balance(ak: str, sk: str):
    now = int(time.time() * 1000)
    ago = now - 90 * 24 * 3600 * 1000
    status, body = get(f"/account/costs?start_time={ago}&end_time={now}", ak, sk)
    print("\n=== Resource pack balance ===")
    for pack in ((body.get("data") or {}).get("resource_pack_subscribe_infos") or []):
        exp = "?"
        try: exp = datetime.datetime.fromtimestamp(pack["invalid_time"] / 1000).strftime("%Y-%m-%d")
        except Exception: pass
        print(f"  {pack.get('resource_pack_name')}")
        print(f"    remaining={pack.get('remaining_quantity')} / total={pack.get('total_quantity')}  "
              f"type={pack.get('resource_pack_type')}  expires={exp}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--elements", action="store_true")
    ap.add_argument("--presets", action="store_true")
    ap.add_argument("--videos", action="store_true")
    ap.add_argument("--balance", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--mode", default="omni-video")
    args = ap.parse_args()

    if not (args.all or args.elements or args.presets or args.videos or args.balance):
        print("Usage: --elements | --presets | --videos [--mode] | --balance | --all", file=sys.stderr)
        sys.exit(1)

    ak, sk = load_env()
    if args.all or args.elements: list_envelope("/v1/general/advanced-custom-elements", "CUSTOM ELEMENTS", ak, sk)
    if args.all or args.presets:  list_envelope("/v1/general/advanced-presets-elements", "PRESET ELEMENTS", ak, sk, 2, 30)
    if args.all or args.videos:   list_videos(args.mode, ak, sk)
    if args.all or args.balance:  list_balance(ak, sk)


if __name__ == "__main__":
    main()
