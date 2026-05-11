#!/usr/bin/env python3
"""
Set the @SaraAndEva channel watermark via YouTube Data API v3.

The watermark is a small badge YouTube overlays in the corner of every video
on the channel. Hovering it shows a Subscribe button — closest thing to a
"clickable channel link from inside a video."

This is a CHANNEL-level setting (one badge applies to all videos, including
back catalog) — not a per-video override.

Quota cost: 50 units (well under the default 10000/day).

Usage:
  python3 _set_channel_watermark.py
  python3 _set_channel_watermark.py --image custom.png --corner topLeft
  python3 _set_channel_watermark.py --duration 0      # show for entire video (default)

Default image: assets/branding/video_watermark.png (the same circular badge
used by applyWatermark.py + generateThumbnail.mjs, so the brand stays visually
consistent across thumbnail → video → channel watermark).
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

ROOT = Path("/Volumes/Samsung500/goreadling")
PROJECT = Path("/Volumes/Samsung500/goreadling-production/saraandeva")
DEFAULT_WATERMARK = PROJECT / "assets" / "branding" / "video_watermark_150.png"

VALID_CORNERS = ("topLeft", "topRight", "bottomLeft", "bottomRight")


def make_youtube():
    """Build a YouTube API client from the saraandeva OAuth token."""
    cred_data = json.loads((ROOT / "credentials-saraandeva.json").read_text())
    tok_data = json.loads((ROOT / "token-saraandeva.json").read_text())
    k = cred_data.get("installed") or cred_data.get("web")
    creds = Credentials(
        token=tok_data.get("access_token"),
        refresh_token=tok_data.get("refresh_token"),
        token_uri=k["token_uri"],
        client_id=k["client_id"],
        client_secret=k["client_secret"],
        scopes=tok_data.get("scope", "").split(),
    )
    return build("youtube", "v3", credentials=creds)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", default=str(DEFAULT_WATERMARK), help="PNG path")
    ap.add_argument("--corner", default="topRight", choices=VALID_CORNERS,
                    help="topLeft, topRight, bottomLeft, bottomRight")
    ap.add_argument("--offset-ms", type=int, default=15000,
                    help="When to start showing watermark, ms from start (default 15s — past intro)")
    ap.add_argument("--duration-ms", type=int, default=0,
                    help="How long to show watermark, ms. 0 = entire video (recommended)")
    args = ap.parse_args()

    image_path = Path(args.image)
    if not image_path.exists():
        sys.exit(f"❌ image not found: {image_path}")
    sz_kb = image_path.stat().st_size / 1024
    if sz_kb > 1024:
        sys.exit(f"❌ image too large: {sz_kb:.0f} KB (YouTube limit: 1 MB)")

    youtube = make_youtube()

    # Fetch the authenticated channel ID
    chan_resp = youtube.channels().list(part="id,snippet", mine=True).execute()
    items = chan_resp.get("items", [])
    if not items:
        sys.exit("❌ no channel found for these credentials")
    channel_id = items[0]["id"]
    channel_title = items[0]["snippet"]["title"]
    print(f"📺 Channel: {channel_title} ({channel_id})")
    print(f"🖼  Watermark: {image_path.name} ({sz_kb:.1f} KB)")
    print(f"   Corner: {args.corner}")
    print(f"   Timing: offsetMs={args.offset_ms} durationMs={args.duration_ms}"
          f"{'  (entire video)' if args.duration_ms == 0 else ''}")

    # Build the upload — body controls timing + position; media controls bytes
    # NOTE: offsetMs / durationMs MUST be strings (per API discovery doc) —
    # passing them as ints triggers a generic 400 "Invalid Value".
    timing = {
        "type": "offsetFromStart",
        "offsetMs": str(args.offset_ms),
    }
    if args.duration_ms > 0:
        timing["durationMs"] = str(args.duration_ms)
    # else: omit durationMs → API default = show for entire video
    body = {
        "timing": timing,
        "position": {
            "type": "corner",
            "cornerPosition": args.corner,
        },
    }
    media = MediaFileUpload(str(image_path), mimetype="image/png", resumable=False)

    try:
        youtube.watermarks().set(
            channelId=channel_id,
            body=body,
            media_body=media,
        ).execute()
    except Exception as e:
        # API returns errors as HttpError with .content (JSON)
        msg = str(e)
        if hasattr(e, "content"):
            try:
                msg = json.dumps(json.loads(e.content), indent=2)
            except Exception:
                msg = e.content.decode("utf-8", errors="replace")
        sys.exit(f"❌ watermarks.set failed:\n{msg}")

    print(f"✅ watermark applied to {channel_title}")
    print(f"   View: https://www.youtube.com/{channel_title.replace(' ', '')}")
    print(f"   Manage: https://studio.youtube.com/channel/{channel_id}/editing/branding")


if __name__ == "__main__":
    main()
