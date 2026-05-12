#!/usr/bin/env python3
"""
Create a Kling element via the official AK/SK API and append its
element_id to content/elements_registry.json.

Faithful Python port of createElementViaApi.mjs PLUS Fix B
(durability lesson_costume_element_coverage_gap.md): IDEMPOTENCY CHECK.
Before POSTing the create, list existing elements and search for matching
external_id. If found, skip the create and just write the existing
element_id to registry. Prevents the ep15-style duplicate problem where
the agent created 4 duplicate Kling elements because nobody checked first.

Usage:
  python3 createElementViaApi.py \\
    --name Mama \\
    --description "Adult woman, blonde hair, family-show character" \\
    --frontal https://storage.googleapis.com/saraandeva-kling-elements/characters/mama_front.png \\
    --refer https://.../mama_3q.png \\
    --refer https://.../mama_profile.png \\
    [--tag o_102]            # default Character
    [--external-id mama-1]
    [--force]                # ignore idempotency, always POST create

Tag IDs: o_101 Hottest, o_102 Character, o_103 Animal, o_104 Item,
         o_105 Costume, o_106 Scene, o_107 Effect, o_108 Others.

Note: Kling rejects refer_images with 0 entries — duplicate frontal if no
refers given.
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ENV_FILE = Path("/Volumes/Samsung500/goreadling-production/.env.local")
REGISTRY_FILE = PROJECT_ROOT / "content" / "elements_registry.json"
BASE = "https://api-singapore.klingai.com"
GENRE_CAP_NAME = 20
CAP_DESC = 100


def load_env():
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


def http(method: str, path: str, ak: str, sk: str, body=None):
    headers = {"Authorization": f"Bearer {make_token(ak, sk)}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    req = Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urlopen(req, timeout=30) as r:
            text = r.read().decode()
            try: return r.status, json.loads(text)
            except json.JSONDecodeError: return r.status, {"code": -1, "raw": text[:200]}
    except HTTPError as e:
        try: return e.code, json.loads(e.read().decode())
        except Exception: return e.code, {"code": -1, "_http_error": str(e)}


# Fix B — idempotency search
def find_existing_by_external_id(ak: str, sk: str, external_id: str):
    """Search Kling library for existing element with matching external_id.
    Returns element_id or None."""
    for page in range(1, 11):
        status, body = http("GET",
            f"/v1/general/advanced-custom-elements?pageNum={page}&pageSize=500",
            ak, sk)
        if body.get("code") != 0: return None
        envelopes = body.get("data") or []
        if not envelopes: return None
        for env in envelopes:
            ti = env.get("task_info") or {}
            if ti.get("external_task_id") == external_id:
                el = ((env.get("task_result") or {}).get("elements") or [{}])[0]
                if el.get("element_id"):
                    return int(el["element_id"])
        if len(envelopes) < 500: return None
    return None


def write_registry(name: str, element_id: int):
    reg = json.loads(REGISTRY_FILE.read_text()) if REGISTRY_FILE.is_file() else {}
    reg[name] = element_id
    REGISTRY_FILE.write_text(json.dumps(reg, indent=2) + "\n")
    print(f"✓ registry updated: {REGISTRY_FILE.relative_to(PROJECT_ROOT)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--description", required=True)
    ap.add_argument("--frontal", required=True)
    ap.add_argument("--refer", action="append", default=[])
    ap.add_argument("--tag", default="o_102")
    ap.add_argument("--external-id", default=None)
    ap.add_argument("--force", action="store_true",
                    help="bypass idempotency check (always POST create)")
    args = ap.parse_args()

    if len(args.name) > GENRE_CAP_NAME:
        print(f"name > {GENRE_CAP_NAME} chars", file=sys.stderr); sys.exit(1)
    if len(args.description) > CAP_DESC:
        print(f"description > {CAP_DESC} chars", file=sys.stderr); sys.exit(1)

    refer_list = args.refer if args.refer else [args.frontal]
    if len(refer_list) > 3:
        print("max 3 refers", file=sys.stderr); sys.exit(1)

    external_id = args.external_id or f"{args.name.lower().replace(' ', '_')}-1"
    ak, sk = load_env()

    # ─── Fix B: idempotency check ────────────────────────────────────────
    if not args.force:
        print(f"▶ checking existing element by external_id={external_id}...")
        existing = find_existing_by_external_id(ak, sk, external_id)
        if existing:
            print(f"✓ existing element_id={existing} (external_id match) — skipping create")
            write_registry(args.name, existing)
            sys.exit(0)

    # ─── POST create ─────────────────────────────────────────────────────
    payload = {
        "element_name": args.name,
        "element_description": args.description,
        "reference_type": "image_refer",
        "element_image_list": {
            "frontal_image": args.frontal,
            "refer_images": [{"image_url": u} for u in refer_list],
        },
        "tag_list": [{"tag_id": args.tag}],
        "external_task_id": external_id,
    }
    print(f"▶ POST /v1/general/advanced-custom-elements  (name=\"{args.name}\")")
    status, body = http("POST", "/v1/general/advanced-custom-elements", ak, sk, payload)
    if body.get("code") != 0:
        print(f"!! create failed: {json.dumps(body, indent=2)[:600]}", file=sys.stderr); sys.exit(1)
    task_id = body["data"]["task_id"]
    print(f">> task_id={task_id}, polling...")

    deadline = time.time() + 5 * 60
    while time.time() < deadline:
        time.sleep(5)
        _, poll = http("GET", f"/v1/general/advanced-custom-elements/{task_id}", ak, sk)
        d = poll.get("data") or {}
        if d.get("task_status") == "succeed":
            els = (d.get("task_result") or {}).get("elements") or []
            if not els or not els[0].get("element_id"):
                print("succeed but no element", file=sys.stderr); sys.exit(1)
            eid = int(els[0]["element_id"])
            ded = d.get("final_unit_deduction", 0)
            print(f"\n✓ element_id={eid}  deduction={ded}u")
            write_registry(args.name, eid)
            sys.exit(0)
        if d.get("task_status") == "failed":
            print(f"!! create failed: {json.dumps(d, indent=2)[:600]}", file=sys.stderr); sys.exit(1)
    print("!! polling timeout", file=sys.stderr); sys.exit(1)


if __name__ == "__main__":
    main()
