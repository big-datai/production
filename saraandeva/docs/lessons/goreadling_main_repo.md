---
name: goreadling main repo location
description: Where to look when something seems missing in goreadling-production — the originating monorepo with web/mobile app, backend, and shared assets
type: reference
originSessionId: 91221868-87c2-4813-aab7-e10a3e2ec0ec
---
The `goreadling-production` repo (this one, at `/Volumes/Samsung500/goreadling-production/`) was forked out of the main `goreadling` monorepo at `/Volumes/Samsung500/goreadling/`.

The split kept only the content production pipelines (`stories/` + `saraandeva/`) here. The main repo still has:
- web/mobile app (App.tsx, components/, contexts/, hooks/, index.tsx, capacitor.config.ts, ios/, dist/)
- backend/
- ARCHITECTURE.md, architecture-*.svg
- shared content/, assets/, exports/, docs/
- credentials.json, credentials-saraandeva.json, firestore.rules, firebase.json
- cloudbuild config

If something referenced in this repo seems missing (env defaults, shared modules, original architecture context, prior commit history before the split), check `/Volumes/Samsung500/goreadling/` before assuming it's broken.

Note: `../../goreadling` from a worktree path will not resolve — use the absolute path.
