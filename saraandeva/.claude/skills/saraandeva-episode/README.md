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

---

## Canonical scripts catalog (2026-05-07)

### Kling — UI path (Phase D in produce-episode SKILL)
- `submitEpisode.mjs` — orchestrator: validateClipCasting → addMissingElements → submitOmniClip per clip
- `submitOmniClip.mjs` — Playwright-driven Kling UI submission
- `validateClipCasting.mjs` — Phase 0 lint (lint rules 8a–8h)
- `downloadOmniByPrompt.mjs` — IndexedDB scrape + prompt-similarity match → mp4 per clip

### Kling — API path (Phase D-alt in produce-episode SKILL — NEW 2026-05-07)
- `createElementViaApi.mjs` — one-time per character/scene; appends element_id to `content/elements_registry.json`
- `submitOmniViaApi.mjs` — POST /v1/videos/omni-video → poll → download. Reads `content/elements_registry.json` for element name lookups.
- Memory runbook: `lesson_kling_api_runbook.md`. Account segregation: `lesson_kling_api_account_segregation.md`. Costs: `lesson_kling_api_cost_rates.md`. Don't mix UI + API in the same episode.

### Visual QA (mandatory before any "ready" claim — Phase 3.5)
- `auditClipsWithGemini.mjs` — Gemini 2.5 Flash full-video audit, ~$0.002/clip. Memory: `lesson_claude_visual_audit_before_ready.md`.
- `reviewPromptWithGemini.mjs` — Gemini 3 Pro prompt sanity check (advisory).

### Music
- `loopVideoWithSong.mjs` — loop a 10s base render N× with crossfade under a song → 60s music block
- `sunoSongs.mjs` — submit lyric `.md` to Suno + auto-download (UI path; flaky due to modal overlay)
- `sunoDownloadLatest.mjs` — list / download via Suno studio-api feed v3 + Clerk JWT (recommended). Memory: `lesson_suno_studio_api_v3.md`. Lyric `.md` format: `lesson_suno_md_split_style_lyrics.md`.

### Assembly + delivery (Phase E)
- `assembleEpisode.mjs` — concat normalized clips with intro/outro
- `generateThumbnail.mjs`, `generateShort.mjs`
- `uploadEpisodeToSaraAndEva.mjs` — YouTube upload UNLISTED by default
- `validateEpisode.mjs`

### Misc
- `addMissingElements.mjs`, `assembleEpisode.mjs`, `addVideoToPlaylist.mjs`
- Underscored `_*.mjs` files = one-off codegen / probes; not part of canonical pipeline

---

## Committed lessons snapshot

All memory files are also committed to the repo at `saraandeva/docs/lessons/`. Read `docs/lessons/INDEX.md` for the full one-liner catalog. Use that path on a fresh machine / new contributor — it's the source of truth.

## Key references (do not skip when starting any clip work)

| Memory file | When |
|---|---|
| `lesson_kling_papa_active_prompt_template.md` | Every Papa-active or active-multi-beat clip prompt |
| `lesson_claude_visual_audit_before_ready.md` | Before any "ready" claim |
| `lesson_kling_api_runbook.md` | Anything API-side |
| `lesson_kling_api_account_segregation.md` | Before mixing UI + API |
| `lesson_audio_swap_cheaper_than_rerender.md` | When user wants different song under same visual |
| `lesson_suno_md_split_style_lyrics.md` | Writing new lyric files |
| `feedback_dont_auto_create.md` + `feedback_summary_mode_default.md` | Every reply (style/scope guard) |
