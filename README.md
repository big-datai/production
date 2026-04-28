# goreadling-production

Content production pipeline for [GoReadling](https://goreadling.com): generates stories, podcasts, and animated video clips, then publishes to Firestore / YouTube / Spotify.

The web and mobile app live in a separate repo. This repo only handles data transformation and external API calls.

## Layout

```
.
├── src/goreadling/      # Python — primary, going forward
│   ├── config.py        # env loading, paths
│   └── firebase_client.py
├── legacy/              # existing Node.js .mjs pipeline (being ported)
│   ├── content/         # story / podcast / video generators
│   ├── scripts/         # db checks, SEO updaters
│   └── package.json
├── scripts/             # Python utility scripts
│   └── create-shorts.py
├── assets/characters/   # character config (PNGs are gitignored, regen from JSON)
├── pyproject.toml
├── requirements.txt
└── requirements-dev.txt
```

## Setup

```bash
# Python (primary)
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pip install -e .

# Node legacy (still runnable until ported)
cd legacy && npm install
```

Copy `.env.example` to `.env` and fill in keys. `credentials.json` and `token.json` are not committed — drop yours at the repo root.

## Running

```bash
# Python (porting in progress)
python -m goreadling.db.check_duplicates

# Node legacy (until ported)
cd legacy && npm run seed-story
node legacy/scripts/db/checkStories.mjs
```

## Porting plan

Scripts are ported to Python one at a time. The .mjs version stays in `legacy/` until the Python port is verified. Order is roughly:

1. **db checks** (`legacy/scripts/db/*.mjs`) — small, easy, no external state changes
2. **seo** (`legacy/scripts/seo/*.mjs`) — Google Search Console, Spotify/YouTube metadata
3. **stories** (`legacy/content/stories/*.mjs`) — Firestore seeders
4. **podcast pipeline** (`legacy/content/podcast/*.mjs`) — TTS, video assembly, uploads
5. **kling/video** — animated clip generation

Once a script's Python equivalent is working in production, delete the `.mjs`.
