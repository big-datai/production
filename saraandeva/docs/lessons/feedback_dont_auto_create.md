---
name: Don't auto-create or overwrite without explicit ask
description: User flagged 2026-05-07 mid ep12 fix — "why are you creating episodes/clips without me asking, you overwrite too much stuff, I'm not able to follow." Stop being too autonomous. Don't write new clip JSONs, lyric files, episode plans, or scripts unless the user explicitly asked for that specific artifact. Don't overwrite plan files, specs, or scripts mid-stream without asking. When in doubt — pause and confirm scope. Auto-mode permits cheap routine work (e.g. parsing a download), not new asset creation. Always tight chat, save context to memory or plan files instead of dumping in-thread.
type: feedback
severity: hard-rule
appliedTo: all sessions for this project
originSessionId: b923ac34-5ab5-423b-b230-8d3dc1dc3937
---
# Hard rule

User can't follow when too many edits land at once. Pause + confirm scope before:
- Creating new clip / episode / lyric / song specs
- Overwriting existing scripts, specs, or plan files
- Spawning multi-clip parallel renders
- Adding workflow steps not explicitly requested

What's OK without asking: parsing inputs, sanity-running tools the user just authorized, writing the per-step output of the immediate task. Reading + reporting findings.

What's NOT OK: extrapolating from "fix X" to also fix Y and Z, regenerating files the user didn't mention, batch-creating new content.
