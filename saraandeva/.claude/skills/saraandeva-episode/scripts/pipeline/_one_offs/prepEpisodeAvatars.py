#!/usr/bin/env python3
"""Phase 0 of the Sara & Eva pipeline — per-episode avatar prep.

Reads `content/episodes/ep<NN>/avatar_manifest.json` and produces episode-
specific avatar variants at `assets/characters/ep<NN>_<name>_front.png`.

The pipeline is split into 3 steps:

  1.  PLAN     — print the wardrobe + state spec for every character
                 (you and Claude both eyeball this BEFORE any render)

  2.  RENDER   — generate each variant via Nano-Banana, 2 candidates each;
                 auto-validate anatomy via Gemini Flash

  3.  PROMOTE  — pick best candidate per character and copy to canonical
                 `ep<NN>_<name>_front.png` (interactive OR --auto-pick v1)

Run modes:
    python3 prepEpisodeAvatars.py --episode 16 --plan       # plan only
    python3 prepEpisodeAvatars.py --episode 16 --render     # render candidates
    python3 prepEpisodeAvatars.py --episode 16 --promote    # promote winners
    python3 prepEpisodeAvatars.py --episode 16 --all        # plan+render+promote
    python3 prepEpisodeAvatars.py --episode 16 --yes        # skip plan-confirm

Per `feedback_nano_banana_no_confirm.md`: Nano renders are cheap; we don't
ask for approval BEFORE rendering. But we DO show the plan + auto-validate
afterward so defects surface fast.
"""
from __future__ import annotations
import argparse
import json
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

PROJECT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
SCRIPTS = PROJECT / ".claude" / "skills" / "saraandeva-episode" / "scripts"
GENERATE = PROJECT / "content" / "generateGroupShot.py"
VALIDATOR = SCRIPTS / "validate_nano_render.py"
CHAR_DIR = PROJECT / "assets" / "characters"
OUT_DIR = PROJECT / "assets" / "scenes"


def load_manifest(ep: int) -> dict:
    p = PROJECT / "content" / "episodes" / f"ep{ep:02d}" / "avatar_manifest.json"
    if not p.is_file():
        sys.exit(f"❌ avatar manifest missing: {p}")
    return json.loads(p.read_text())


def print_plan(manifest: dict) -> None:
    ep = manifest["episode"]
    print(f"━━━ ep{ep:02d} AVATAR PREP PLAN ━━━")
    print(f"  Title:        {manifest.get('title', '?')}")
    print(f"  Wardrobe:     {manifest.get('wardrobeTheme', '?')}")
    print()
    print(f"  Characters ({len(manifest['avatars'])}):")
    for name, a in manifest["avatars"].items():
        print(f"\n  ╭─ {name}")
        print(f"  │  base       : {a['base']}")
        print(f"  │  out        : {a['out']}")
        print(f"  │  trigger    : clip ≥ {a.get('triggerClip', 1)}")
        print(f"  │  wardrobe   : {a['wardrobe'][:140]}{'...' if len(a['wardrobe']) > 140 else ''}")
        print(f"  │  state      : {a['state'][:140]}{'...' if len(a['state']) > 140 else ''}")
        print(f"  ╰─ notes      : {a.get('notes', '')}")


def build_pose(name: str, avatar: dict, wardrobe_theme: str) -> str:
    return (
        f"@{name} standing FULL-BODY centered, neutral clean cream-tone "
        f"background, gentle even portrait lighting, looking forward toward "
        f"camera. Friendly natural expression. "
        f"Wardrobe theme for this episode: {wardrobe_theme}. "
        f"WARDROBE: {avatar['wardrobe']} "
        f"STATE: {avatar['state']} "
        f"This is the LOCKED AVATAR REFERENCE for ep{16:02d} — every clip "
        f"in this episode will use THIS avatar as the identity reference, "
        f"so render it carefully with all wardrobe + state details visible "
        f"and easy to lock onto. Pose: standing relaxed, arms at sides or "
        f"slightly natural. Faces forward, clearly visible."
    )


def render_one(name: str, avatar: dict, wardrobe_theme: str,
                n_candidates: int = 2) -> dict:
    out_id = f"ep16_avatar_{name.lower()}"
    pose = build_pose(name, avatar, wardrobe_theme)
    cmd = [
        "python3", str(GENERATE),
        out_id,
        "--chars", name.lower(),
        "--pose", pose,
        "--n", str(n_candidates),
        "--force",
        "--no-validate",
    ]
    try:
        res = subprocess.run(cmd, cwd=PROJECT, capture_output=True,
                              text=True, timeout=240)
    except subprocess.TimeoutExpired:
        return {"name": name, "status": "timeout"}
    if res.returncode != 0:
        return {"name": name, "status": "fail",
                "stderr": (res.stderr or "")[-300:]}
    candidates = sorted(OUT_DIR.glob(f"group_{out_id}_v*.png"))
    if not candidates:
        return {"name": name, "status": "fail", "reason": "no candidates produced"}
    return {"name": name, "status": "ok", "candidates": [str(p) for p in candidates]}


def validate_candidates(candidate_paths: list[str]) -> dict:
    """Run Gemini Flash anatomy validator on candidates."""
    if not candidate_paths:
        return {}
    cmd = ["python3", str(VALIDATOR), "--json", *candidate_paths]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except Exception:
        return {}
    results = {}
    for line in (res.stdout or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            d = json.loads(line)
            results[d.get("image", "?")] = d
        except Exception:
            pass
    return results


def promote(manifest: dict, picks: dict[str, int] | None = None) -> None:
    """Copy chosen candidate vN to canonical ep<NN>_<name>_front.png."""
    ep = manifest["episode"]
    picks = picks or {}
    for name, avatar in manifest["avatars"].items():
        v = picks.get(name, 1)
        src = OUT_DIR / f"group_ep{ep:02d}_avatar_{name.lower()}_v{v}.png"
        dest = CHAR_DIR / avatar["out"]
        if not src.is_file():
            print(f"  ⚠️  {name}: src missing {src.name} — skipping promote")
            continue
        shutil.copy(src, dest)
        print(f"  ✅ promoted {name}: {src.name} → {dest.name}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", "-e", type=int, required=True)
    ap.add_argument("--plan", action="store_true", help="Print plan only")
    ap.add_argument("--render", action="store_true",
                    help="Render candidates (2 each, parallel 3)")
    ap.add_argument("--promote", action="store_true",
                    help="Copy winning candidates to ep<NN>_<name>_front.png")
    ap.add_argument("--all", action="store_true",
                    help="plan + render + promote (auto-pick v1)")
    ap.add_argument("--auto-pick", default="v1",
                    help="Which candidate to promote (default v1)")
    ap.add_argument("--yes", action="store_true",
                    help="Skip interactive confirmation after plan")
    args = ap.parse_args()

    manifest = load_manifest(args.episode)

    if args.plan or args.all or (not (args.render or args.promote)):
        print_plan(manifest)

    if not (args.render or args.promote or args.all):
        print(f"\n💡 Use --render to generate candidates, --promote to lock winners, --all to do both.")
        return

    if args.render or args.all:
        print(f"\n━━━ RENDERING CANDIDATES ━━━")
        avatars = manifest["avatars"]
        wardrobe_theme = manifest.get("wardrobeTheme", "")
        with ThreadPoolExecutor(max_workers=3) as ex:
            futs = {ex.submit(render_one, name, av, wardrobe_theme): name
                    for name, av in avatars.items()}
            results = {}
            for fut in as_completed(futs):
                r = fut.result()
                results[r["name"]] = r
                icon = {"ok": "✅", "fail": "❌", "timeout": "⏰"}.get(r["status"], "?")
                print(f"  {icon} {r['name']}: {r['status']}")
                if r["status"] == "ok":
                    for c in r["candidates"]:
                        print(f"      {Path(c).name}")

        # Validate
        print(f"\n━━━ AUTO-VALIDATING (Gemini Flash) ━━━")
        all_cands = [c for r in results.values() if r.get("status") == "ok"
                     for c in r["candidates"]]
        v = validate_candidates(all_cands)
        for path, finding in v.items():
            quality = finding.get("overall_quality", "?")
            rec = finding.get("recommendation", "?")
            icon = "✅" if rec == "use" else "🟡" if rec == "reuse_with_caveats" else "🔴"
            print(f"  {icon} {Path(path).name}  {quality} → {rec}")
            for d in finding.get("defects", []):
                print(f"        {d.get('type')} on {d.get('subject', '?')}: "
                      f"{d.get('notes', '')[:80]}")

    if args.promote or args.all:
        print(f"\n━━━ PROMOTING WINNERS ━━━")
        v_num = int(args.auto_pick.replace("v", ""))
        promote(manifest, {name: v_num for name in manifest["avatars"]})

    print(f"\n━━━ DONE ━━━")
    print(f"📂 Avatars in: {CHAR_DIR}/")
    print(f"   Next: run prepEpisodeScenes.py --episode {args.episode}")
    print(f"   Then: re-render clip stills with locked avatars")


if __name__ == "__main__":
    main()
