#!/usr/bin/env python3
"""
Daily monitor — check Made-for-Kids status on all NOT-MfK videos.

YouTube's classifier does periodic deep re-scans. A video that was successfully
flipped to Not-Made-for-Kids can silently revert to MfK days later, losing
end-screens, cards, comments — without notifying the creator.

This script:
  1. Fetches selfDeclaredMadeForKids + madeForKids for tracked video IDs
  2. Flags any video where actual=True despite self=False (reverted)
  3. Prints a tight status table

Run daily via cron / scheduled-task. Exit code 1 if any video reverted.

Usage:
  python3 _check_video_status.py
  python3 _check_video_status.py --json    # machine-readable output

See lesson_made_for_kids_classifier_triggers.md for the cure.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

ROOT = Path("/Volumes/Samsung500/goreadling")

# Videos we've flipped to Not-Made-for-Kids — add new ones as they're flipped.
TRACKED_VIDEOS = {
    "cbJZAgm0HxY": "ep04 main — Joe's Stash (channel hero)",
    "GCXmqf4OmEo": "ep07 main — Mother's Day",
    "AohVDHtq7SI": "ep01 main — Pancakes",
    "gfPIluQKtYA": "ep08 main — Dentist",
    "P1zby1DtbtA": "Joe's Stash Short",
    "pKNVNVWacOw": "Mother's Day Short",
    "AaZm1enlDSc": "ep14 Anniversary Short",
    "TK0nTtFD_GQ": "I LOVE Costco Short",
}


def make_youtube():
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


def check_all(json_output: bool = False) -> int:
    yt = make_youtube()
    ids = list(TRACKED_VIDEOS.keys())
    r = yt.videos().list(part="status,snippet", id=",".join(ids)).execute()

    results = []
    reverted_count = 0
    for it in r.get("items", []):
        vid = it["id"]
        s = it["status"]
        self_v = s.get("selfDeclaredMadeForKids")
        actual_v = s.get("madeForKids")
        label = TRACKED_VIDEOS.get(vid, "?")
        status = "OK"
        if self_v is False and actual_v is False:
            status = "ok"
        elif self_v is False and actual_v is True:
            status = "REVERTED"
            reverted_count += 1
        elif self_v is True:
            status = "user-set-MfK"  # user re-enabled MfK on purpose
        results.append({
            "vid": vid, "label": label,
            "self": self_v, "actual": actual_v, "status": status,
        })

    if json_output:
        print(json.dumps({"reverted": reverted_count, "items": results}, indent=2))
    else:
        print(f"{'vid':<13} {'self':<5} {'actual':<6} {'status':<13}  label")
        print(f"{'─'*13} {'─'*5} {'─'*6} {'─'*13}  {'─'*40}")
        for r in results:
            icon = "✅" if r["status"] == "ok" else "🚨" if r["status"] == "REVERTED" else "⚠️"
            print(f"{r['vid']:<13} {str(r['self']):<5} {str(r['actual']):<6} {icon} {r['status']:<10}  {r['label']}")
        print()
        if reverted_count:
            print(f"🚨 {reverted_count} video(s) reverted — see lesson_made_for_kids_classifier_triggers.md for the aggressive-cleanup cure")
        else:
            print(f"✅ All {len(results)} tracked videos still Not-Made-for-Kids")

    return 1 if reverted_count else 0


def main():
    ap = argparse.ArgumentParser(description="MfK reversion monitor for tracked videos")
    ap.add_argument("--json", action="store_true", help="machine-readable JSON output")
    args = ap.parse_args()
    sys.exit(check_all(json_output=args.json))


if __name__ == "__main__":
    main()
