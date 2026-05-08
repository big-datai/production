#!/usr/bin/env python3
"""
Gemini 2.5 Flash visual audit for an episode's rendered clips.

For each <clips_dir>/*.mp4 (numeric/decimal filenames only), uploads the
file to Gemini Files API, asks gemini-2.5-flash to describe + list visible
defects, then writes a per-clip JSON report.

Faithful Python port of auditClipsWithGemini.mjs. Uses urllib + threading
for concurrency (no aiohttp dep). Multi-key round-robin for rate-limit relief.

Usage:
  python3 auditClipsWithGemini.py <clips_dir> [--out <path>] [--concurrency N]

Exits 0 if no critical defects, 1 if any critical defects.
"""
import argparse
import datetime
import json
import os
import re
import sys
import time
from pathlib import Path
from threading import Thread, Lock
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
ENV_CANDIDATES = [
    Path("/Volumes/Samsung500/goreadling-production/.env.local"),
    PROJECT_ROOT.parent / ".env.local",
]
GEMINI_BASE = "https://generativelanguage.googleapis.com"

AUDIT_PROMPT = '''You are a video QA auditor for the "Sara and Eva" Pixar-style children's animated series.

Watch this video clip and produce a structured report. Be CONCISE and SPECIFIC.

Format your reply EXACTLY like this (no preamble):

DESCRIPTION: <2 sentences describing what happens in the clip>

VISIBLE_ANIMALS: <comma-list of any visible animals with species, or "NONE">

VISIBLE_HUMANS_COUNT: <number>
VISIBLE_HUMANS: <comma-list. Per character try to identify if recognizable: Mama (adult woman, often hat), Papa (adult man, beard), Sara (older girl, ponytail with bow), Eva (younger girl, curly blonde with rainbow bow), Joe (Costco employee, red apron), or "unknown_child"/"unknown_adult". Note distinct visual features.>

ACTIONS:
- <character>: <what they DO in the clip — verbs only, body parts moving, e.g. "Papa: walks forward, raises arm">

DEFECTS: (list any of these, or "NONE")
- ghost_or_duplicate_character: <which char appears duplicated or as a ghost figure>
- anatomy_error: <e.g. 3 arms, missing limbs, floating hand>
- character_passive: <character named in scene but not visibly moving for most of the clip>
- wrong_or_extra_character: <e.g. an animal that shouldn't be there, an unnamed person>
- prop_missing: <expected prop not visible>
- scene_mismatch: <wrong setting>
- horror_tone: <scary atmosphere unsuitable for kid show>
- visual_clone: <e.g. two sisters look identical and indistinguishable>
- other: <free description>

OVERALL: <one of: CLEAN | MINOR_ISSUES | CRITICAL_DEFECT>'''


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


def http_post(url: str, headers: dict, body: bytes):
    req = Request(url, data=body, headers=headers, method="POST")
    with urlopen(req, timeout=120) as r:
        return r.status, r.headers, r.read()


def http_get(url: str):
    req = Request(url)
    with urlopen(req, timeout=60) as r:
        return r.status, r.read()


def upload_file(path: Path, api_key: str) -> dict:
    buf = path.read_bytes()
    fname = path.name
    # Step 1: start resumable upload
    start_url = f"{GEMINI_BASE}/upload/v1beta/files?key={api_key}"
    start_headers = {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": str(len(buf)),
        "X-Goog-Upload-Header-Content-Type": "video/mp4",
        "Content-Type": "application/json",
    }
    start_body = json.dumps({"file": {"display_name": fname}}).encode()
    status, hdrs, _ = http_post(start_url, start_headers, start_body)
    upload_url = hdrs.get("x-goog-upload-url") or hdrs.get("X-Goog-Upload-URL")
    if not upload_url: raise RuntimeError("upload start: no x-goog-upload-url")

    # Step 2: upload + finalize
    fin_headers = {
        "Content-Length": str(len(buf)),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
    }
    _, _, fin_body = http_post(upload_url, fin_headers, buf)
    meta = json.loads(fin_body.decode())
    file = meta["file"]

    # Step 3: poll until ACTIVE
    for _ in range(30):
        if file.get("state") == "ACTIVE": break
        time.sleep(2)
        try:
            _, body = http_get(f"{GEMINI_BASE}/v1beta/{file['name']}?key={api_key}")
            file.update(json.loads(body.decode()))
        except Exception:
            pass
    if file.get("state") != "ACTIVE":
        raise RuntimeError(f"file did not become ACTIVE: {file.get('state')}")
    return file


def delete_file(file_name: str, api_key: str):
    try:
        req = Request(f"{GEMINI_BASE}/v1beta/{file_name}?key={api_key}", method="DELETE")
        urlopen(req, timeout=10)
    except Exception:
        pass


def audit_one(clip: Path, api_key: str) -> str:
    file = upload_file(clip, api_key)
    body = json.dumps({
        "contents": [{"parts": [
            {"fileData": {"mimeType": "video/mp4", "fileUri": file["uri"]}},
            {"text": AUDIT_PROMPT},
        ]}],
        "generationConfig": {"temperature": 0.1},
    }).encode()
    try:
        url = f"{GEMINI_BASE}/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        _, _, res = http_post(url, {"Content-Type": "application/json"}, body)
        j = json.loads(res.decode())
        return j.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    finally:
        delete_file(file["name"], api_key)


def parse_report(text: str) -> dict:
    out = {"description": "", "animals": "NONE", "humansCount": None,
           "humans": "", "actions": [], "defects": [], "overall": "UNKNOWN", "raw": text}
    def grep(pat: str) -> str:
        m = re.search(pat, text)
        return m.group(1).strip() if m else ""
    out["description"] = grep(r"DESCRIPTION:\s*(.+)")
    out["animals"] = grep(r"VISIBLE_ANIMALS:\s*(.+)") or "NONE"
    hc = grep(r"VISIBLE_HUMANS_COUNT:\s*(\d+)")
    out["humansCount"] = int(hc) if hc else None
    out["humans"] = grep(r"VISIBLE_HUMANS:\s*(.+)")
    am = re.search(r"ACTIONS:\s*([\s\S]*?)(?:DEFECTS:|OVERALL:|$)", text)
    actions = (am.group(1) if am else "").splitlines()
    out["actions"] = [l.strip() for l in actions if l.strip().startswith("- ")]
    dm = re.search(r"DEFECTS:[^\n]*\n([\s\S]*?)(?:OVERALL:|$)", text)
    defects = (dm.group(1) if dm else "").splitlines()
    out["defects"] = [l.strip() for l in defects
                      if l.strip().startswith("- ") and not l.strip().lower().endswith(": none")]
    out["overall"] = grep(r"OVERALL:\s*(\w+)") or "UNKNOWN"
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clips_dir")
    ap.add_argument("--out", default=None)
    ap.add_argument("--concurrency", type=int, default=3)
    args = ap.parse_args()

    load_env()
    keys = get_keys()
    if not keys:
        print("No GEMINI_API_KEY* in env", file=sys.stderr); sys.exit(1)

    clips_dir = Path(args.clips_dir).resolve()
    if not clips_dir.is_dir():
        print("Usage: auditClipsWithGemini.py <clips_dir>", file=sys.stderr); sys.exit(1)
    out_path = Path(args.out) if args.out else Path(f"/tmp/audit_{clips_dir.name}.json")

    pat = re.compile(r"^\d+(\.\d+)?\.mp4$")
    clip_files = sorted([p for p in clips_dir.iterdir() if pat.fullmatch(p.name)],
                        key=lambda p: float(p.stem))
    print(f"Auditing {len(clip_files)} clips from {clips_dir}")
    print(f"Output: {out_path}\n")

    results: dict[str, dict] = {}
    lock = Lock()
    counter = [0]

    def worker(items: list[Path]):
        for clip in items:
            with lock:
                idx = counter[0]
                counter[0] += 1
            api_key = keys[idx % len(keys)]
            t0 = time.time()
            try:
                text = audit_one(clip, api_key)
                parsed = parse_report(text)
                parsed["file"] = clip.name
                parsed["durationMs"] = int((time.time() - t0) * 1000)
                with lock:
                    results[clip.name] = parsed
                flag = "✅" if parsed["overall"] == "CLEAN" else \
                       "🔴" if parsed["overall"] == "CRITICAL_DEFECT" else \
                       "🟡" if parsed["overall"] == "MINOR_ISSUES" else "❓"
                animals = f"  animals=[{parsed['animals']}]" if parsed["animals"] not in ("", "NONE") else ""
                print(f"{flag} {clip.name:<12} {parsed.get('humansCount') or '?'}p "
                      f"{parsed['overall']:<16} {parsed['description'][:80]}{animals}")
                for d in parsed["defects"]:
                    print(f"     {d}")
            except (HTTPError, URLError, RuntimeError, json.JSONDecodeError, KeyError) as e:
                with lock:
                    results[clip.name] = {"error": str(e), "file": clip.name}
                print(f"❌ {clip.name:<12} error: {str(e)[:80]}")

    # Round-robin distribute across workers
    chunks = [clip_files[i::args.concurrency] for i in range(args.concurrency)]
    threads = [Thread(target=worker, args=(c,)) for c in chunks]
    for t in threads: t.start()
    for t in threads: t.join()

    flagged = {"fox": [], "critical": [], "minor": [], "errors": []}
    for name, r in results.items():
        if "error" in r:
            flagged["errors"].append(name); continue
        if r.get("animals") and re.search(r"fox", r["animals"], re.I):
            flagged["fox"].append(name)
        if r.get("overall") == "CRITICAL_DEFECT":
            flagged["critical"].append(name)
        if r.get("overall") == "MINOR_ISSUES":
            flagged["minor"].append(name)

    report = {
        "clipsDir": str(clips_dir),
        "generatedAt": datetime.datetime.now().isoformat() + "Z",
        "clipCount": len(clip_files),
        "flagged": flagged,
        "results": results,
    }
    out_path.write_text(json.dumps(report, indent=2))

    print("\n=== Summary ===")
    print(f"Total clips: {len(clip_files)}")
    print(f"🔴 critical: {len(flagged['critical'])}  {', '.join(flagged['critical'])}")
    print(f"🟡 minor:    {len(flagged['minor'])}  {', '.join(flagged['minor'])}")
    print(f"🦊 fox-flag: {len(flagged['fox'])}  {', '.join(flagged['fox'])}")
    print(f"❌ errors:   {len(flagged['errors'])}  {', '.join(flagged['errors'])}")
    print(f"\nFull report → {out_path}")

    sys.exit(1 if flagged["critical"] else 0)


if __name__ == "__main__":
    main()
