# saraandeva-episode/scripts/ — production tool library

This directory is a **script library, not a skill**. Its old SKILL.md
(based on the obsolete single-shot 5s formula) was retired post-ep10.

The canonical skill is now at:

    /Volumes/Samsung500/goreadling-production/.claude/skills/produce-episode/SKILL.md

That orchestrator skill calls the scripts here. The two top-level
orchestrator scripts — `submitEpisode.mjs` and `produceEpisode.mjs` —
chain everything else.

Layout:
- `scripts/` — production scripts (submit, download, assemble,
  validate, generate thumbnail/short, upload). Untouchable PROJECT_ROOT
  path math relative to this dir; don't move.
- `reference/` — historical codegen samples for posterity.
