#!/usr/bin/env python3
"""
Pre-upload checklist for an assembled Sara & Eva episode.

Verifies the deliverable before YouTube upload:
  - All declared clips have rendered mp4s in clips/
  - No gaps in numeric clip sequence
  - Music-video loop segments match the song's block duration
  - Final assembled mp4 exists with reasonable size + duration
  - Thumbnail exists, metadata files exist (description/tags)
  - Google Ads policy compliance (title/description/tags)

Faithful Python port of validateEpisode.mjs.

Usage:
  python3 validateEpisode.py --episode=10
  python3 validateEpisode.py --episode=10 --strict
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")

EMOJI_RE = re.compile(
    r"[\U0001F300-\U0001F9FF☀-➿\U0001F600-\U0001F64F]"
)
ALL_CAPS_WHITELIST = {
    "YMCA", "BBQ", "USA", "USA!", "CEO", "FAQ", "OK", "OK!", "TV",
    "DIY", "USB", "MP3", "MP4", "ABC", "ABC!", "PB&J", "DIY!"
}


def probe_duration(file: Path):
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(file)],
            capture_output=True, text=True, timeout=20)
        return float(r.stdout.strip()) if r.returncode == 0 else None
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", type=int, required=True)
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    ep_pad = f"{args.episode:02d}"
    spec_dir = PROJECT_ROOT / "content" / "episodes" / f"ep{ep_pad}"
    deliver_dir = PROJECT_ROOT / "season_01" / f"episode_{ep_pad}"
    clips_dir = deliver_dir / "clips"

    print(f"🩺 Validating ep{ep_pad}")
    print(f"   spec dir:    {spec_dir}")
    print(f"   deliver dir: {deliver_dir}\n")

    errs: list[str] = []
    warns: list[str] = []

    # 1. Spec dir
    if not spec_dir.is_dir():
        errs.append(f"spec directory missing: {spec_dir}")

    # 2. Clips
    if not clips_dir.is_dir():
        errs.append(f"clips directory missing: {clips_dir}")
    else:
        spec_pat = re.compile(r"^(\d+(\.\d+)?|[A-Z])\.json$")
        render_pat = re.compile(r"^(\d+(\.\d+)?|[A-Z])\.mp4$")
        specs = [p.name for p in spec_dir.iterdir() if spec_pat.match(p.name)] if spec_dir.is_dir() else []
        renders = [p.name for p in clips_dir.iterdir() if render_pat.match(p.name)]
        render_stems = {p.replace(".mp4", "") for p in renders}

        for s in specs:
            stem = s.replace(".json", "")
            if re.fullmatch(r"[A-Z]", stem):
                continue
            if stem not in render_stems:
                errs.append(f"spec {s} has no rendered mp4 (expected clips/{stem}.mp4)")

        numeric = sorted(int(s) for s in render_stems if s.isdigit())
        if numeric:
            mn, mx = numeric[0], numeric[-1]
            for i in range(mn, mx + 1):
                if i not in numeric:
                    warns.append(f"numeric clip {i}.mp4 missing (sequence gap between {mn} and {mx})")

        # Music-video segments
        flat_spec = PROJECT_ROOT / "content" / "episodes" / f"ep{ep_pad}.json"
        if flat_spec.is_file():
            try: ep = json.loads(flat_spec.read_text())
            except json.JSONDecodeError: ep = {}
            blocks = ((ep.get("music") or {}).get("musicVideoBlocks")) or []
            decimal_segs = [f for f in renders if re.fullmatch(r"\d+\.\d+\.mp4", f)]
            if blocks and not decimal_segs:
                warns.append(f"spec declares {len(blocks)} music-video block(s) but no decimal segment files")
            seg_durs = [(f, probe_duration(clips_dir / f)) for f in decimal_segs]
            used = set()
            for b in blocks:
                expected = b.get("blockDurationSec")
                matched = None
                for f, d in seg_durs:
                    if f in used or d is None or expected is None: continue
                    if abs(d - expected) <= 5:
                        matched = f
                        break
                if matched: used.add(matched)
                else:
                    seg_list = ", ".join(decimal_segs) or "none"
                    warns.append(f"music-video block {b.get('blockId')} ({expected}s) has no matching segment file ({seg_list})")

    # 3. Final assembled mp4
    versions = []
    if deliver_dir.is_dir():
        version_pat = re.compile(rf"^ep{ep_pad}_v\d+\.mp4$")
        versions = sorted(p.name for p in deliver_dir.iterdir() if version_pat.match(p.name))
    if not versions:
        errs.append(f"no assembled episode mp4 found (expected season_01/episode_{ep_pad}/ep{ep_pad}_v*.mp4)")
    else:
        latest = versions[-1]
        latest_path = deliver_dir / latest
        size = latest_path.stat().st_size
        dur = probe_duration(latest_path)
        print(f"   latest:      {latest} ({size/1024/1024:.1f} MB, {dur:.1f}s)" if dur else f"   latest:      {latest} ({size/1024/1024:.1f} MB)")
        if size < 50 * 1024 * 1024:
            warns.append(f"{latest} is {size/1024/1024:.1f} MB — unusually small for a full episode")
        if dur is not None and (dur < 360 or dur > 600):
            warns.append(f"{latest} duration {dur:.1f}s outside typical 6-10 min range")

    # 4. Thumbnail
    thumb_path = deliver_dir / f"ep{ep_pad}_thumbnail.jpg"
    if not thumb_path.is_file():
        errs.append(f"thumbnail missing: {thumb_path} (run generateThumbnail.py)")

    # 5. Metadata files
    desc_path = deliver_dir / f"ep{ep_pad}_description.txt"
    tags_path = deliver_dir / f"ep{ep_pad}_tags.txt"
    if not desc_path.is_file(): warns.append(f"description missing: {desc_path}")
    if not tags_path.is_file(): warns.append(f"tags missing: {tags_path}")
    else:
        if len(tags_path.read_text()) > 500:
            errs.append("tags file > 500 chars — YouTube rejects with 'invalid video keywords'")

    # 6. Vertical short
    short_path = deliver_dir / f"ep{ep_pad}_short.mp4"
    if not short_path.is_file():
        warns.append(f"vertical short missing: {short_path} (run generateShort.py)")

    # 7. Google Ads policy compliance
    def check_metadata(p: Path, kind: str):
        if not p.is_file(): return
        t = p.read_text()
        issues = []
        emoji_pair = re.compile(rf"({EMOJI_RE.pattern})\s*({EMOJI_RE.pattern})")
        if emoji_pair.search(t):
            issues.append("consecutive emojis violate Google Ads 'repeated symbols'")
        if re.search(r"[!?]{2,}|\.{3,}", t):
            issues.append("repeated punctuation (!! / ?? / ...) violates Google Ads 'consecutive symbols'")
        caps_words = [w for w in re.findall(r"\b[A-Z]{4,}\b", t) if w not in ALL_CAPS_WHITELIST]
        if caps_words:
            issues.append(f"ALL CAPS gimmick words {caps_words[:5]} — Google Ads 'gimmicky caps'")
        if re.search(r"\([^()\n]{15,}\)", t):
            issues.append("long parenthetical (>15 chars) violates Google Ads 'gimmicky'")
        if "•" in t:
            issues.append("bullet symbol '•' — Google Ads flags as non-standard. Use '-' instead.")
        if kind == "tags" and len(t) > 500:
            issues.append(f"tags total {len(t)} chars > 500 limit (rejects upload)")
        for i in issues:
            errs.append(f"{p.name}: {i}")

    for fname, kind in [
        (f"ep{ep_pad}_description.txt", "description"),
        (f"ep{ep_pad}_tags.txt", "tags"),
        (f"ep{ep_pad}_short_description.txt", "description"),
        (f"ep{ep_pad}_short_tags.txt", "tags"),
    ]:
        check_metadata(deliver_dir / fname, kind)

    # ─── Report ─────────────────────────────────────────────────────────
    print()
    for e in errs: print(f"  ❌ {e}")
    for w in warns: print(f"  ⚠  {w}")

    n_err, n_warn = len(errs), len(warns)
    print(f"\n📊 Summary: {n_err} errors · {n_warn} warnings")
    if n_err > 0:
        print("\n❌ Episode is NOT ready to upload.")
        sys.exit(1)
    if n_warn > 0 and args.strict:
        print(f"\n⚠ {n_warn} warning(s) — strict mode treats as errors.")
        sys.exit(2)
    if n_warn > 0:
        print(f"\n⚠ {n_warn} warning(s) — review but not blocking.")
        sys.exit(0)
    print("\n✅ Episode ready to upload.")
    sys.exit(0)


if __name__ == "__main__":
    main()
