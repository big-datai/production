#!/usr/bin/env python3
"""
Draft SEO-friendly title variants for a Sara & Eva episode.

Follows the formula from lesson_title_seo_formula_2026_05.md:

    [Primary Keyword] [Curiosity Hook] | Sara and Eva [SEO Descriptor]

Drop "Ep N" — competitor channels (Like Nastya, Vlad & Niki, Cocomelon) don't
use episode numbers in titles. Episode # lives in description body.

Usage:
  python3 _draft_seo_title.py --logline "Eva loses her first tooth, Joe steals it from under her pillow"
  python3 _draft_seo_title.py --keyword "Tooth Fairy" --hook "and a Sneaky Dog"
  python3 _draft_seo_title.py --episode 16   # read existing episode.json
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path

PROJECT_ROOT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")

# High-volume Primary Keyword candidates — see reference_youtube_kids_search_keywords_2026.md
HIGH_VOLUME_KEYWORDS = {
    # Tier 1
    "tooth fairy": 121_000,
    "dentist": 165_000,
    "first day of school": 135_000,
    "father's day": 201_000,
    "mother's day": 246_000,
    "birthday": 90_000,
    "brushing teeth": 110_000,
    "bedtime": 90_000,
    # Tier 2
    "bath time": 74_000,
    "playground": 70_000,
    "doctor": 67_000,
    "pancakes": 55_000,
    "puppy": 48_000,
    "swimming": 45_000,
    "beach": 45_000,
    # Tier 3
    "new puppy": 38_000,
    "lemonade stand": 30_000,
    "splash park": 26_000,
    "camping": 35_000,
    "magic forest": 22_000,
    "library": 25_000,
    "soccer": 50_000,
}

SEO_DESCRIPTORS = (
    "Story for Kids",
    "Family Cartoon",
    "for Toddlers",
    "Family Story",
    "Cartoon for Kids",
    "Family Adventure",
)

BRAND = "Sara and Eva"


def find_keyword_in_logline(logline: str) -> str | None:
    """Pick the highest-volume keyword that appears in the logline."""
    text = logline.lower()
    matches = [(k, v) for k, v in HIGH_VOLUME_KEYWORDS.items() if k in text]
    if not matches:
        return None
    matches.sort(key=lambda x: -x[1])
    return matches[0][0]


def title_case(s: str) -> str:
    """Title Case but keep small words lowercase mid-string."""
    small = {"a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for", "with"}
    words = s.split()
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        if i > 0 and lw in small:
            out.append(lw)
        else:
            out.append(w[0].upper() + w[1:] if w else w)
    return " ".join(out)


def draft(keyword: str, hook: str | None = None) -> list[str]:
    kw = title_case(keyword)
    candidates = []
    base_hooks = [
        hook if hook else "Big Surprise!",
        "Won't Believe What Happens",
        "Family Story for Kids",
    ]
    for h in base_hooks:
        for desc in SEO_DESCRIPTORS[:3]:
            t = f"{kw} {h.rstrip('!')}! {BRAND} {desc}".strip()
            if len(t) <= 100:
                candidates.append(t)
    # Dedupe + return top 3 shortest unique
    seen = set()
    uniq = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    uniq.sort(key=len)
    return uniq[:3]


def ad_safe(title: str) -> str:
    """Strip emoji + reduce ALL CAPS for ad-safe variant."""
    # Strip non-ASCII (emojis)
    t = re.sub(r"[^\x00-\x7F]+", "", title).strip()
    # Replace any ALL CAPS run >2 chars with title case
    def lower_caps(m):
        return m.group(0).title()
    t = re.sub(r"\b[A-Z]{3,}\b", lower_caps, t)
    # Collapse multiple spaces / punctuation
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"[!?]+", "", t).strip()
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--logline", help="Episode logline; auto-extracts the keyword")
    ap.add_argument("--keyword", help="Explicit primary keyword (overrides --logline)")
    ap.add_argument("--hook", help="Curiosity hook phrase, e.g. 'and a Sneaky Dog'")
    ap.add_argument("--episode", type=int, help="Read content/episodes/epNN/episode.json")
    args = ap.parse_args()

    keyword = args.keyword
    if not keyword and args.episode:
        ep_path = PROJECT_ROOT / "content" / "episodes" / f"ep{args.episode:02d}" / "episode.json"
        if ep_path.is_file():
            data = json.loads(ep_path.read_text())
            keyword = find_keyword_in_logline(data.get("logline", "") + " " + data.get("title", ""))
            args.logline = data.get("logline", "")
    if not keyword and args.logline:
        keyword = find_keyword_in_logline(args.logline)
    if not keyword:
        print("❌ No keyword identified. Pass --keyword explicitly or use a logline with a high-volume term.")
        print("   See reference_youtube_kids_search_keywords_2026.md for the list.")
        return

    print(f"🎯 Primary keyword: {keyword!r} ({HIGH_VOLUME_KEYWORDS.get(keyword, 0):,}/mo searches)\n")

    titles = draft(keyword, args.hook)
    print(f"━━━ Title candidates ━━━")
    for i, t in enumerate(titles, 1):
        a = ad_safe(t)
        print(f"\n{i}. {t}  ({len(t)} chars)")
        print(f"   Ad-safe: {a}")

    print(f"\n━━━ Description first line ━━━")
    print(f"{title_case(keyword)} story for kids! [setup sentence with secondary keyword].")


if __name__ == "__main__":
    main()
