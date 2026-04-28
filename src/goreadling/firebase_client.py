"""Firebase Admin SDK initializer. One app instance, lazy."""

from __future__ import annotations

import firebase_admin
from firebase_admin import credentials, firestore, storage

from .config import (
    FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET,
    GOOGLE_APPLICATION_CREDENTIALS,
)

_app: firebase_admin.App | None = None


def get_app() -> firebase_admin.App:
    global _app
    if _app is not None:
        return _app

    cred = credentials.Certificate(GOOGLE_APPLICATION_CREDENTIALS)
    options: dict[str, str] = {}
    if FIREBASE_PROJECT_ID:
        options["projectId"] = FIREBASE_PROJECT_ID
    if FIREBASE_STORAGE_BUCKET:
        options["storageBucket"] = FIREBASE_STORAGE_BUCKET
    _app = firebase_admin.initialize_app(cred, options or None)
    return _app


def get_firestore() -> firestore.Client:
    return firestore.client(get_app())


def get_storage_bucket():
    return storage.bucket(app=get_app())
