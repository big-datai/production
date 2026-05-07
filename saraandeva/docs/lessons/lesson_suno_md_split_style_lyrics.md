---
name: Suno lyric .md format — LYRICS first then GENRE, GENRE ≤ 1000 chars
description: Suno's style/genre input has a ~1000-char cap; the lyrics box does not. Lyric `.md` files in `assets/music/lyrics/` use exactly two H1 sections — `# LYRICS` first (unlimited body, pasted into Suno's lyrics box), then `# GENRE` (≤ 1000 chars, pasted into Suno's style box). Nothing else in the file. `sunoSongs.mjs` parses those sections by heading and fills both Suno fields automatically; hard-fails if GENRE > 1000 chars. Older lyric files without the new headings fall back to the legacy "everything after `originSessionId: b923ac34-5ab5-423b-b230-8d3dc1dc3937
---
` is lyrics" behavior.
type: lesson
severity: hard-rule
appliedTo: every new song lyric file + sunoSongs.mjs
---

# The format

```
# LYRICS

[Verse 1 — Sara]
...

[Chorus — both]
...

# GENRE

Kids' adventure pop, ~118 BPM, hopeful, two girl voices, acoustic guitar + tambourine. ~60s.
```

Rules:
- LYRICS section: any length, any structure (bracketed beat tags, [Verse]/[Chorus] markers fine)
- GENRE section: tight prose, ≤ 1000 chars. Style + tempo + voices + instrumentation + length target
- No other sections / metadata / tables in the file

`sunoSongs.mjs` will refuse files with GENRE > 1000 chars (script throws with the offending count).
