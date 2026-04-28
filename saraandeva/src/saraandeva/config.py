"""Environment + path config for SaraAndEva pipeline."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
CONTENT_DIR = ROOT / "content"
EPISODES_DIR = CONTENT_DIR / "episodes"
ASSETS_DIR = ROOT / "assets"
CHARACTERS_DIR = ASSETS_DIR / "characters"
SCENES_DIR = ASSETS_DIR / "scenes"
PHOTOS_DIR = ASSETS_DIR / "photos"

load_dotenv(ROOT / ".env", override=False)


def require(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val


def optional(name: str, default: str | None = None) -> str | None:
    return os.environ.get(name, default)


GOOGLE_APPLICATION_CREDENTIALS = optional(
    "GOOGLE_APPLICATION_CREDENTIALS",
    str(ROOT / "credentials.json"),
)
FIREBASE_PROJECT_ID = optional("FIREBASE_PROJECT_ID")
FIREBASE_DATABASE_ID = optional("FIREBASE_DATABASE_ID")
FIREBASE_STORAGE_BUCKET = optional("FIREBASE_STORAGE_BUCKET")

KLING_ACCESS_KEY = optional("KLING_ACCESS_KEY")
KLING_SECRET_KEY = optional("KLING_SECRET_KEY")
