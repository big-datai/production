---
name: Suno song automation gotchas
description: Three load-bearing rules for automating Suno song creation/download via Playwright — virtualized list, auto-titling, hover-Download submenu.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
When automating Suno's Create page (used by `sunoSongs.mjs`), three things that wasted hours during ep08:

1. **Suno's song list is virtualized.** `getByRole("button", { name: /^Play / }).count()` does NOT grow when new songs render — old songs scroll out of viewport, so the count stays the same. Track new songs by **label set diff** (`Set<aria-label>` before vs. after Create) AND **sort by Y position** to find the topmost new entry. Don't use `.nth(0)`/`.first()` for "newest" — DOM order is not always visual order; sort by `getBoundingClientRect().y` instead.

2. **Suno auto-titles from chorus phrasing, not your lyric filename.** A file called `Two Little Tooth Sisters.md` may render as `Tooth-Brave Sisters` or `Tooth Brave Sisters` (Suno extracts the title from a strong chorus phrase). Don't try to match the file's `# Title` line. Match against the unknown-new-label set diff.

**Why:** the user spent multiple test cycles before this was clear. Each false-match download burns Suno credits and time.
**How to apply:** any future Suno automation should snapshot before-Create labels, diff after, sort by Y. The lyric filename is just for the saved `.mp3`'s output name, not a song-title matcher.

3. **Download is a hover-submenu, not a single click.** From the More-options popup, you must `hover` over the `Download` item (NOT click) to expand its submenu, then click `MP3 Audio` (or `WAV`, `Video`, etc.). Direct `getByRole("button", { name: "MP3 Audio" }).click()` without the hover step times out — the submenu never renders.

**Why:** wasted ~15 min on direct-click attempts.
**How to apply:** the canonical sequence is `More options click → Download hover → MP3 Audio click → waitForEvent("download")`. Bake this exact pattern into any new Suno script.

4. **Don't run sunoSongs.mjs `--all` for multiple songs at once.** ep09 confirmed: first song downloaded fine, second song crashed with `waitForEvent("download")` 30s timeout — the post-create UI state isn't reliable across consecutive runs in the same session. Manual download (paste lyrics → Create → wait → click More options → hover Download → MP3 Audio) takes the SAME ~3 min per song with 100% success vs ~50% for the script.

**Why (ep09):** burned 5 min on the script, then user manually generated all 3 songs in ~10 min anyway.
**How to apply:** for now, recommend manual Suno generation in the planning skill's hand-off report. Don't automate it. If `sunoSongs.mjs --all` is needed long-term, add explicit page-state reset between songs (full reload + nav back to /create) and a longer wait for the song row to render, OR run one song at a time as separate process invocations.
