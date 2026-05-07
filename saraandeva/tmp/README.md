# saraandeva/tmp — project-local scratch space

This directory replaces the OS `/tmp` for ALL scratch work in the saraandeva
pipeline. Anything that previously went to `/tmp/` goes here now so it
survives session restarts and stays inside the project tree.

What goes here:
- Rendered mp4 outputs from one-off API submissions (before they're moved to `season_01/episode_NN/clips/`)
- Audit JSON dumps from `auditClipsWithGemini.mjs`
- Frame extracts and contact sheets
- Downloaded Suno mp3s waiting to be renamed and dropped into `assets/music/`
- Any other ephemeral binary output

What does NOT go here:
- Code (scripts, .mjs, .py) — those go to `.claude/skills/saraandeva-episode/scripts/`
- Specs / prompts / lyrics — those go to `content/episodes/ep<NN>/` or `assets/music/lyrics/`
- Lessons — those go to `docs/lessons/`

This directory is git-ignored. Files here aren't tracked, but the directory
itself stays via `.gitkeep`.
