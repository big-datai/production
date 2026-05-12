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
| `lesson_kling_phantom_character_from_lock.md` | Every clip prompt — Cast LOCKS scope rule |
| `lesson_kling_api_runbook.md` | Anything API-side |
| `lesson_kling_api_account_segregation.md` | Before mixing UI + API |
| `lesson_audio_swap_cheaper_than_rerender.md` | When user wants different song under same visual |
| `lesson_suno_md_split_style_lyrics.md` | Writing new lyric files |
| `feedback_dont_auto_create.md` + `feedback_summary_mode_default.md` | Every reply (style/scope guard) |

---

## Hard rule — Lint gate on EVERY submit (post-2026-05-07)

**Lint runs as a hard gate inside `kling_pipeline.py phase_submit()` BEFORE any clip is
sent to Kling.** No bypass flag. If `lintEpisode.py --episode N` exits non-zero (any
R1-R16 error), the submit phase aborts immediately with the lint output streamed to
stdout. Fix the spec violation, re-run.

This protects against the ep14 failure where 11 clips with phantom Cast LOCKS were
submitted before R12 existed, costing ~$3 in wasted renders. Also enforced as Phase 0
of `runEpisodePipeline.py` orchestrator.

**Three submission paths, all gated:**
- `python3 kling_pipeline.py submit` (Python, primary) — `lint_gate()` at top of `phase_submit`
- `python3 runEpisodePipeline.py --episode N` (orchestrator) — Phase 0 lint, fail-fast
- `submitOmniClip.mjs` (UI path, legacy) — calls `validateClipCasting.mjs` (rules 8a-8h, older subset)

The `.py` paths run R1-R16; the `.mjs` UI path runs older 8a-8h. Migrating remaining
.mjs callers to Python will close the gap (per `strategy_skill_to_python_migration.md`).

---

## Hard rule — Pattern Z (the working ep01–07 character-reference pattern)

**Three rules for referring to a character in a single prompt:**

| Position | Form | Example |
|----------|------|---------|
| First action mention | `@Char` (tags element) | `"@Sara on the LEFT crouches in front of..."` |
| Dialogue attribution | `Char (tone):` (no @, parenthetical tone, colon, then quoted speech) | `"Sara (whispering): 'There she is!'"` |
| Follow-up actions | **Anonymous body parts** — no character name | `"fingers on lips, eyes wide"` / `"Apologetic head-tilt"` |

**Forbidden:**
- ❌ Re-tagging `@Char` more than once (R4 warn at 3+, error at 5+)
- ❌ Bare-name re-mention in action context (R21) — `"Sara giggles"` after first @Sara spawns phantom Sara
- ❌ Pronouns (`she`/`he`/`her`/`his`) — Kling cannot bind them to a character; treats as ambiguous

**Working ep03 example (Pattern Z):**
> `"@Sara on the LEFT and @Eva on the RIGHT tip-toe in, fingers on lips, eyes wide. @Ginger sits on the lower bunk bed in the center back, paws on top of the chewed-open package, looking guilty. Sara (whispering): 'There she is!' Eva (hands on hips, mock-stern): 'Ginger! What did you do?' Ginger: 'Woof!' Apologetic head-tilt."`

Each character: 1× `@Char` action mention + 1× `Char (tone):` dialogue attribution. Subsequent actions anonymous (`tip-toe in`, `fingers on lips`, `Apologetic head-tilt`).

Lint rules **R4** (@-spam) and **R21** (bare-name action) enforce Pattern Z.

---

## Hard rule — Ideal prompt template (post-2026-05-07 research)

**Empirical research across ep01–ep15** (lesson `lesson_kling_prompt_length_research_2026_05_07.md`):
ep01–02 mean 183 chars rendered clean; ep14 mean 1041 chars produced ghost characters and live-action
drift. Shorter prompts render more faithfully because Kling weights everything in the text — long
prompts dilute the signal.

**The new template (lint-enforced via R13–R16):**

| Element | Rule |
|---------|------|
| Total length | 250–650 chars (warn at 700, error at 1100) |
| Cast LOCKS | NONE unless clip uses a costumed element. Bare `@Char` IS the lock. |
| Shot count | ONE. No `Shot 1 (0-3s)` / `Shot 2 (3-7s)` decomposition. No `Multi-shot` / `split-screen` / `voice off-screen` / `scene cuts to` prose. |
| Timecodes | NONE. Drop `(0-3s)`, `(3-7s)` parentheticals. |
| Transitions | NONE inside one prompt. No `dissolves into`, `clears to reveal`, `cuts to`, `swirls into`. Let assembly add cuts in post. |
| Negative prompt | 12–22 entries. One synonym per concept. |
| CAPS verbs | Only Papa-active rescue clips. |
| Parenthetical costume specs | NONE. The element image carries the costume. |
| Bare names in dialogue | Names of non-subject characters spawn phantom renders. Use pronouns ("she", "your mom") OR add the character to subjects with bound element_id. |
| nativeAudio=true | MUST have either explicit dialogue in `"..."` or a silence directive ("no dialogue, only ambient X"). Otherwise Kling auto-generates unclear mumble. |
| Scene-density triggers | Words like `bustling`, `storefronts framing`, `passersby`, `cafe patrons` spawn ambient extras. For solo/duo shots use `single quiet` / `empty` / `no other people`. |

**Use the new drafting helper** `pipeline/draftClipSpec.py` to enforce the template programmatically:

```bash
python3 pipeline/draftClipSpec.py \
  --episode 14 --clip 3 \
  --subjects Sara,Eva,Papa --scene ep14-anniversary-living-room \
  --title "Story setup" \
  --action "Wide cinematic shot in @ep14-anniversary-living-room. @Sara on the LEFT, curious face. @Eva on the RIGHT, hands cupped under chin. @Papa CENTER, warm smile. Papa: 'Mama and I met TEN years ago...' Eva: 'How did you MEET her, Papa?' Soft golden lamp light."
```

The helper rejects prompts that violate the template (Cast LOCKS, multi-shot, redundant parentheticals).

---

## Hard rule — Cast LOCKS section scope

The first prompt line typically opens with `Cast LOCKS:` followed by per-character anchors
(hair, skin, clothes). **This section MUST list ONLY characters in `subjects[]`.**

❌ **Wrong** (`subjects: [Sara, Eva, Papa]`):
> "Cast LOCKS: @Sara: ..., @Eva: ..., @Papa: ..., **Mama: straight blonde hair, fair skin, sage sweater**."

Even though Mama isn't in `element_list`, Kling reads `Mama: <visual>` as a positive
render instruction and spawns her in the shot. Negative-prompt removal (`mom in scene`)
is unreliable against an explicit visual lock.

✅ **Right** — Cast LOCKS for subjects only; absent characters mentioned by bare name in dialogue:
> "Cast LOCKS: @Sara: ..., @Eva: ..., @Papa: ...
>  Shot 2: @Papa says 'Mama and I met 10 years ago...'"

Lint rule **R12** in `pipeline/lintEpisode.py` hard-fails any phantom Cast LOCK pre-submit.
Lesson: `lesson_kling_phantom_character_from_lock.md`.

---

## Strategic learnings (post-2026-05-11) — YouTube growth + SEO + ads

A long strategic session on 2026-05-11 produced 8 lessons covering channel-level
growth strategy that every future Claude session should read before drafting
episodes or running campaigns. Lessons live in `saraandeva/docs/lessons/`:

| Lesson | Key rule |
|---|---|
| `lesson_title_seo_formula_2026_05.md` | Title format: `[Primary Keyword] [Curiosity Hook] \| Sara and Eva [SEO Descriptor]`. Drop "Ep N" from titles. Episode # stays in description body. Lint **R17, R21** enforce. |
| `lesson_made_for_kids_classifier_triggers.md` | Banned hashtags: `#KidsCartoon` `#CartoonsForKids` `#PreschoolLearning` `#KidsShow`. Banned phrases: "kids' show", "for kids" → use "family" instead. Lint **R19, R23** enforce. |
| `lesson_episode_formula_v2_2026_05.md` | Winning formula: real-life moment + pet mishap + emotional payoff. Required: Papa-active 15s + 2-4 camera-asks. Optimal runtime 4-6 min. |
| `lesson_ad_promotion_policy_2026_05.md` | Ad headlines banned: medal emojis 🥇🥈🥉, ALL CAPS, emoji-at-start. Always set EU political ads = NO. Every episode JSON needs `adSafeTitle` field. |
| `lesson_geo_watch_time_split_strategy_2026_05.md` | Watch-hour campaigns: include India (22.94% conv, 68% of channel hours). Sub-quality campaigns: Tier 1 only (US/UK/CA/AU/IE/NZ). Skip BR/DE/FR/IT/MX/PL/UA/NL/PH. |
| `lesson_funnel_strategy_short_to_main_2026_05.md` | Related Video on NOT-MfK Shorts → main. End-screens hub-and-spoke: everything → ep04. Playlist URL as ad landing = ~90 min watch potential. |
| `lesson_ypp_qualification_path_2026_05.md` | YPP needs 4,000 **valid public long-form** watch hours / 365d. Shorts don't count toward this. Paid promotion validation lag is 30-90 days. |
| `reference_youtube_kids_search_keywords_2026.md` | Top 50 high-volume kid/family search terms with monthly volumes. Source for the [Primary Keyword] in title formula. |

### Quick-reference cards (this skill's `reference/`)

- `reference/reference_title_template.md` — title formula + worked examples + char budget
- `reference/reference_publication_calendar.md` — Wed/Fri/Sun cadence + holiday timing math

### New lint rules (R17-R23 in `pipeline/lintEpisode.py`)

| Rule | Type | Check |
|---|---|---|
| R17 | WARN | Title contains "Ep N" or "Episode N" (suggest keyword-first rewrite) |
| R18 | WARN | Title doesn't start with a high-volume keyword |
| R19 | **ERR** | Description or tags contain banned MfK hashtag |
| R20 | WARN | Description's first 150 chars lack any high-volume keyword |
| R21 | **ERR** | Title exceeds 100 chars |
| R22 | **ERR** | Description doesn't start with the playlist link |
| R23 | WARN | Description contains MfK-classifier phrase ("kids' show", "for kids", etc.) |

### New scripts

- `scripts/_draft_seo_title.py` — takes an episode logline, outputs 3 title variants per formula
- `scripts/_check_video_status.py` — daily MfK reversion monitor across the 8 NOT-MfK videos
