# saraandeva

Production pipeline for the **SaraAndEva** flagship YouTube series.

Status: **new project**, active development. Python is the primary language going forward; existing `.mjs` Playwright scripts (Kling Omni submission) stay until ported.

## What's here

```
saraandeva/
├── src/saraandeva/             # Python — primary
│   ├── config.py               # env + paths
│   └── firebase_client.py      # firebase-admin init
├── content/                    # working pipeline code (mixed .mjs / .py / .yaml)
│   ├── episodes/               # episode spec JSONs
│   ├── characterRegistry.js    # cast registry
│   ├── seriesStyle.{js,py}     # show style guide
│   ├── locationCatalog.yaml    # scene library
│   ├── photoLabels.yaml        # face labels for reference photos
│   ├── generateFamilyAvatars.py
│   ├── generateScenes.py
│   ├── prepReferences.py
│   └── *.mjs                   # Kling Playwright scripts (record/upload/download)
├── assets/                     # reference media (gitignored — live on disk)
│   ├── characters/             # bound character images for Kling library
│   ├── photos/                 # source family photos
│   └── scenes/                 # scene reference PNGs
├── .claude/skills/saraandeva-episode/   # Claude skill for episode production
├── pyproject.toml
├── requirements.txt
├── requirements-dev.txt
├── package.json                # for the .mjs Playwright scripts
└── README.md
```

## Setup

```bash
cd saraandeva

# Python (primary)
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pip install -e .
playwright install chromium

# Node (Playwright .mjs helpers — until ported)
npm install
```

Drop `credentials.json` and `token.json` at this folder's root (both gitignored). Copy `.env.example` to `.env`.

## Kling Omni mode

Episode 3+ uses Kling Omni mode (up to 7 bound elements, 10s default clips).
The mechanics, library hygiene rules, and submission flow live in the skill at `.claude/skills/saraandeva-episode/`.

## Why "new project" matters

The Single-Shot constraints from Eps 1–2 are obsolete. The codebase is being rebuilt around Omni. Old `.mjs` scripts (downloadKlingClips.mjs, submitKlingClip.mjs, etc.) are kept for back-compat but new work goes into `src/saraandeva/` in Python.
