---
name: submitEpisode + downloadOmniByPrompt schemas — handle letter-clip music videos
description: ep09 silently skipped clip B (Mama heart slow-mo) on submit AND download because both scripts only handled numeric clip IDs. Fixed by also iterating ep.musicVideos and accepting string clip values.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
ep09 surfaced two latent bugs in the orchestration scripts:

1. **`submitEpisode.mjs`** loaded `ep.clips[]` only, never `ep.musicVideos[]`. So `--include-music --only=B` silently filtered to nothing — the loop never knew B existed. **Fixed**: loader now iterates BOTH arrays + the per-clip dir version accepts `[A-Z].json` filenames.

2. **`downloadOmniByPrompt.mjs`** type-checked `typeof spec.clip === "number"` and skipped letter-clip specs (B.json has `clip: "B"`). The script silently dropped them with a "missing clip/prompt" warning. **Fixed**: accepts `number | string` clip values; outputs `<clip>.mp4` (so `B.mp4` works).

**How to apply:** any future loader/iterator over the consolidated episode JSON should be aware:
- `clips[]` = numeric clips (1-N)
- `musicVideos[]` = letter-named music-video specs (A, B, C — `clip` field is a STRING)
- Per-clip directory has both `<n>.json` and `<letter>.json` files

If you write a NEW orchestrator script (e.g. `releaseEpisode.mjs`), copy the loader from the patched `submitEpisode.mjs` rather than rolling your own — it's the canonical version.

## ep11 follow-up — DECIMAL clip support + stale consolidated-json gotcha

3. **Decimal clip files (e.g. `4.5.json`, `15.7.json`)** silently skipped by `submitEpisode.mjs` regex. The auto-consolidate + per-clip-file scanners both used `/^(\d+|[A-Z])\.json$/` which rejected decimal filenames. **Fixed (post-ep11)**: regex now `/^(\d+(\.\d+)?|[A-Z])\.json$/` in both places. `validateClipCasting.mjs` was already decimal-aware; only `submitEpisode.mjs` needed patching. `downloadOmniByPrompt.mjs` already correct.

4. **Stale `content/episodes/ep<NN>.json` (consolidated)** — if a consolidated json was auto-written on a previous run, `submitEpisode.mjs` reads from THAT instead of re-scanning the dir. Adding a new clip file (e.g. `4.5.json`) will be silently invisible until you `rm content/episodes/ep<NN>.json` so the next run rebuilds it. **Workaround for now:** when you add a new mid-episode clip, delete the consolidated json first. **Better fix (TODO):** `submitEpisode.mjs` should re-consolidate when the dir mtime is newer than the consolidated file, or just always re-consolidate when both exist.
