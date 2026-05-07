---
name: Auto-open Suno + lyric files at the song-generation handoff
description: When the produce-episode pipeline reaches the Suno step, automatically open suno.com/create AND open every Suno lyric .md file in the default editor — don't make the user navigate manually.
type: feedback
originSessionId: c368ab61-ad14-44b1-b688-335065572594
---
**Rule:** at the user-handoff #1 step of the produce-episode pipeline (or any time songs need generating), automatically:

1. `open https://suno.com/create` — Suno's create page loads in the user's default browser.
2. `open -t <each lyric .md file>` — every Suno lyric file for the current episode opens in the user's default text editor.

Then list the songs in the chat with their save-as filenames, but the user can immediately switch to Suno and copy-paste from the already-open lyric files. No manual navigation, no `cmd+T` to open suno.com.

**Why:** user explicit feedback (2026-05-04, mid ep11): "open suno songs always". Cuts the per-song friction from ~15s of navigation to zero — meaningful at 1-3 episodes/day cadence and 2-3 songs per episode.

**How to apply:**

In the produce-episode SKILL hand-off block (Phase C → User handoff #1), execute these Bash calls IN PARALLEL with composing the chat message:

```bash
open "https://suno.com/create"
for md in saraandeva/assets/music/lyrics/<song>.md; do
  open -t "$md"
done
```

The `open` command is non-blocking; user gets the browser tab + editor windows immediately while reading the chat instructions.

**Don't:**
- Don't open Suno tabs from a deeper context (e.g. mid-Phase D after submission). The trigger is specifically "songs need generating now."
- Don't open Suno if the episode has zero music-video blocks (rare but possible).
- Don't try to log into Suno or click anything — just open the page; the user is already authenticated.
