# goreadling-production

Content production pipelines for [GoReadling](https://goreadling.com).

The web/mobile app lives in a separate repo. This repo contains **two fully separated content projects**:

| Project | What it does | Status | Primary language |
|---------|--------------|--------|------------------|
| [`stories/`](./stories) | Daily story → multi-voice podcast → Kling video → YouTube/Spotify/Firestore publish | Stable, won't change much | Node.js (legacy) + light Python helpers |
| [`saraandeva/`](./saraandeva) | SaraAndEva flagship YouTube series — Kling Omni clip submission, episode assembly | New project, active development | Python (target 70%) + some Node.js |

Each project is self-contained: its own `pyproject.toml`, `requirements.txt`, `package.json`, `.claude/skills/`, credentials, and `.env`. They share git history and `.gitignore`, nothing else.

## Working in a project

```bash
cd stories      # or: cd saraandeva
# All commands, scripts, skills, and config are scoped to that folder.
```

Claude Code skills are per-project — they only resolve when your shell is inside that project's folder.

## Layout

```
goreadling-production/
├── stories/
│   ├── legacy/                 # existing .mjs pipeline
│   ├── src/stories/            # Python helpers
│   ├── scripts/                # python utilities (create-shorts.py)
│   ├── assets/characters/      # general-stories character config
│   ├── .claude/skills/         # publish-story, publish-shorts
│   ├── pyproject.toml, requirements.txt, package.json
│   └── README.md
├── saraandeva/
│   ├── content/                # working .mjs + .py + .yaml + episode JSONs
│   ├── src/saraandeva/         # Python (primary)
│   ├── assets/                 # character/scene reference images (gitignored)
│   ├── .claude/skills/         # saraandeva-episode
│   ├── pyproject.toml, requirements.txt, package.json
│   └── README.md
├── .gitignore
└── README.md
```

## Secrets

Each project keeps its own `credentials.json` and `token.json` at its root. Both are gitignored.
Copy your service account JSONs into place before running anything.
