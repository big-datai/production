#!/usr/bin/env python3
"""
Kling-API pipeline orchestrator (faithful Python port of kling_ep15_pipeline.mjs).

Generalized to any episode via --episode flag (was hard-coded to ep15).

Phases (idempotent — re-run resumes from state):
  upload   — phase A: upload PNGs to gs://saraandeva-kling-elements/ep<NN>/
  elements — phase B: create Kling elements via POST advanced-custom-elements
  submit   — phase C: POST omni-video per clip JSON
  download — phase D: poll + download finished MP4s
  extract  — phase E: ffmpeg last-frame + upload (for continuity locking)
  status   — print state without doing anything
  all      — upload → elements → submit → download → extract sequentially
  clip <N> — submit ONE specific clip (testing)

State: content/episodes/ep<NN>/_pipeline_state.json
       (uploads/elements/clipTasks/clipDownloads/lastFrames keys)

NEW vs .mjs (Fix D): resolveElementId() now WARNS (not silently returns) when
falling back from ep<NN>_<Char> to bare <Char>. Pipeline operator sees the
warning in stdout and can stop the submit before Kling renders with the wrong
(uncostumed) element. ep15 retrospective root cause for Papa-not-werewolf.

Usage:
  python3 kling_pipeline.py --episode 15 upload
  python3 kling_pipeline.py --episode 15 all
  python3 kling_pipeline.py --episode 15 clip 17
"""
import argparse, base64, hashlib, hmac, json, os, re, subprocess, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production")
SARAANDEVA = PROJECT_ROOT / "saraandeva"
ENV_FILE = PROJECT_ROOT / ".env.local"
BUCKET = "saraandeva-kling-elements"
API_BASE = "https://api-singapore.klingai.com"

# ─── env / JWT ─────────────────────────────────────────────────────────────
def load_env():
    for line in ENV_FILE.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))
    ak, sk = os.environ.get("KLING_ACCESS_KEY"), os.environ.get("KLING_SECRET_KEY")
    if not ak or not sk:
        print("missing KLING_ACCESS_KEY / KLING_SECRET_KEY", file=sys.stderr); sys.exit(1)
    return ak, sk


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def make_jwt(ak: str, sk: str) -> str:
    now = int(time.time())
    h = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    p = b64url(json.dumps({"iss": ak, "exp": now + 1800, "nbf": now - 5}, separators=(",", ":")).encode())
    s = b64url(hmac.new(sk.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{s}"


def api(method: str, path: str, ak: str, sk: str, body=None):
    headers = {"Authorization": f"Bearer {make_jwt(ak, sk)}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    req = Request(API_BASE + path, data=data, method=method, headers=headers)
    try:
        with urlopen(req, timeout=30) as r:
            text = r.read().decode()
            try: return r.status, json.loads(text), text
            except json.JSONDecodeError: return r.status, None, text
    except HTTPError as e:
        try: return e.code, json.loads(e.read().decode()), ""
        except Exception: return e.code, {"code": -1}, ""
    except URLError as e:
        return -1, {"code": -1, "_error": str(e)}, ""


# ─── State ─────────────────────────────────────────────────────────────────
def state_path(ep_num: int) -> Path:
    return SARAANDEVA / "content" / "episodes" / f"ep{ep_num:02d}" / "_pipeline_state.json"


def ep_dir(ep_num: int) -> Path:
    return SARAANDEVA / "content" / "episodes" / f"ep{ep_num:02d}"


def clips_out_dir(ep_num: int) -> Path:
    return ep_dir(ep_num) / "clips"


def load_state(ep_num: int) -> dict:
    p = state_path(ep_num)
    if not p.is_file():
        return {"uploads": {}, "elements": {}, "clipTasks": {}, "clipDownloads": {}, "lastFrames": {}}
    return json.loads(p.read_text())


def save_state(ep_num: int, s: dict):
    state_path(ep_num).write_text(json.dumps(s, indent=2))


# ─── Asset manifest ─────────────────────────────────────────────────────────
def build_asset_manifest(ep_num: int) -> tuple[dict, list]:
    ep = json.loads((ep_dir(ep_num) / "episode.json").read_text())
    assets = []

    canon = ["Sara", "Eva", "Papa", "Mama", "Joe", "Ginger", "Isabel", "Leo"]
    for name in canon:
        f = SARAANDEVA / "assets" / "characters" / f"{name.lower()}_front.png"
        if f.is_file():
            assets.append({"name": name, "file": str(f), "type": "character", "elementName": name})

    for e in ep.get("newBoundElements") or []:
        rel = e.get("asset") or ""
        f = SARAANDEVA / rel if rel.startswith("assets/") else PROJECT_ROOT / rel
        if Path(f).is_file():
            assets.append({
                "name": e["tag"], "file": str(f), "type": "boundElement",
                "elementName": re.sub(r"[^a-zA-Z0-9_-]", "_", e["tag"]),
                "description": (e.get("purpose") or "")[:200],
            })

    for s in ("front_house_fall", "front_fence_sidewalk"):
        f = SARAANDEVA / "assets" / "scenes" / f"{s}.png"
        if f.is_file():
            assets.append({"name": s, "file": str(f), "type": "scene", "elementName": s})

    previews = [
        ("Sara_Halloween_Princess",  "scenes/group_ep15_sara_princess_preview.png"),
        ("Eva_Halloween_Pumpkin",    "scenes/group_ep15_eva_pumpkin_preview.png"),
        ("Papa_Halloween_Werewolf",  "scenes/group_ep15_papa_werewolf_preview.png"),
        ("Mama_Halloween_Cozy",      "scenes/group_ep15_mama_cozy_preview.png"),
        ("Joe_Bug_Costume",          "scenes/group_ep15_joe_bug_preview.png"),
        ("Ginger_Pumpkin_Cape",      "scenes/group_ep15_ginger_pumpkin_cape_preview.png"),
        ("Isabel_Unicorn",           "scenes/group_ep15_isabel_unicorn_preview.png"),
        ("Leo_Tiny_Dinosaur",        "scenes/group_ep15_leo_dinosaur_preview.png"),
    ]
    for name, rel in previews:
        f = SARAANDEVA / "assets" / rel
        if f.is_file():
            assets.append({"name": name, "file": str(f), "type": "costume", "elementName": name})

    return ep, assets


# ─── Phase A: upload ────────────────────────────────────────────────────────
def phase_upload(ep_num: int):
    state = load_state(ep_num)
    _, assets = build_asset_manifest(ep_num)
    bucket_prefix = f"ep{ep_num:02d}"
    print(f"Phase A: upload {len(assets)} assets to gs://{BUCKET}/{bucket_prefix}/")
    done = skipped = 0
    for a in assets:
        stable = re.sub(r"[^a-zA-Z0-9_-]", "_", a["elementName"])
        gcs_key = f"{bucket_prefix}/{stable}.png"
        url = f"https://storage.googleapis.com/{BUCKET}/{gcs_key}"
        if state["uploads"].get(a["name"], {}).get("httpsUrl") == url:
            skipped += 1; continue
        rc = subprocess.call(["gsutil", "-q", "cp", a["file"], f"gs://{BUCKET}/{gcs_key}"])
        if rc != 0:
            print(f"  ✗ {a['name']}: gsutil failed", file=sys.stderr); continue
        state["uploads"][a["name"]] = {
            "httpsUrl": url, "gcsKey": gcs_key, "localFile": a["file"],
            "uploadedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "type": a["type"], "description": a.get("description", ""),
        }
        save_state(ep_num, state)
        done += 1
        print(f"  ✓ {a['name']} → {url}")
    print(f"Phase A done: {done} uploaded, {skipped} skipped (cached).")


# ─── Phase B: elements (idempotent — checks existing first via Fix B) ──────
NAME_MAP = {
    "Sara_Halloween_Princess": "Sara_HW_Princess",
    "Eva_Halloween_Pumpkin": "Eva_HW_Pumpkin",
    "Papa_Halloween_Werewolf": "Papa_HW_Werewolf",
    "Mama_Halloween_Cozy": "Mama_HW_Cozy",
    "Joe_Bug_Costume": "Joe_HW_Bug",
    "Ginger_Pumpkin_Cape": "Ginger_HW_Cape",
    "Isabel_Unicorn": "Isabel_HW_Uni",
    "Leo_Tiny_Dinosaur": "Leo_HW_Dino",
    "ep15-house1-witch-cauldron": "ep15_h1_witch",
    "ep15-house2-pirate-ship":    "ep15_h2_pirate",
    "ep15-house3-skeleton-lawn":  "ep15_h3_skel",
    "ep15-house4-isabel-cottage": "ep15_h4_cottage",
    "ep15-house5-candy-house":    "ep15_h5_candy",
    "ep15-clip13-group-still":    "ep15_c13_group",
    "ep15-clip17-group-still":    "ep15_c17_group",
    "front_house_fall":           "front_house_fall",
    "front_fence_sidewalk":       "front_fence_sw",
    "Mrs. Patel":                 "Mrs_Patel",
}


def phase_elements(ep_num: int):
    state = load_state(ep_num)
    if not state.get("uploads"):
        print("No uploads in state — run upload phase first.", file=sys.stderr); return
    ak, sk = load_env()
    uploads = state["uploads"]
    print(f"Phase B: create elements from {len(uploads)} uploaded assets")
    to_create = [{"name": n, **info} for n, info in uploads.items()
                 if not state["elements"].get(n, {}).get("element_id")]
    print(f"  {len(to_create)} elements to create, {len(uploads) - len(to_create)} already exist")

    for a in to_create:
        safe_name = NAME_MAP.get(a["name"], a["name"])[:20]
        ext_id = f"ep{ep_num:02d}-{re.sub(r'[^a-zA-Z0-9_-]', '_', safe_name)}-{int(time.time()*1000)}"
        desc = (a.get("description") or f"{a['name']} bound element for ep{ep_num:02d}")[:99]
        body = {
            "external_task_id": ext_id,
            "element_name": safe_name,
            "element_description": desc,
            "reference_type": "image_refer",
            "element_image_list": {
                "frontal_image": a["httpsUrl"],
                "refer_images": [{"image_url": a["httpsUrl"]}, {"image_url": a["httpsUrl"]}],
            },
        }
        print(f"\n  → POST element create: {a['name']}")
        status, j, _ = api("POST", "/v1/general/advanced-custom-elements", ak, sk, body)
        if (j or {}).get("code") != 0:
            print(f"    ✗ failed: {(j or {}).get('message','')[:200]}", file=sys.stderr); continue
        task_id = j["data"]["task_id"]
        state["elements"][a["name"]] = {
            "task_id": task_id, "external_task_id": ext_id,
            "submitted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "status": "submitted",
        }
        save_state(ep_num, state)
        print(f"    ✓ submitted, task_id={task_id}")

    # poll
    pending = {n: e for n, e in state["elements"].items() if not e.get("element_id")}
    if not pending: print("  all elements already complete."); return
    print("\nPhase B: polling for element-creation completion...")
    for attempt in range(1, 31):
        time.sleep(10)
        _, j, _ = api("GET", "/v1/general/advanced-custom-elements?pageNum=1&pageSize=50", ak, sk)
        if (j or {}).get("code") != 0:
            print("  poll fail", file=sys.stderr); continue
        tasks = j.get("data") or []
        still = 0
        for n, info in state["elements"].items():
            if info.get("element_id"): continue
            t = next((x for x in tasks if x.get("task_id") == info["task_id"]), None)
            if not t: still += 1; continue
            if t.get("task_status") == "succeed":
                els = (t.get("task_result") or {}).get("elements") or []
                if els and els[0].get("element_id"):
                    state["elements"][n].update({
                        "element_id": els[0]["element_id"], "status": "succeed",
                        "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    })
                    save_state(ep_num, state)
                    print(f"  ✓ {n} → element_id={els[0]['element_id']}")
            elif t.get("task_status") == "failed":
                state["elements"][n].update({"status": "failed", "failure_reason": t.get("task_status_msg")})
                save_state(ep_num, state)
                print(f"  ✗ {n} FAILED: {t.get('task_status_msg')}", file=sys.stderr)
            else:
                still += 1
        if still == 0: print("Phase B done — all elements created."); return
        print(f"  waiting ({still} still pending, attempt {attempt})")
    print("Phase B timed out — re-run to continue.")


# ─── Submit (Phase C) helpers ───────────────────────────────────────────────
SCENE_MANIFEST = {
    "front_house_fall":           "front_house_fall.png",
    "front_fence_sidewalk":       "front_fence_sidewalk.png",
    "ep15-house1-witch-cauldron": "ep15-house1-witch-cauldron.png",
    "ep15-house2-pirate-ship":    "ep15-house2-pirate-ship.png",
    "ep15-house3-skeleton-lawn":  "ep15-house3-skeleton-lawn.png",
    "ep15-house4-isabel-cottage": "ep15-house4-isabel-cottage.png",
    "ep15-house5-candy-house":    "ep15-house5-candy-house.png",
    "ep15-clip13-group-still":    "ep15-clip13-group-still.png",
    "ep15-clip17-group-still":    "ep15-clip17-group-still.png",
}


def translate_prompt(prompt: str, char_order: list[str]) -> str:
    out = prompt
    for name in sorted(char_order, key=len, reverse=True):
        idx = char_order.index(name) + 1
        escaped = re.escape(name)
        out = re.sub(rf"@{escaped}(?=[\s.,;:'\"!?\)])", f"<<<element_{idx}>>>", out)
        out = re.sub(rf"@{escaped}'s\b", f"<<<element_{idx}>>>'s", out)
    return out


_REGISTRY = None
def get_registry() -> dict:
    global _REGISTRY
    if _REGISTRY is None:
        p = SARAANDEVA / "content" / "elements_registry.json"
        _REGISTRY = json.loads(p.read_text()) if p.is_file() else {}
    return _REGISTRY


def resolve_element_id(name: str, ep_num: int):
    """Fix D: NOISY fallback. Logs warning when falling back from ep<NN>_<Name> to bare <Name>.
    Original .mjs silently returned null or bare element. ep15 retrospective: this is
    why Papa rendered everyday-look in clips 7+10 — silent fallback to 310056797721310
    (everyday Papa). Now operator sees the warning and can stop the submit."""
    reg = get_registry()
    costumed = reg.get(f"ep{ep_num:02d}_{name}")
    if costumed: return costumed
    bare = reg.get(name)
    if bare:
        print(f"    ⚠ resolveElementId: {name} → bare element {bare} (no ep{ep_num:02d}_{name} "
              f"registered) — character will render WITHOUT episode-specific costume",
              file=sys.stderr)
        return bare
    return None


def count_in_flight(ak: str, sk: str) -> int:
    _, j, _ = api("GET", "/v1/videos/omni-video?pageNum=1&pageSize=20", ak, sk)
    if (j or {}).get("code") != 0: return 0
    return sum(1 for t in (j.get("data") or [])
               if t.get("task_status") in ("submitted", "processing"))


# ─── Phase C: submit ────────────────────────────────────────────────────────
def phase_submit(ep_num: int, specific_clip: int | None = None):
    state = load_state(ep_num)
    print("Phase C: submit clips with INLINE elements")
    bucket_prefix = f"ep{ep_num:02d}"
    bucket_https = f"https://storage.googleapis.com/{BUCKET}/{bucket_prefix}"
    ak, sk = load_env()

    clip_files = sorted(
        [p for p in ep_dir(ep_num).iterdir() if re.fullmatch(r"\d+\.json", p.name)],
        key=lambda p: int(p.stem)
    )
    PARALLEL = 4

    for fp in clip_files:
        n = int(fp.stem)
        if specific_clip is not None and n != specific_clip: continue
        clip_key = f"clip_{n}"

        if state["clipTasks"].get(clip_key, {}).get("task_id") and not specific_clip:
            print(f"  ⏭️  {clip_key} already submitted (task={state['clipTasks'][clip_key]['task_id']})")
            continue
        if state["clipTasks"].get(clip_key, {}).get("status") == "submit_failed":
            del state["clipTasks"][clip_key]
            save_state(ep_num, state)

        while count_in_flight(ak, sk) >= PARALLEL:
            print(f"  ⏳ in-flight≥{PARALLEL}, waiting 30s...")
            time.sleep(30)

        clip = json.loads(fp.read_text())

        element_list, element_order, seen = [], [], set()
        for char_name in clip.get("subjects") or []:
            if char_name in seen: continue
            eid = resolve_element_id(char_name, ep_num)
            if not eid:
                print(f"    ⚠ no element_id for \"{char_name}\" — skipping", file=sys.stderr); continue
            seen.add(char_name); element_order.append(char_name)
            element_list.append({"element_id": eid})

        image_urls = []
        if clip.get("scene") and SCENE_MANIFEST.get(clip["scene"]):
            image_urls.append(f"{bucket_https}/{SCENE_MANIFEST[clip['scene']]}")
        pe = clip.get("patternEStill") or ""
        still_key = ("ep15-clip13-group-still" if "clip13" in pe
                     else "ep15-clip17-group-still" if "clip17" in pe else None)
        if still_key and SCENE_MANIFEST.get(still_key):
            image_urls.append(f"{bucket_https}/{SCENE_MANIFEST[still_key]}")

        if not element_list:
            print(f"  ✗ {clip_key} no resolvable characters subjects={clip.get('subjects')}",
                  file=sys.stderr); continue

        translated = translate_prompt(clip.get("prompt", ""), element_order)
        ext_id = f"ep{ep_num:02d}-clip{n}-{int(time.time()*1000)}"
        prev_key = f"clip_{n-1}"
        start_image = state.get("lastFrames", {}).get(prev_key, {}).get("httpsUrl")
        image_list = []
        if start_image: image_list.append({"image_url": start_image})
        image_list.extend({"image_url": u} for u in image_urls)

        body = {
            "external_task_id": ext_id,
            "model_name": "kling-v3-omni",
            "mode": "pro" if clip.get("quality") == "1080p" else "std",
            "duration": str(clip.get("durationSec", 10)),
            "aspect_ratio": "16:9",
            "prompt": translated,
            "negative_prompt": clip.get("negativePrompt", ""),
            "element_list": element_list,
        }
        if image_list: body["image_list"] = image_list
        if clip.get("nativeAudio"): body["sound"] = "on"

        if start_image: print(f"    🎬 continuity from {prev_key}")
        print(f"\n  → POST clip {n} (element_list={len(element_list)} "
              f"[{','.join(element_order)}], image_list={len(image_list)}, "
              f"dur={body['duration']}s, sound={body.get('sound', 'off')})")
        status, j, _ = api("POST", "/v1/videos/omni-video", ak, sk, body)
        if (j or {}).get("code") != 0:
            print(f"    ✗ failed: status={status} code={(j or {}).get('code')} "
                  f"msg={(j or {}).get('message','')[:200]}", file=sys.stderr)
            state["clipTasks"][clip_key] = {
                "error": (j or {}).get("message"), "status": "submit_failed",
                "attempted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            save_state(ep_num, state)
            continue

        state["clipTasks"][clip_key] = {
            "task_id": j["data"]["task_id"], "external_task_id": ext_id,
            "submitted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "status": "submitted", "element_order": element_order, "image_urls": image_urls,
        }
        save_state(ep_num, state)
        print(f"    ✓ submitted, task_id={j['data']['task_id']}")
        if specific_clip: break


# ─── Phase D: download ──────────────────────────────────────────────────────
def phase_download(ep_num: int):
    state = load_state(ep_num)
    out_dir = clips_out_dir(ep_num)
    out_dir.mkdir(parents=True, exist_ok=True)
    ak, sk = load_env()
    print("Phase D: poll + download")

    for attempt in range(1, 61):
        _, j, _ = api("GET", "/v1/videos/omni-video?pageNum=1&pageSize=50", ak, sk)
        if (j or {}).get("code") != 0:
            print("  poll fail", file=sys.stderr); time.sleep(10); continue
        tasks = j.get("data") or []
        pending = downloaded = 0
        for clip_key, info in state["clipTasks"].items():
            if state["clipDownloads"].get(clip_key, {}).get("localPath"): downloaded += 1; continue
            if not info.get("task_id"): continue
            t = next((x for x in tasks if x.get("task_id") == info["task_id"]), None)
            if not t: pending += 1; continue
            if t.get("task_status") == "succeed":
                url = ((t.get("task_result") or {}).get("videos") or [{}])[0].get("url")
                if not url: print(f"  {clip_key} succeed but no url", file=sys.stderr); continue
                out = out_dir / f"{clip_key}.mp4"
                rc = subprocess.call(["curl", "-sL", url, "-o", str(out)])
                if rc == 0:
                    state["clipDownloads"][clip_key] = {
                        "localPath": str(out),
                        "downloadedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "sourceUrl": url,
                    }
                    save_state(ep_num, state)
                    print(f"  ✓ downloaded {clip_key} → {out}")
                else:
                    print(f"  ✗ download fail {clip_key}", file=sys.stderr)
            elif t.get("task_status") == "failed":
                if info.get("status") != "failed":
                    state["clipTasks"][clip_key]["status"] = "failed"
                    state["clipTasks"][clip_key]["failure_reason"] = t.get("task_status_msg")
                    save_state(ep_num, state)
                    print(f"  ✗ {clip_key} FAILED: {t.get('task_status_msg')}", file=sys.stderr)
            else:
                pending += 1
        if pending == 0:
            print("Phase D done.")
            return
        print(f"  waiting ({pending} still rendering, attempt {attempt})")
        time.sleep(20)
    print("Phase D timed out — re-run to continue.")


# ─── Phase E: extract last frames (continuity) ──────────────────────────────
def phase_extract(ep_num: int):
    state = load_state(ep_num)
    state.setdefault("lastFrames", {})
    out_dir = clips_out_dir(ep_num)
    bucket_prefix = f"ep{ep_num:02d}"
    clips = sorted([p for p in out_dir.iterdir() if re.fullmatch(r"clip_\d+\.mp4", p.name)])
    print(f"Phase E (last-frame extract): processing {len(clips)} clips")
    for f in clips:
        n = int(re.search(r"clip_(\d+)", f.name).group(1))
        clip_key = f"clip_{n}"
        if state["lastFrames"].get(clip_key, {}).get("httpsUrl"):
            print(f"  ⏭️  {clip_key} already extracted"); continue
        last_png = out_dir / f"{clip_key}_last.png"
        rc = subprocess.call(["ffmpeg", "-hide_banner", "-loglevel", "error",
                              "-sseof", "-0.1", "-i", str(f), "-update", "1",
                              "-vframes", "1", "-y", str(last_png)])
        if rc != 0: print(f"  ✗ ffmpeg fail {clip_key}", file=sys.stderr); continue
        gcs_key = f"{bucket_prefix}/lastframes/{clip_key}_last.png"
        url = f"https://storage.googleapis.com/{BUCKET}/{gcs_key}"
        rc = subprocess.call(["gsutil", "-q", "cp", str(last_png), f"gs://{BUCKET}/{gcs_key}"])
        if rc != 0: print(f"  ✗ gsutil fail {clip_key}", file=sys.stderr); continue
        state["lastFrames"][clip_key] = {
            "localPath": str(last_png), "gcsKey": gcs_key, "httpsUrl": url,
            "extractedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        save_state(ep_num, state)
        print(f"  ✓ {clip_key} → {url}")


# ─── Status ─────────────────────────────────────────────────────────────────
def phase_status(ep_num: int):
    state = load_state(ep_num)
    u = len(state.get("uploads", {}))
    e_done = sum(1 for x in state.get("elements", {}).values() if x.get("element_id"))
    e_pend = sum(1 for x in state.get("elements", {}).values() if not x.get("element_id"))
    c = sum(1 for x in state.get("clipTasks", {}).values() if x.get("task_id"))
    cd = len(state.get("clipDownloads", {}))
    print("Pipeline state:")
    print(f"  Uploads:  {u} done")
    print(f"  Elements: {e_done} ready, {e_pend} pending")
    print(f"  Clips:    {c} submitted, {cd} downloaded")
    for n, info in state.get("elements", {}).items():
        if info.get("status") == "failed":
            print(f"  ⚠ element {n} FAILED: {info.get('failure_reason')}")
    for k, info in state.get("clipTasks", {}).items():
        if info.get("status") in ("failed", "submit_failed"):
            print(f"  ⚠ {k} {info['status']}: {info.get('failure_reason') or info.get('error')}")


# ─── Main ───────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("phase", choices=["upload", "elements", "submit", "download",
                                      "extract", "status", "all", "clip"])
    ap.add_argument("clip_n", nargs="?", type=int, default=None)
    args = ap.parse_args()

    ep_num = args.episode
    if not ep_dir(ep_num).is_dir():
        print(f"!! episode dir not found: {ep_dir(ep_num)}", file=sys.stderr); sys.exit(1)

    if args.phase == "upload":     phase_upload(ep_num)
    elif args.phase == "elements": phase_elements(ep_num)
    elif args.phase == "submit":   phase_submit(ep_num)
    elif args.phase == "download": phase_download(ep_num)
    elif args.phase == "extract":  phase_extract(ep_num)
    elif args.phase == "status":   phase_status(ep_num)
    elif args.phase == "clip":
        if args.clip_n is None:
            print("clip phase requires clip number arg", file=sys.stderr); sys.exit(1)
        phase_submit(ep_num, args.clip_n)
    elif args.phase == "all":
        phase_upload(ep_num); phase_elements(ep_num)
        phase_submit(ep_num); phase_download(ep_num); phase_extract(ep_num)


if __name__ == "__main__":
    main()
