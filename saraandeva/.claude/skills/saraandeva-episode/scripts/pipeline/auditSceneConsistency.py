#!/usr/bin/env python3
"""
Scene-consistency audit for ep<NN> nano stills.

For each scene tag in episode.json, groups all clips sharing that scene tag,
composites the per-clip nano stills into a labeled grid, and asks Gemini Vision
to flag inconsistencies in the SHARED scene environment (room layout, bed
configuration, furniture, lighting, props that should be stable across the
scene group).

Reasoning: Nano Banana renders each per-clip still independently, even when
prompted with the same scene reference. Drift in props (bed level changes,
furniture moves, color shifts) makes the assembled episode feel disjointed.
This audit catches it BEFORE Kling submission — re-render the inconsistent
stills locally for ~$0.02 each instead of paying for Kling video renders that
inherit the inconsistency.

Usage:
    python3 auditSceneConsistency.py --episode 16
    python3 auditSceneConsistency.py --episode 16 --scene ep16-evas-bedroom-night
    python3 auditSceneConsistency.py --episode 16 --json     # machine-readable

Exit codes:
    0 = all scenes consistent
    1 = inconsistencies found (see report)
    2 = infrastructure error (file/API/env missing)
"""
from __future__ import annotations
import argparse
import base64
import io
import json
import os
import re
import sys
from collections import defaultdict
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
            {"inlineData": {"mimeType": "image/jpeg", "data": image_b64}},
            {"text": prompt},
        ]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 2500},
    }
    url = f"{GEMINI_BASE}/v1beta/models/gemini-2.5-flash:generateContent?key={key}"
    req = Request(url, data=json.dumps(body).encode(),
                  headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=90) as r:
        rj = json.loads(r.read())
    return rj.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")


def find_clip_still(ep_dir: Path, clip_n: int) -> Path | None:
    """Same resolution as kling_pipeline.find_clip_still — clip_<NN>_*.png in stills/."""
    stills = ep_dir / "stills"
    if not stills.is_dir(): return None
    for pat in (f"clip_{clip_n:02d}_*.png", f"clip_{clip_n}_*.png"):
        matches = sorted(p for p in stills.glob(pat) if p.is_file() and "old" not in p.parts)
        if matches: return matches[0]
    return None


def collect_scene_groups(ep_num: int) -> dict[str, list[tuple[int, Path]]]:
    """Returns {scene_tag: [(clip_n, still_path), ...]} for every scene tag in the episode."""
    ep_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{ep_num:02d}"
    groups: dict[str, list[tuple[int, Path]]] = defaultdict(list)
    for fp in sorted(ep_dir.iterdir()):
        if not re.fullmatch(r"\d+\.json", fp.name): continue
        n = int(fp.stem)
        try: d = json.loads(fp.read_text())
        except Exception: continue
        scene = d.get("scene") or "(no_scene)"
        still = find_clip_still(ep_dir, n)
        if still:
            groups[scene].append((n, still))
    return dict(groups)


def make_labeled_grid(items: list[tuple[int, Path]], cols: int = 3,
                      cell_w: int = 480, cell_h: int = 270) -> bytes:
    """Composite [(clip_n, png_path), ...] into a JPEG grid with each cell labeled.
    Returns JPEG bytes (in-memory) for direct Gemini upload."""
    from PIL import Image, ImageDraw, ImageFont
    n = len(items)
    rows = (n + cols - 1) // cols
    grid = Image.new("RGB", (cols * cell_w, rows * cell_h), color=(0, 0, 0))
    # Try a system font; fall back to default bitmap if unavailable
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 32)
    except OSError:
        font = ImageFont.load_default()
    for idx, (clip_n, png) in enumerate(items):
        col, row = idx % cols, idx // cols
        x0, y0 = col * cell_w, row * cell_h
        try:
            img = Image.open(png).convert("RGB")
            img.thumbnail((cell_w, cell_h), Image.LANCZOS)
            ix = x0 + (cell_w - img.width) // 2
            iy = y0 + (cell_h - img.height) // 2
            grid.paste(img, (ix, iy))
        except Exception as e:
            print(f"  ⚠ could not paste clip {clip_n}: {e}", file=sys.stderr)
        # Label badge — yellow with black outline, top-left of cell
        draw = ImageDraw.Draw(grid)
        label = f"clip_{clip_n}"
        bbox = draw.textbbox((0, 0), label, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        pad = 6
        draw.rectangle((x0 + 8, y0 + 8, x0 + 8 + tw + 2 * pad, y0 + 8 + th + 2 * pad),
                       fill=(255, 235, 0))
        draw.text((x0 + 8 + pad, y0 + 8 + pad), label, fill=(0, 0, 0), font=font)
    buf = io.BytesIO()
    grid.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def audit_one_scene(scene: str, items: list[tuple[int, Path]],
                    api_key: str, save_grid: Path | None = None) -> dict:
    """Send the labeled grid + structured prompt to Gemini; parse + return findings."""
    grid_bytes = make_labeled_grid(items)
    if save_grid:
        save_grid.parent.mkdir(parents=True, exist_ok=True)
        save_grid.write_bytes(grid_bytes)
    grid_b64 = base64.b64encode(grid_bytes).decode()

    prompt = (
        f"You are auditing scene consistency across {len(items)} Pixar-style still images. "
        f"All these stills are intended to depict the SAME location/scene tag: '{scene}'. "
        f"They are arranged in a labeled grid (each cell shows the clip number — e.g. clip_7, clip_8).\n\n"
        f"INSPECT and identify any inconsistencies in the SHARED scene environment that would make "
        f"the assembled video look disjointed. Specifically check for drift in:\n"
        f"  • Room/space layout (same room or different rooms?)\n"
        f"  • Bed configuration (same bed? single vs bunk? top bunk vs bottom?)\n"
        f"  • Furniture position/type (same dresser, lamp, rug, etc.?)\n"
        f"  • Wall color / wallpaper / artwork\n"
        f"  • Lighting (warm/cool, time of day) — ALLOWED to differ for narrative time progression\n"
        f"  • Major props that should be stable (toys, blankets, posters)\n\n"
        f"Answer EXACTLY in this format:\n\n"
        f"VERDICT: <CONSISTENT | INCONSISTENT>\n"
        f"SHARED_ELEMENTS_OK: <comma-list of elements consistent across all clips>\n"
        f"DRIFTS: <comma-list of inconsistencies as 'clip_X: description', or NONE>\n"
        f"CLIPS_TO_REGENERATE: <comma-list of clip numbers that should be re-rendered to match the majority/canonical look, or NONE>\n"
        f"CANONICAL_CLIP: <clip_N that best represents the intended scene look — others should match this one>\n"
    )

    text = call_gemini(grid_b64, prompt, api_key)

    def grep(field: str) -> str:
        m = re.search(rf"^{field}:\s*(.*?)(?=^[A-Z_]+:|\Z)", text, re.M | re.S | re.I)
        return m.group(1).strip().rstrip(",") if m else ""

    return {
        "scene": scene,
        "clip_count": len(items),
        "clips": [n for n, _ in items],
        "verdict": grep("VERDICT").upper(),
        "shared_elements_ok": grep("SHARED_ELEMENTS_OK"),
        "drifts": grep("DRIFTS"),
        "clips_to_regenerate": grep("CLIPS_TO_REGENERATE"),
        "canonical_clip": grep("CANONICAL_CLIP"),
        "raw": text,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--scene", help="audit only this scene tag (otherwise: all scenes)")
    ap.add_argument("--json", action="store_true", help="output JSON only")
    ap.add_argument("--save-grids", action="store_true",
                    help="save labeled grid JPEGs to /tmp/scene_audit_ep<NN>/")
    args = ap.parse_args()

    load_env()
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY_2")
    if not key:
        print("!! no GEMINI_API_KEY in .env.local", file=sys.stderr); sys.exit(2)

    groups = collect_scene_groups(args.episode)
    if not groups:
        print(f"!! no scene groups found for ep{args.episode:02d}", file=sys.stderr); sys.exit(2)

    grid_dir = Path(f"/tmp/scene_audit_ep{args.episode:02d}")
    findings = []
    for scene, items in sorted(groups.items()):
        if args.scene and scene != args.scene: continue
        if len(items) < 2:
            findings.append({"scene": scene, "clip_count": len(items),
                             "clips": [n for n, _ in items],
                             "verdict": "SKIP", "note": "only 1 clip — no consistency to audit"})
            continue
        if not args.json:
            print(f"\n{'═' * 70}")
            print(f"  AUDITING scene: {scene}  ({len(items)} clips)")
            print(f"{'═' * 70}")
        save_grid = (grid_dir / f"{scene}_grid.jpg") if args.save_grids else None
        f = audit_one_scene(scene, items, key, save_grid)
        findings.append(f)
        if not args.json:
            print(f"  VERDICT: {f['verdict']}")
            if f['verdict'] == "INCONSISTENT":
                print(f"  Canonical reference: {f.get('canonical_clip', '?')}")
                print(f"  DRIFTS:")
                for line in (f['drifts'] or "").splitlines():
                    if line.strip(): print(f"    • {line.strip()}")
                print(f"  Re-render: {f.get('clips_to_regenerate', '?')}")
            else:
                print(f"  ✓ all {len(items)} clips share consistent {scene}")
                if f['shared_elements_ok']:
                    print(f"  shared: {f['shared_elements_ok'][:200]}")

    if args.json:
        print(json.dumps(findings, indent=2))
    inconsistent = [f for f in findings if f.get("verdict") == "INCONSISTENT"]
    if inconsistent:
        if not args.json:
            print(f"\n{'═' * 70}")
            print(f"  SUMMARY: {len(inconsistent)} scene(s) need re-rendering")
            print(f"{'═' * 70}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
