"""Environment + path config. Loads .env, exposes paths and required vars."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
LEGACY_DIR = ROOT / "legacy"
ASSETS_DIR = ROOT / "assets"
CHARACTERS_DIR = ASSETS_DIR / "characters"

load_dotenv(ROOT / ".env.production")
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
FIREBASE_STORAGE_BUCKET = optional("FIREBASE_STORAGE_BUCKET")
