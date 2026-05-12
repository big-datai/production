#!/usr/bin/env python3
"""
Bulk-rewrite Sara & Eva video titles + descriptions to the new SEO format.
Per lesson_title_seo_formula_2026_05.md.

PHASED ROLLOUT:
  Phase 1 (all 32): front-load description's first line with high-volume keyword
                    + ensure playlist link is in first 200 chars
  Phase 2 (videos under 500 lifetime views): rewrite title to keyword-first
                                              format (preserves CTR on heroes)

SAFETY:
  - Backs up current state to a timestamped JSON file BEFORE any changes
  - --dry-run (default) prints proposed changes without touching YouTube
  - --apply does the actual update
  - --phase-1-only / --phase-2-only flags for partial runs

Usage:
  python3 _bulk_rewrite_titles_descriptions.py              # dry-run by default
  python3 _bulk_rewrite_titles_descriptions.py --phase-1-only
  python3 _bulk_rewrite_titles_descriptions.py --apply      # real updates

Restore from backup:
  python3 _bulk_rewrite_titles_descriptions.py --restore <backup_file.json>
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

ROOT = Path("/Volumes/Samsung500/goreadling")
PROJECT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
BACKUP_DIR = PROJECT / "content" / "_video_metadata_backups"
PLAYLIST_ID = "PLMLz_1vaheL7MwZ8OdmSPd1qftZ_WRwvS"
PLAYLIST_URL = f"https://www.youtube.com/playlist?list={PLAYLIST_ID}"

# High-volume keywords — see reference_youtube_kids_search_keywords_2026.md
# Order matters: longer phrases first so "tooth fairy" wins over "tooth"
KEYWORD_PATTERNS = [
    ("tooth fairy", "Tooth Fairy"),
    ("father's day", "Father's Day"),
    ("mother's day", "Mother's Day"),
    ("magic forest", "Magic Forest"),
    ("magic bottle", "Magic Bottle"),
    ("secret stash", "Joe's Secret Stash"),
    ("dream house", "Dream House"),
    ("birthday dream", "Birthday Dream House"),
    ("anniversary", "Anniversary"),
    ("brave-tooth", "Brave Tooth"),
    ("brave tooth", "Brave Tooth"),
    ("silver tooth", "Brave Tooth"),
    ("dentist day", "Dentist Day"),
    ("dentist", "Dentist"),
    ("halloween", "Halloween"),
    ("christmas", "Christmas"),
    ("burger heist", "Burger Heist"),
    ("backyard burger", "Backyard Burger"),
    ("bagel burglar", "Bagel Burglar"),
    ("bagel", "Bagel Hunt"),
    ("coffee quest", "Costco Coffee"),
    ("costco coffee", "Costco Coffee"),
    ("costco", "Costco"),
    ("tag game", "Tag Game"),
    ("package mystery", "Package Mystery"),
    ("ginger steals", "Ginger Steals"),
    ("steals the pancake", "Pancake Thief"),
    ("puppies want pancake", "Puppies Want Pancakes"),
    ("pancake", "Pancakes"),
    ("10 years of love", "10 Years of Love"),
    ("years of love", "10 Years of Love"),
    ("first ride", "Eva's First Ride"),
    ("first bike", "Eva's First Bike"),
    ("helmet", "Helmet Question"),
    ("morning routine", "Family Morning"),
    ("pomeranian", "Joe the Puppy"),
    ("joe", "Joe the Puppy"),
    ("ginger", "Ginger"),
]


def make_youtube():
    cred = json.loads((ROOT / "credentials-saraandeva.json").read_text())
    tok = json.loads((ROOT / "token-saraandeva.json").read_text())
    k = cred.get("installed") or cred.get("web")
    creds = Credentials(
        token=tok.get("access_token"), refresh_token=tok.get("refresh_token"),
        token_uri=k["token_uri"], client_id=k["client_id"],
        client_secret=k["client_secret"], scopes=tok.get("scope", "").split(),
    )
    return build("youtube", "v3", credentials=creds)


def detect_keyword(text: str) -> str | None:
    """Return the highest-priority high-volume keyword found in text."""
    text_lower = text.lower()
    for pat, formatted in KEYWORD_PATTERNS:
        if pat in text_lower:
            return formatted
    return None


def rewrite_description(original: str, title: str) -> tuple[str, bool]:
    """Phase 1: prepend SEO line + ensure playlist link. Returns (new_desc, changed).
    Idempotent — won't double-prepend if SEO line already present."""
    keyword = detect_keyword(title) or detect_keyword(original)
    if keyword:
        seo_line = f"{keyword} story for kids! Sara and Eva family animated series — new episodes every week."
    else:
        seo_line = "Sara and Eva family animated series — new episodes every week."

    # Build the canonical lead block
    playlist_line = f"Watch all Sara & Eva episodes in order: {PLAYLIST_URL}"
    lead = f"{seo_line}\n\n{playlist_line}"

    # Strip any old SEO/playlist leads we previously prepended
    cleaned = original
    # Remove old "[Keyword] story for kids! ..." lead if present
    cleaned = re.sub(
        r"^[A-Z][^\n]+ story for kids![^\n]*\n+",
        "",
        cleaned,
    )
    # Remove old "Watch all Sara & Eva..." lead lines (we'll re-add a clean one)
    cleaned = re.sub(
        r"^Watch all Sara & Eva episodes in order:[^\n]+\n+",
        "",
        cleaned,
    )
    cleaned = re.sub(
        r"^📺 Watch ALL Sara & Eva episodes in order:[^\n]+\n+",
        "",
        cleaned,
    )
    cleaned = cleaned.lstrip("\n")

    new_desc = f"{lead}\n\n{cleaned}".rstrip() + "\n"
    return new_desc, new_desc.strip() != original.strip()


def rewrite_title(original: str, is_short: bool) -> tuple[str | None, str]:
    """Phase 2: rewrite low-performer titles. Returns (new_title|None, reason)."""
    keyword = detect_keyword(original)
    if not keyword:
        return None, "no high-volume keyword detected in current title"

    # Extract a curiosity hook from the original (strip noise)
    hook = original
    hook = re.sub(r"Sara\s*[&and]+\s*Eva", "", hook, flags=re.I)
    hook = re.sub(r"\b(Ep|Episode)\s*\d+:?\s*", "", hook, flags=re.I)
    hook = re.sub(r"#\w+", "", hook)
    hook = re.sub(r"\|", "", hook)
    hook = re.sub(r"[—–-]+", " ", hook)
    hook = re.sub(re.escape(keyword), "", hook, flags=re.I)
    # Drop emojis (keep ASCII only for hook)
    hook = re.sub(r"[^\x00-\x7F]+", "", hook)
    hook = re.sub(r"\s+", " ", hook).strip(" !?,:.")

    if is_short:
        title = f"{keyword}! Sara and Eva #Shorts"
    else:
        if hook:
            title = f"{keyword} — {hook}! Sara and Eva Family Story for Kids"
        else:
            title = f"{keyword}! Sara and Eva Family Story for Kids"

    title = re.sub(r"\s+", " ", title).strip()
    title = title.replace("! !", "!").replace("!!", "!")
    if len(title) > 95:
        title = title[:95].rsplit(" ", 1)[0]

    if title == original:
        return None, "rewrite identical to original"
    return title, "ok"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--phase-1-only", action="store_true")
    ap.add_argument("--phase-2-only", action="store_true")
    ap.add_argument("--phase-2-threshold", type=int, default=500,
                    help="View threshold for title rewrite (default 500)")
    ap.add_argument("--restore", type=str, default=None,
                    help="Restore from backup file path")
    args = ap.parse_args()

    yt = make_youtube()

    if args.restore:
        bp = Path(args.restore)
        if not bp.is_file():
            sys.exit(f"❌ backup not found: {bp}")
        print(f"━━━ RESTORE from {bp.name} ━━━")
        backup = json.loads(bp.read_text())
        for vid, data in backup.items():
            try:
                yt.videos().update(part="snippet", body={"id": vid, "snippet": data}).execute()
                print(f"  ✅ restored {vid}: {data['title'][:50]}")
            except HttpError as e:
                print(f"  ❌ {vid}: {str(e)[:200]}")
        return

    is_dry = not args.apply
    print(f"━━━ MODE: {'DRY-RUN (no changes)' if is_dry else 'APPLY (real updates)'} ━━━\n")

    # Enumerate uploads
    ch = yt.channels().list(part="contentDetails", mine=True).execute()["items"][0]
    uploads = ch["contentDetails"]["relatedPlaylists"]["uploads"]
    vids = []
    token = None
    while True:
        r = yt.playlistItems().list(playlistId=uploads, part="snippet",
                                     maxResults=50, pageToken=token).execute()
        for it in r["items"]:
            vids.append(it["snippet"]["resourceId"]["videoId"])
        token = r.get("nextPageToken")
        if not token: break

    # Pull snippets + stats
    infos = {}
    for i in range(0, len(vids), 50):
        r = yt.videos().list(part="snippet,statistics", id=",".join(vids[i:i+50])).execute()
        for it in r["items"]:
            infos[it["id"]] = it

    # Backup
    if not is_dry:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        bp = BACKUP_DIR / f"backup_{ts}.json"
        bp.write_text(json.dumps({vid: {
            "title": info["snippet"]["title"],
            "description": info["snippet"]["description"],
            "tags": info["snippet"].get("tags", []),
            "categoryId": info["snippet"].get("categoryId", "24"),
            "defaultLanguage": info["snippet"].get("defaultLanguage", "en"),
        } for vid, info in infos.items()}, indent=2))
        print(f"💾 Backup → {bp.name}\n")

    # Plan
    desc_count, title_count, skip_count = 0, 0, 0
    plan = []
    for vid, info in infos.items():
        snippet = info["snippet"]
        title = snippet["title"]
        desc = snippet["description"]
        views = int(info["statistics"].get("viewCount", 0))
        is_short = "Shorts" in title or "#Shorts" in title

        p = {"vid": vid, "title_old": title, "views": views, "is_short": is_short}

        if not args.phase_2_only:
            new_desc, desc_changed = rewrite_description(desc, title)
            if desc_changed:
                p["desc_new"] = new_desc
                desc_count += 1

        if not args.phase_1_only:
            if views < args.phase_2_threshold:
                new_title, reason = rewrite_title(title, is_short)
                if new_title:
                    p["title_new"] = new_title
                    title_count += 1
                else:
                    p["title_skip"] = reason
                    skip_count += 1
            else:
                p["title_skip"] = f"hero ({views} views ≥ {args.phase_2_threshold})"
                skip_count += 1

        if "desc_new" in p or "title_new" in p:
            plan.append(p)

    # Print plan
    print(f"━━━ PLAN ━━━")
    print(f"  Phase 1 descriptions: {desc_count} updates")
    print(f"  Phase 2 titles:       {title_count} rewrites (under {args.phase_2_threshold} views)")
    print(f"  Title-skip (heroes / no-keyword): {skip_count}\n")

    for p in plan:
        marker = ""
        if "title_new" in p: marker += "🟡T "
        if "desc_new" in p:  marker += "🟢D "
        kind = "S" if p["is_short"] else "V"
        print(f"  {marker}{kind} {p['vid']} ({p['views']:>5}v)  {p['title_old'][:55]}")
        if "title_new" in p:
            print(f"        → title: {p['title_new']}")
        if "desc_new" in p:
            first_line = p["desc_new"].split("\n", 1)[0]
            print(f"        → desc:  {first_line[:120]}")

    if is_dry:
        print(f"\n💡 Dry-run done. Re-run with --apply to push changes.")
        print(f"   (Backup will be written before applying — restore via --restore <file>)")
        return

    # Apply
    print(f"\n━━━ APPLYING ━━━")
    applied, errors = 0, 0
    for p in plan:
        info = infos[p["vid"]]
        snippet = info["snippet"]
        body = {"id": p["vid"], "snippet": {
            "title": p.get("title_new", snippet["title"]),
            "categoryId": snippet.get("categoryId", "24"),
            "description": p.get("desc_new", snippet["description"]),
            "tags": snippet.get("tags", []),
            "defaultLanguage": snippet.get("defaultLanguage", "en"),
        }}
        try:
            yt.videos().update(part="snippet", body=body).execute()
            applied += 1
            print(f"  ✅ {p['vid']}  {body['snippet']['title'][:50]}")
        except HttpError as e:
            errors += 1
            msg = e.content.decode() if hasattr(e, "content") else str(e)
            print(f"  ❌ {p['vid']}: {msg[:200]}")

    print(f"\n━━━ DONE: {applied} applied, {errors} errors ━━━")


if __name__ == "__main__":
    main()
