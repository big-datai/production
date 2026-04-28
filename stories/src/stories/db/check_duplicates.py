"""Find stories in Firestore that share a title.

Python port of legacy/scripts/db/checkDuplicates.mjs.

Run:
    python -m stories.db.check_duplicates
"""

from __future__ import annotations

import os
from collections import defaultdict

from stories.firebase_client import get_firestore


def main() -> int:
    db = get_firestore()
    database_id = os.environ.get("FIREBASE_DATABASE_ID")
    if database_id and database_id != "(default)":
        db._database_string_internal = (
            f"projects/{db.project}/databases/{database_id}"
        )

    titles: dict[str, list[str]] = defaultdict(list)
    for doc in db.collection("stories").stream():
        title = doc.to_dict().get("title")
        if title:
            titles[title].append(doc.id)

    dupes = {t: ids for t, ids in titles.items() if len(ids) > 1}
    if not dupes:
        print("No duplicates found.")
        return 0

    print("Duplicate stories:")
    for title, ids in sorted(dupes.items()):
        print(f"  {title}: {len(ids)} copies")
        for sid in ids:
            print(f"    - {sid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
