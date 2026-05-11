#!/usr/bin/env python3
"""
Upload a SaraAndEva episode MP4 to YouTube on the SaraAndEva channel.

  - Made-for-Kids = ON (forced, COPPA compliance)
  - Privacy = UNLISTED initially (user reviews then flips to public)
  - Uses credentials-saraandeva.json + token-saraandeva.json (separate from
    podcast-publishing flow which uses credentials.json + token.json)
  - Idempotent playlist add to "Season 1" (PLMLz_1vaheL70se8M2xV0vQttiZlIJJ6f)
    for cross-episode autoplay-chain retention
  - Pre-upload validation via validateEpisode.py (skip with --skip-validation)

Faithful Python port of uploadEpisodeToSaraAndEva.mjs. Requires:
  pip3 install --user --break-system-packages google-api-python-client google-auth-oauthlib

Usage:
  python3 uploadEpisodeToSaraAndEva.py <video.mp4> [--title "..."]
    [--description-file path] [--tags-file path]
    [--privacy unlisted|public|private] [--thumbnail path.jpg]
    [--playlist-id PL...|--no-playlist]
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

try:
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
except ImportError as e:
    print(f"Missing Python YouTube libs: {e}\n"
          f"  pip3 install --user --break-system-packages google-api-python-client google-auth-oauthlib",
          file=sys.stderr)
    sys.exit(1)

SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
    "https://www.googleapis.com/auth/youtubepartner",
]
ROOT = Path("/Volumes/Samsung500/goreadling")
CREDENTIALS_PATH = ROOT / "credentials-saraandeva.json"
TOKEN_PATH = ROOT / "token-saraandeva.json"
SEASON_1_PLAYLIST_ID = "PLMLz_1vaheL70se8M2xV0vQttiZlIJJ6f"

DEFAULT_TAGS = [
    "kids cartoon", "sara and eva", "pixar style",
    "puppy cartoon", "cartoons for kids", "kids stories",
    "family cartoon", "preschool", "jack russell", "pomeranian",
    "breakfast", "pancakes", "morning routine", "school bus",
]

DEFAULT_DESCRIPTION = """\
Wake up, eat pancakes, count to five, brush teeth, off to school! Join Sara, Eva, Mama, Papa, Ginger, and Joe for a sunny family morning.

This is Episode 1 of Sara and Eva — a Pixar-style animated kids' show about two real-life sisters and their two real-life dogs.

#SaraAndEva #KidsCartoon #CartoonsForKids #PreschoolLearning #PuppyStories
"""


def get_oauth_credentials() -> Credentials:
    creds_raw = json.loads(CREDENTIALS_PATH.read_text())
    key = creds_raw.get("installed") or creds_raw.get("web")

    if TOKEN_PATH.is_file():
        tok = json.loads(TOKEN_PATH.read_text())
        token_scopes = (tok.get("scope") or "").split()
        missing = [s for s in SCOPES if s not in token_scopes]
        if not missing:
            return Credentials(
                token=tok.get("access_token") or tok.get("token"),
                refresh_token=tok.get("refresh_token"),
                token_uri=key.get("token_uri", "https://oauth2.googleapis.com/token"),
                client_id=key["client_id"],
                client_secret=key["client_secret"],
                scopes=SCOPES,
            )
        print(f"\n🔐 OAuth scope upgrade required (missing: {missing})\n")

    flow = Flow.from_client_config(creds_raw, scopes=SCOPES)
    flow.redirect_uri = key["redirect_uris"][0]
    auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")
    print("\n🔐 OAuth for the SaraAndEva channel — full scope set.")
    print(f"1) Open this URL in a browser logged into the SaraAndEva Google account:\n\n   {auth_url}\n")
    print("2) Authorize, copy the code from the redirect URL, paste here.")
    code = input("\nPaste the authorization code: ").strip()
    flow.fetch_token(code=code)
    creds = flow.credentials
    TOKEN_PATH.write_text(json.dumps({
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scope": " ".join(creds.scopes or []),
    }, indent=2))
    print(f"✓ Saved token to {TOKEN_PATH}")
    return creds


def find_playlist_id_by_name(youtube, name: str) -> str | None:
    want = name.strip().lower()
    page_token = None
    for _ in range(10):
        res = youtube.playlists().list(
            part="snippet", mine=True, maxResults=50, pageToken=page_token
        ).execute()
        for pl in res.get("items", []):
            if (pl.get("snippet", {}).get("title", "") or "").strip().lower() == want:
                return pl["id"]
        page_token = res.get("nextPageToken")
        if not page_token: break
    return None


def add_video_to_playlist(youtube, video_id: str, playlist_id: str):
    page_token = None
    for _ in range(20):
        res = youtube.playlistItems().list(
            part="snippet", playlistId=playlist_id, maxResults=50, pageToken=page_token
        ).execute()
        for item in res.get("items", []):
            if item.get("snippet", {}).get("resourceId", {}).get("videoId") == video_id:
                print("   Playlist: already in playlist (skipping add)")
                return
        page_token = res.get("nextPageToken")
        if not page_token: break
    youtube.playlistItems().insert(
        part="snippet",
        body={"snippet": {"playlistId": playlist_id,
                          "resourceId": {"kind": "youtube#video", "videoId": video_id}}}
    ).execute()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video_path")
    ap.add_argument("--title", default="Sara and Eva — Episode 1: The Puppies Want Pancakes")
    ap.add_argument("--description-file", default=None)
    ap.add_argument("--tags-file", default=None)
    ap.add_argument("--privacy", default="unlisted", choices=["unlisted", "public", "private"])
    ap.add_argument("--thumbnail", default=None)
    ap.add_argument("--playlist-id", default=SEASON_1_PLAYLIST_ID)
    ap.add_argument("--playlist-name", default="Sara and Eva 🌟 Season 1 — Real Sisters, Real Puppies, Real Adventures")
    ap.add_argument("--no-playlist", action="store_true")
    ap.add_argument("--skip-validation", action="store_true")
    args = ap.parse_args()

    video_path = Path(args.video_path)
    if not video_path.is_file():
        print(f"video not found: {video_path}", file=sys.stderr); sys.exit(1)

    # Detect episode number from path (season_01/episode_NN/ or content/episodes/epNN/)
    ep_num = None
    m = re.search(r"episode_(\d+)/|content/episodes/ep(\d+)/", str(video_path))
    if m:
        ep_num = int(m.group(1) or m.group(2))

    if not args.skip_validation and ep_num is not None:
        validator = Path(__file__).parent / "validateEpisode.py"
        print(f"\n🩺 Pre-upload validation — validateEpisode --episode={ep_num}")
        r = subprocess.run(["python3", str(validator), f"--episode={ep_num}"])
        if r.returncode == 1:
            print("\n❌ validateEpisode found errors. Fix or pass --skip-validation. Aborting.",
                  file=sys.stderr); sys.exit(1)

    # Inject episode number into title if missing.
    # User directive 2026-05-08: every uploaded video MUST have its episode number visible.
    # Detect "Ep <N>" / "Episode <N>" / "ep<NN>" anywhere in the title; if none AND we know
    # ep_num, prepend "Ep <N>:" to the title. Idempotent — re-uploading same title doesn't double.
    if ep_num is not None:
        has_epnum = re.search(r"\b(?:ep(?:isode)?\.?\s*0?\d+)\b", args.title, re.I)
        if not has_epnum:
            args.title = f"Ep {ep_num}: {args.title}"
            print(f"  ℹ injected episode number — title now: {args.title!r}")

    tags = (Path(args.tags_file).read_text().splitlines()
            if args.tags_file and Path(args.tags_file).is_file()
            else DEFAULT_TAGS)
    tags = [t.strip() for t in tags if t.strip()]
    description = (Path(args.description_file).read_text()
                   if args.description_file and Path(args.description_file).is_file()
                   else DEFAULT_DESCRIPTION)

    creds = get_oauth_credentials()
    youtube = build("youtube", "v3", credentials=creds)

    file_size = video_path.stat().st_size
    print(f"\n📤 Uploading: {video_path.name} ({file_size/1024/1024:.1f} MB)")
    print(f"   Title:   {args.title}")
    print(f"   Privacy: {args.privacy}")
    print("   Made for Kids: ON (forced)")

    media = MediaFileUpload(str(video_path), chunksize=-1, resumable=True)
    res = youtube.videos().insert(
        part="snippet,status",
        notifySubscribers=False,
        body={
            "snippet": {
                "title": args.title,
                "description": description,
                "tags": tags,
                "categoryId": "24",   # Entertainment
                "defaultLanguage": "en",
            },
            "status": {
                "privacyStatus": args.privacy,
                "selfDeclaredMadeForKids": True,
                "embeddable": True,
            },
        },
        media_body=media,
    ).execute()

    video_id = res["id"]
    print("\n✅ Uploaded.")
    print(f"   Video ID:  {video_id}")
    print(f"   Watch:     https://youtu.be/{video_id}")
    print(f"   Edit:      https://studio.youtube.com/video/{video_id}/edit")

    if args.thumbnail:
        thumb = Path(args.thumbnail)
        if not thumb.is_file():
            print(f"\n⚠ thumbnail file not found: {thumb}")
        else:
            try:
                youtube.thumbnails().set(
                    videoId=video_id,
                    media_body=MediaFileUpload(str(thumb))
                ).execute()
                print(f"   Thumbnail: {thumb.name} ✓")
            except Exception as e:
                print(f"\n⚠ thumbnail upload failed: {e}")

    if not args.no_playlist:
        try:
            playlist_id = args.playlist_id or find_playlist_id_by_name(youtube, args.playlist_name)
            if not playlist_id:
                print(f"\n⚠ Playlist not found by name: \"{args.playlist_name}\"")
            else:
                add_video_to_playlist(youtube, video_id, playlist_id)
                print(f"   Playlist: ✓ added to \"{args.playlist_name}\"")
                print(f"   https://youtube.com/playlist?list={playlist_id}")
        except Exception as e:
            print(f"\n⚠ Playlist add failed: {e}")
            if "403" in str(e) or "insufficientPermissions" in str(e):
                print(f"   Likely a scope issue. Delete {TOKEN_PATH} and re-run.")

    if args.privacy == "unlisted":
        print("\n📋 Status: UNLISTED — review the video in YouTube Studio.")
        print("   When ready, flip privacy to PUBLIC in the Studio editor.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ {e}", file=sys.stderr)
        sys.exit(1)
