# stories

Daily-story production pipeline: story text → multi-voice podcast → Kling video → publish to YouTube, Spotify, Firestore, and the website.

Status: **stable** — the existing `legacy/` Node.js pipeline is the source of truth and won't change much. New auxiliary work goes in `src/stories/` (Python).

## Layout

```
stories/
├── src/stories/                # Python helpers (light)
│   ├── config.py
│   ├── firebase_client.py
│   └── db/check_duplicates.py  # example port from legacy/scripts/db/
├── legacy/                     # existing .mjs pipeline (production)
│   ├── content/                # dailyStory, podcast/, stories/, assets/, etc.
│   ├── scripts/                # db/, seo/, upload-shorts.mjs, etc.
│   └── package.json
├── scripts/
│   └── create-shorts.py        # already Python
├── assets/characters/          # CHARACTERS.md + recurringCharacters.json
├── .claude/skills/             # publish-story, publish-shorts
├── pyproject.toml
├── requirements.txt, requirements-dev.txt
└── README.md
```

## Setup

```bash
cd stories

# Node legacy (the working pipeline)
cd legacy && npm install && cd ..

# Python (helpers)
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pip install -e .
```

Drop `credentials.json` and `token.json` at this folder's root (both gitignored). Copy `.env.example` to `.env`.

## Running

```bash
# Daily story pipeline (legacy Node — production path)
cd legacy && npm run seed-story
node legacy/content/dailyStory.mjs

# Python helpers
python -m stories.db.check_duplicates
python scripts/create-shorts.py "Cinderella"
```

## Skills

`.claude/skills/publish-story/` — full publish pipeline (idea → Spotify → YouTube → Firestore → site).
`.claude/skills/publish-shorts/` — vertical 60s Shorts from existing Kling clips.

Use them by `cd`-ing into this folder so Claude Code resolves them.

## Porting plan

Stable code stays as `.mjs`. Port to Python only when you're touching a script for new work — don't churn working pipelines. Order if porting comes up:

1. `legacy/scripts/db/*.mjs` (small, no external state changes)
2. `legacy/scripts/seo/*.mjs`
3. `legacy/content/stories/seed.mjs` and friends
4. `legacy/content/podcast/*.mjs` (last — large surface area, working well)
