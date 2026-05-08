#!/usr/bin/env python3
"""
Pull Kling /v1/general/advanced-custom-elements listing and reconcile with
content/elements_registry.json. Auto-populates registry keys that map clip
subjects to existing element_ids so kling_ep15_pipeline.mjs resolveElementId
never falls through to null/wrong-element.

Naming conventions detected (kept in sync with the createElementViaApi.mjs
patterns used historically):
  - ep<NN>_<Char>          → registry key as-is (Halloween costumed)
  - <Char>_HW_<Costume>    → registry key ep<NN>_<Char> (Halloween shorthand)
  - <Char>                 → registry key as-is, picks NEWEST element_id when
                             multiple duplicates exist on the API side

Run before any episode submit:
  python3 syncElementsRegistry.py
  python3 syncElementsRegistry.py --episode 16   # filter to one episode
  python3 syncElementsRegistry.py --dry-run      # show planned changes only

Exits 0 on success (registry up to date or successfully updated). Exit 1 if
the Kling API listing fails. Idempotent — safe to run on every pipeline tick.

Why this exists: ep15 retrospective 2026-05-07 showed I (agent) created
duplicate Kling elements because I didn't first listKlingViaApi. That class
of bug is now caught here BEFORE any element create or clip submit.
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ENV_FILE = Path("/Volumes/Samsung500/goreadling-production/.env.local")
REGISTRY_FILE = PROJECT_ROOT / "content" / "elements_registry.json"
BASE = "https://api-singapore.klingai.com"
CACHE_FILE = Path("/tmp/kling_elements_cache.json")
CACHE_TTL_SEC = 60   # short cache so two consecutive runs don't double-fetch

CANONICAL_CHARS = ["Sara", "Eva", "Mama", "Papa", "Joe", "Ginger",
                   "Isabel", "Leo", "Lisa", "Mrs_Patel"]
# How "Mrs_Patel" element name maps to clip-subject string "Mrs. Patel"
NAME_TO_SUBJECT_KEY = {"Mrs_Patel": "Mrs. Patel"}


# ─── env / JWT ─────────────────────────────────────────────────────────────
def load_env():
    if not ENV_FILE.is_file():
        print(f"!! .env.local not found at {ENV_FILE}", file=sys.stderr)
        sys.exit(1)
    for line in ENV_FILE.read_text().splitlines():
        if "=" not in line or line.strip().startswith("#"): continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("'\""))
    ak, sk = os.environ.get("KLING_ACCESS_KEY"), os.environ.get("KLING_SECRET_KEY")
    if not ak or not sk:
        print("!! KLING_ACCESS_KEY / KLING_SECRET_KEY missing", file=sys.stderr)
        sys.exit(1)
    return ak, sk


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def make_jwt(ak: str, sk: str) -> str:
    now = int(time.time())
    h = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    p = b64url(json.dumps({"iss": ak, "exp": now + 1800, "nbf": now - 5}, separators=(",", ":")).encode())
    s = b64url(hmac.new(sk.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{s}"


def get(path: str, token: str):
    req = Request(BASE + path, headers={"Authorization": f"Bearer {token}"})
    with urlopen(req, timeout=20) as r:
        return r.status, json.loads(r.read().decode())


# ─── Kling element listing (cached) ────────────────────────────────────────
def fetch_all_elements(force: bool = False) -> list:
    if not force and CACHE_FILE.is_file():
        age = time.time() - CACHE_FILE.stat().st_mtime
        if age < CACHE_TTL_SEC:
            try: return json.loads(CACHE_FILE.read_text())
            except json.JSONDecodeError: pass
    ak, sk = load_env()
    token = make_jwt(ak, sk)
    all_elements = []
    for page in range(1, 11):
        try:
            status, body = get(f"/v1/general/advanced-custom-elements?pageNum={page}&pageSize=500", token)
        except (HTTPError, URLError) as e:
            print(f"!! Kling API listing failed at page {page}: {e}", file=sys.stderr)
            sys.exit(1)
        if body.get("code") != 0:
            print(f"!! API code={body.get('code')} msg={body.get('message','')[:200]}", file=sys.stderr)
            sys.exit(1)
        page_data = body.get("data") or []
        if not page_data: break
        all_elements.extend(page_data)
        if len(page_data) < 500: break
    CACHE_FILE.write_text(json.dumps(all_elements))
    return all_elements


# ─── Reconcile mappings ────────────────────────────────────────────────────
def parse_element_naming(elements: list, episode_filter: int = None):
    """Return dict of {registry_key -> element_id}.

    Rules (most-specific first):
      ep<NN>_<Char>            → key ep<NN>_<Char>
      <Char>_HW_<Costume>      → key ep<NN>_<Char>  (NN inferred from preview filename later;
                                                     for now we store under ep15 since that's
                                                     the only Halloween episode using HW shorthand)
      bare canonical <Char>    → key <Char>
    Multiple elements with same name → pick newest (highest id).
    """
    by_name: dict[str, list] = {}
    for envelope in elements:
        # Each envelope has task_result.elements[] with the actual element record
        inner_list = (envelope.get("task_result") or {}).get("elements") or []
        for el in inner_list:
            nm = el.get("element_name") or ""
            eid = el.get("element_id")
            if not nm or not eid: continue
            by_name.setdefault(nm, []).append(int(eid))
    # Sort each list descending so [0] is newest
    for k in by_name: by_name[k].sort(reverse=True)

    mapping: dict[str, int] = {}

    # 1. ep<NN>_<Char> direct
    for nm, ids in by_name.items():
        m = re.fullmatch(r"ep(\d{2})_([A-Za-z][A-Za-z_]+)", nm)
        if m:
            ep_num, char = int(m.group(1)), m.group(2)
            if episode_filter and ep_num != episode_filter: continue
            mapping[nm] = ids[0]

    # 2. <Char>_HW_<Costume> shorthand → ep15_<Char>
    HW_TO_EP = 15  # empirically: HW shorthand was used for ep15 only
    for nm, ids in by_name.items():
        m = re.fullmatch(r"([A-Za-z]+)_HW_[A-Za-z]+", nm)
        if m:
            char = m.group(1)
            key = f"ep{HW_TO_EP:02d}_{char}"
            if key not in mapping:   # don't override ep15_Char if already set
                mapping[key] = ids[0]

    # 3. bare canonical characters
    for char in CANONICAL_CHARS:
        if char in by_name:
            mapping[char] = by_name[char][0]
            subj = NAME_TO_SUBJECT_KEY.get(char)
            if subj: mapping[subj] = by_name[char][0]

    return mapping, by_name


# ─── Apply ─────────────────────────────────────────────────────────────────
def apply_mapping(mapping: dict, by_name: dict, dry_run: bool = False, force_update: bool = False) -> tuple[int, int, int]:
    """Returns (added, updated_or_skipped, unchanged).

    Default behavior: add-only. Existing registry keys are NEVER overwritten
    (they're working — sync just fills gaps). Pass --force-update-existing
    to switch to overwrite mode (used when user knows the API has a newer
    canonical version of a character).
    """
    if not REGISTRY_FILE.is_file():
        print(f"!! registry not found: {REGISTRY_FILE}", file=sys.stderr)
        sys.exit(1)
    reg = json.loads(REGISTRY_FILE.read_text())
    added = updated = unchanged = skipped = 0

    for key, eid in mapping.items():
        if key.startswith("_"): continue
        if key not in reg:
            if dry_run:
                print(f"  + would add: {key} = {eid}")
            else:
                reg[key] = eid
            added += 1
        elif int(reg[key]) != eid:
            if force_update:
                if dry_run:
                    print(f"  ↺ would update: {key}: {reg[key]} → {eid}")
                else:
                    reg[key] = eid
                updated += 1
            else:
                # add-only mode: skip
                skipped += 1
        else:
            unchanged += 1
    if skipped > 0:
        print(f"  (skipped {skipped} existing entries — pass --force-update-existing to overwrite)")

    duplicates = [(nm, ids) for nm, ids in by_name.items() if len(ids) > 1]
    if duplicates:
        print(f"\n⚠ {len(duplicates)} element name(s) have duplicates on Kling:")
        for nm, ids in duplicates[:8]:
            print(f"   {nm}: {ids}  (using {ids[0]})")
        if len(duplicates) > 8:
            print(f"   ... and {len(duplicates) - 8} more")

    if not dry_run and (added > 0 or updated > 0):
        REGISTRY_FILE.write_text(json.dumps(reg, indent=2) + "\n")

    return added, updated, unchanged


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, help="filter to one episode (sync only ep<NN>_* keys)")
    ap.add_argument("--dry-run", action="store_true", help="report changes without writing")
    ap.add_argument("--force-refresh", action="store_true", help="ignore cache, re-fetch from API")
    ap.add_argument("--force-update-existing", action="store_true",
                    help="overwrite existing registry entries (default: add-only)")
    args = ap.parse_args()

    print("Pulling Kling element library...")
    elements = fetch_all_elements(force=args.force_refresh)
    print(f"  fetched {len(elements)} element(s)")

    mapping, by_name = parse_element_naming(elements, episode_filter=args.episode)
    print(f"  derived {len(mapping)} registry entries")
    print()

    added, updated, unchanged = apply_mapping(mapping, by_name, dry_run=args.dry_run, force_update=args.force_update_existing)
    verb = "would" if args.dry_run else ""
    print(f"\nSummary: {verb} +{added} added, ↺{updated} updated, ={unchanged} unchanged")

    if args.dry_run and (added or updated):
        print("(--dry-run: no file changes written)")

    sys.exit(0)


if __name__ == "__main__":
    main()
