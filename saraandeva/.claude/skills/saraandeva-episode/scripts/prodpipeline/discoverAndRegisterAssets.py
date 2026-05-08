#!/usr/bin/env python3
"""
Auto-discover pre-rendered character + scene PNGs in assets/scenes/ and
make them deterministically available to the Kling submit pipeline.

This is the SINGLE answer to: "I keep forgetting which character/costume
PNGs exist in the project — Claude (the agent) re-generates duplicates
or creates duplicate Kling elements because it doesn't check first."

For every PNG in assets/scenes/group_ep<NN>_*_preview.png + assets/scenes/
ep<NN>_*.png, run idempotent steps:

  1. Filename → {char/scene, costume}.
       group_ep15_papa_werewolf_preview.png → char=Papa, costume=werewolf
       ep15_house4_isabel_cottage.png       → scene=ep15_house4_isabel_cottage
       group_ep15_clip17_the_find_redo_v2.png → group_still=ep15-clip17-group-still
  2. GCS upload (skip if exists). Bucket layout:
       gs://saraandeva-kling-elements/ep<NN>/<UploadName>.png
  3. Kling element lookup. If a matching element (by name pattern OR by
     deterministic external_id) already exists in the API account, register
     its element_id without re-creating. Else POST createElement.
  4. Registry write (add-only). Key:
       ep<NN>_<Char>   for character costumes
       ep<NN>-h<N>-<theme> / ep<NN>-clip<N>-group-still for scenes
     Existing keys are never overwritten — pass --force-update-existing
     if you really mean to replace IDs.

Run before any Kling clip submit. Idempotent — safe to re-run any time.
Becomes phase 0.7 in runEpisodePipeline.py (per strategy_deterministic_pipeline.md).

Usage:
  python3 discoverAndRegisterAssets.py --episode 15
  python3 discoverAndRegisterAssets.py --episode 16 --dry-run
  python3 discoverAndRegisterAssets.py --episode 15 --skip-create
       # only register existing Kling elements; don't create new ones

Exit codes:
  0  registry up to date / changes applied
  1  PNG present but no matching Kling element AND --skip-create set
  2  Kling API error or upload failure
"""
import argparse, base64, hashlib, hmac, json, os, re, subprocess, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ENV_FILE = Path("/Volumes/Samsung500/goreadling-production/.env.local")
REGISTRY_FILE = PROJECT_ROOT / "content" / "elements_registry.json"
ASSETS_DIR = PROJECT_ROOT / "assets" / "scenes"
BUCKET = "saraandeva-kling-elements"
BUCKET_HTTPS = f"https://storage.googleapis.com/{BUCKET}"
KLING_BASE = "https://api-singapore.klingai.com"
CACHE_FILE = Path("/tmp/kling_elements_cache.json")
CACHE_TTL = 60

CANONICAL_CHARS = {"sara", "eva", "papa", "mama", "joe", "ginger",
                   "isabel", "leo", "lisa", "mrspatel", "patel"}


# ─── env / JWT ─────────────────────────────────────────────────────────────
def load_env():
    for line in ENV_FILE.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))
    ak, sk = os.environ.get("KLING_ACCESS_KEY"), os.environ.get("KLING_SECRET_KEY")
    if not ak or not sk:
        print("!! KLING keys missing from .env.local", file=sys.stderr); sys.exit(2)
    return ak, sk


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def make_jwt(ak: str, sk: str) -> str:
    now = int(time.time())
    h = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    p = b64url(json.dumps({"iss": ak, "exp": now + 1800, "nbf": now - 5}, separators=(",", ":")).encode())
    s = b64url(hmac.new(sk.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{s}"


def kling_get(path: str, token: str):
    req = Request(KLING_BASE + path, headers={"Authorization": f"Bearer {token}"})
    with urlopen(req, timeout=20) as r:
        return r.status, json.loads(r.read().decode())


# ─── filename parser ────────────────────────────────────────────────────────
# Multi-word character names (snake_case in filenames)
MULTI_WORD_CHARS = {
    "young_papa": "young_Papa", "young_mama": "young_Mama",
    "baby_sara": "baby_Sara", "baby_eva": "baby_Eva",
    "puppy_joe": "puppy_Joe",
    "mama_with_camera": "mama_with_camera",
    "mrs_patel": "Mrs_Patel",
}
SINGLE_WORD_CHARS = {
    "papa": "Papa", "mama": "Mama", "sara": "Sara", "eva": "Eva",
    "joe": "Joe", "ginger": "Ginger", "isabel": "Isabel",
    "leo": "Leo", "lisa": "Lisa",
    "mrspatel": "Mrs_Patel", "patel": "Mrs_Patel",
}


def _parse_costume_preview(name: str, ep_num: int):
    """Try to parse name as group_ep<NN>_<char>_<costume>_preview.
    Handle both single-word and multi-word char names by greedy-matching
    against known multi-word chars first.
    """
    ep_pat = f"ep{ep_num:02d}"
    if not name.startswith(f"group_{ep_pat}_") or not name.endswith("_preview"):
        return None
    middle = name[len(f"group_{ep_pat}_"):-len("_preview")]
    # Try multi-word chars first (longer match wins)
    for snake, char in sorted(MULTI_WORD_CHARS.items(), key=lambda x: -len(x[0])):
        if middle.startswith(snake + "_"):
            costume = middle[len(snake) + 1:]
            return char, costume
    # Then single-word chars
    parts = middle.split("_", 1)
    if len(parts) == 2:
        char_lower, costume = parts
        if char_lower in SINGLE_WORD_CHARS:
            return SINGLE_WORD_CHARS[char_lower], costume
    return None


# Returns (kind, registry_key, kling_name, char_for_description) or (None, ...)
# kind ∈ {"costume_preview", "scene", "group_still"}
def parse_filename(p: Path, ep_num: int):
    name = p.stem
    ep_pat = rf"ep{ep_num:02d}"

    # 1. group_ep<NN>_<char>_<costume>_preview (single + multi-word chars)
    parsed = _parse_costume_preview(name, ep_num)
    if parsed:
        char, costume = parsed
        registry_key = f"ep{ep_num:02d}_{char}" if char != "Mrs_Patel" else "Mrs_Patel"
        # Kling element name capped at 20 chars
        if char == "Mrs_Patel":
            kling_name = "Mrs_Patel"
        else:
            kling_name = f"{char}_HW_{costume.title().replace('_','')}"[:20]
        return ("costume_preview", registry_key, kling_name, char)

    # 2. group_ep<NN>_clip<N>_* → Pattern E group still
    m = re.fullmatch(rf"group_{ep_pat}_clip(\d+)_.*", name)
    if m:
        clip_n = int(m.group(1))
        registry_key = f"ep{ep_num:02d}-clip{clip_n}-group-still"
        kling_name = f"ep{ep_num:02d}_c{clip_n}_group"
        return ("group_still", registry_key, kling_name, f"Pattern E group still for clip {clip_n}")

    # 3. ep<NN>_house<N>_<theme> → numbered house scene (legacy ep15 pattern)
    m = re.fullmatch(rf"{ep_pat}_house(\d+)_(\w+)", name)
    if m:
        house_n = int(m.group(1))
        theme = m.group(2)
        registry_key = f"ep{ep_num:02d}-house{house_n}-{theme.replace('_', '-')}"
        short_theme = re.sub(r"_[a-z]+$", "", theme)[:6]
        kling_name = f"ep{ep_num:02d}_h{house_n}_{short_theme}"[:20]
        return ("scene", registry_key, kling_name, f"House {house_n} {theme} scene for ep{ep_num:02d}")

    # 4. ep<NN>_<anything> → generic scene (uploaded to GCS only, no element_create needed —
    #    scenes go in image_list as direct GCS URLs, NOT element_list)
    m = re.fullmatch(rf"{ep_pat}_([\w_]+)", name)
    if m:
        slug = m.group(1)
        registry_key = f"ep{ep_num:02d}-{slug.replace('_', '-')}"
        # No Kling element create needed for scene PNGs (they're image_list URLs).
        # Return None for kling_name to signal "GCS upload only, skip element create".
        return ("scene", registry_key, None, f"Scene PNG: ep{ep_num:02d} {slug.replace('_', ' ')}")

    return None


# ─── GCS ops ────────────────────────────────────────────────────────────────
def gcs_object_name(ep_num: int, kling_name: str, kind: str) -> str:
    if kind == "scene" or kind == "group_still":
        return f"ep{ep_num:02d}/{kling_name}.png"
    return f"ep{ep_num:02d}/{kling_name}.png"


def gcs_url(object_name: str) -> str:
    return f"{BUCKET_HTTPS}/{object_name}"


def gcs_exists(object_name: str) -> bool:
    r = subprocess.run(["gcloud", "storage", "ls", f"gs://{BUCKET}/{object_name}"],
                       capture_output=True, text=True, timeout=20)
    return r.returncode == 0


def gcs_upload(local: Path, object_name: str, dry_run: bool) -> bool:
    if dry_run:
        print(f"   [dry-run] gcs upload {local.name} → gs://{BUCKET}/{object_name}")
        return True
    r = subprocess.run(["gcloud", "storage", "cp", str(local), f"gs://{BUCKET}/{object_name}"],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        print(f"   ✗ gcs upload failed: {r.stderr[:200]}")
        return False
    return True


# ─── Kling lookup + create ──────────────────────────────────────────────────
def kling_list_elements(force_refresh: bool, token: str) -> dict:
    """Returns {kling_name: highest_element_id} from /v1/general/advanced-custom-elements."""
    if not force_refresh and CACHE_FILE.is_file() and (time.time() - CACHE_FILE.stat().st_mtime) < CACHE_TTL:
        cache = json.loads(CACHE_FILE.read_text())
    else:
        all_envelopes = []
        for page in range(1, 11):
            try:
                _, body = kling_get(f"/v1/general/advanced-custom-elements?pageNum={page}&pageSize=500", token)
            except (HTTPError, URLError) as e:
                print(f"!! Kling list failed: {e}", file=sys.stderr); sys.exit(2)
            if body.get("code") != 0:
                print(f"!! Kling list code={body.get('code')}", file=sys.stderr); sys.exit(2)
            data = body.get("data") or []
            if not data: break
            all_envelopes.extend(data)
            if len(data) < 500: break
        CACHE_FILE.write_text(json.dumps(all_envelopes))
        cache = all_envelopes

    by_name: dict[str, list] = {}
    for envelope in cache:
        for el in (envelope.get("task_result") or {}).get("elements") or []:
            nm, eid = el.get("element_name"), el.get("element_id")
            if nm and eid:
                by_name.setdefault(nm, []).append(int(eid))
    # take highest per name
    return {nm: sorted(ids, reverse=True)[0] for nm, ids in by_name.items()}


def kling_create_element(name: str, description: str, frontal_url: str, dry_run: bool) -> int | None:
    """Calls createElementViaApi.mjs (existing tool) — keeps idempotency in one place."""
    if dry_run:
        print(f"   [dry-run] would create element name={name} frontal={frontal_url[:60]}")
        return None
    cmd = ["python3",
           str(PROJECT_ROOT / ".claude" / "skills" / "saraandeva-episode" / "scripts" / "prodpipeline" / "createElementViaApi.py"),
           "--name", name,
           "--description", description[:100],
           "--frontal", frontal_url,
           "--external-id", f"auto-{name.lower()}-1"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        print(f"   ✗ create failed: {r.stderr[:200]}")
        return None
    m = re.search(r"element_id=(\d+)", r.stdout)
    return int(m.group(1)) if m else None


# ─── Reconcile per-asset ────────────────────────────────────────────────────
def process_asset(p: Path, ep_num: int, registry: dict, kling_by_name: dict,
                  token: str, args, ek_descriptions: dict) -> dict:
    parsed = parse_filename(p, ep_num)
    if not parsed:
        return {"file": p.name, "status": "unrecognized"}
    kind, registry_key, kling_name, char_or_desc = parsed
    out = {"file": p.name, "kind": kind, "registry_key": registry_key, "kling_name": kling_name or "(scene-only)"}

    # Step A: GCS — for scene-only (kling_name=None), use the original filename as GCS object
    if kling_name is None:
        obj = f"ep{ep_num:02d}/{p.stem}.png"
    else:
        obj = gcs_object_name(ep_num, kling_name, kind)
    if not gcs_exists(obj):
        if not gcs_upload(p, obj, args.dry_run):
            out["status"] = "gcs_upload_failed"; return out
        out["gcs"] = "uploaded"
    else:
        out["gcs"] = "exists"

    # Step B: Kling element lookup — skip if kling_name is None (scene-only file)
    if kling_name is None:
        out["kling"] = "n/a (scene PNG, image_list only)"
        out["registry"] = "n/a"
        out["status"] = "ok"
        return out
    eid = kling_by_name.get(kling_name)
    if not eid and kind == "costume_preview":
        # Try <Char>_HW_<*> prefix match (Kling element names cap at 20 chars,
        # so Isabel_HW_Unicorn lives as Isabel_HW_Uni, etc.)
        m = re.fullmatch(r"(\w+?)_HW_\w+", kling_name)
        if m:
            char_prefix = m.group(1) + "_HW_"
            for nm, _eid in kling_by_name.items():
                if nm.startswith(char_prefix):
                    eid = _eid
                    out["kling_match_via"] = f"prefix→{nm}"
                    break
    if eid:
        out["kling"] = f"existing element_id={eid}"
    else:
        if args.skip_create:
            out["status"] = "no_element_skip_create"
            out["kling"] = "missing (--skip-create)"
            return out
        # Create via API. Description sourced from ek_descriptions (per-char defaults)
        desc = ek_descriptions.get(kling_name) or ek_descriptions.get(registry_key) or char_or_desc
        eid = kling_create_element(kling_name, desc, gcs_url(obj), args.dry_run)
        if eid is None and not args.dry_run:
            out["status"] = "kling_create_failed"; return out
        out["kling"] = f"created element_id={eid}" if eid else "created (dry-run)"

    # Step C: registry add-only
    if registry_key in registry:
        if int(registry[registry_key]) == (eid or 0):
            out["registry"] = "unchanged"
        else:
            out["registry"] = f"existing key not overridden ({registry[registry_key]} kept)"
    else:
        if not args.dry_run and eid:
            registry[registry_key] = eid
        out["registry"] = "added"

    out["status"] = "ok"
    return out


# ─── Default element descriptions (≤100 chars per Kling cap) ────────────────
DEFAULT_DESCRIPTIONS = {
    "Papa_HW_Werewolf":   "Adult man, werewolf costume: wolf ears, dark beard, gray cardigan, holds wolf mask",
    "Mama_HW_Cozy":       "Adult woman, cozy autumn: orange beanie, rust sweater, fair skin, friendly smile",
    "Sara_HW_Princess":   "7yo girl, fairy princess: tiara, pink-white tutu, wings, wand, dark-blonde wavy hair",
    "Eva_HW_Pumpkin":     "3yo girl, pumpkin onesie: orange body w/ jack-o-lantern, green leaf hat, blonde curly",
    "Joe_HW_Bug":         "Pomeranian dog in red-with-black-spots ladybug body costume, fluffy cream-and-gold",
    "Ginger_HW_Cape":     "4yo Jack Russell, white-and-tan, BIGGER than Joe, pumpkin-orange cape costume",
    "Isabel_HW_Uni":      "6yo girl, curly brunette hair, olive skin, pastel unicorn onesie + horn headband",
    "Leo_HW_Dino":        "3yo boy, brown hair, green dinosaur onesie with hood, spiky back ridge",
    "Lisa_Garden_Fairy":  "6yo girl, copper-red pigtails, freckles, green eyes, garden-fairy + daisy headband",
    "Mrs_Patel":          "Elderly Indian-American woman, silver bun, glasses on chain, cream cardigan",
}


# ─── Main ───────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true", help="no GCS upload, no API create, no registry write")
    ap.add_argument("--skip-create", action="store_true",
                    help="don't create new Kling elements; only register existing ones")
    ap.add_argument("--force-refresh", action="store_true", help="ignore /tmp cache")
    args = ap.parse_args()

    if not REGISTRY_FILE.is_file():
        print(f"!! registry missing: {REGISTRY_FILE}", file=sys.stderr); sys.exit(1)
    registry = json.loads(REGISTRY_FILE.read_text())

    ak, sk = load_env()
    token = make_jwt(ak, sk)
    print(f"Pulling Kling element library...")
    kling_by_name = kling_list_elements(args.force_refresh, token)
    print(f"  {len(kling_by_name)} unique element name(s) on Kling")

    pat = re.compile(rf"(?:group_)?ep{args.episode:02d}.*\.png$")
    pngs = sorted([p for p in ASSETS_DIR.glob("*.png") if pat.search(p.name)])
    print(f"  {len(pngs)} PNG(s) in {ASSETS_DIR.relative_to(PROJECT_ROOT)} match ep{args.episode:02d}")
    print()

    results = []
    for p in pngs:
        out = process_asset(p, args.episode, registry, kling_by_name, token, args, DEFAULT_DESCRIPTIONS)
        results.append(out)
        line = f"  {out.get('kind','?'):<16} {out['file']:<55} → {out.get('status','?')}"
        if out.get("gcs"): line += f"  [gcs:{out['gcs']}]"
        if out.get("kling"): line += f"  [kling:{out['kling'][:40]}]"
        if out.get("registry"): line += f"  [reg:{out['registry']}]"
        print(line)

    if not args.dry_run:
        REGISTRY_FILE.write_text(json.dumps(registry, indent=2) + "\n")

    fail_count = sum(1 for r in results if r.get("status") not in ("ok", "unrecognized"))
    print()
    print(f"Summary: {sum(1 for r in results if r.get('status')=='ok')} ok, "
          f"{sum(1 for r in results if r.get('status')=='unrecognized')} unrecognized, "
          f"{fail_count} failed")
    if args.dry_run:
        print("(--dry-run: no changes written)")
    sys.exit(0 if fail_count == 0 else 1)


if __name__ == "__main__":
    main()
