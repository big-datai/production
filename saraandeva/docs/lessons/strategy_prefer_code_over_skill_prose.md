---
name: Strategy — replace skill prose with code wherever possible
description: User feedback 2026-05-07: "create as much code replacement of skill as possible — code is more consistent." Skill prose drifts every re-read; agents interpret it differently. Code locks behavior. Going forward, every checkable rule, decision tree, or formatted output should live in a script in `saraandeva/.claude/skills/saraandeva-episode/scripts/` (or wrapped Python under `content/`), not as prose in a SKILL.md. Skills become thin orchestrators that chain scripts. New gap = new script, not a new prose section.
type: strategy
severity: hard-rule
appliedTo: every workflow change, every memory update, every "should I add to the skill or write a script?" decision
---

# The principle

**Code is contract; prose is suggestion.** Anything that's "the agent should…" or "follow this rule when…" is a candidate for code. Skill prose is for non-deterministic orchestration only.

# What's already code (keep + extend)

- Asset generation: `generateScenes.py`, `generateGroupShot.py`, `generateFamilyAvatars.py`
- Kling API: `submitOmniViaApi.mjs`, `createElementViaApi.mjs`, `listKlingViaApi.mjs`, `kling_ep15_pipeline.mjs`
- Audit: `auditClipsWithGemini.mjs`, `reviewPromptWithGemini.mjs`
- Music: `loopVideoWithSong.mjs`, `sunoSongs.mjs`, `sunoDownloadLatest.mjs`
- Assembly: `assembleEpisode.mjs`, `normalizeClipFilenames.mjs`, `generateThumbnail.mjs`, `generateShort.mjs`, `validateEpisode.mjs`, `validateClipCasting.mjs`
- Upload: `uploadEpisodeToSaraAndEva.mjs`, `_updateYoutubeMetadata.mjs`
- Bulk fixes: `_bulk_inject_costume_locks.mjs`

# What's still skill prose (TARGET FOR REPLACEMENT)

| Skill prose | Replacement script (target) |
|---|---|
| `saraandeva-episode-from-prompt/SKILL.md` (Phase A spec drafting, ~600 lines) | `draftEpisodeSpec.mjs <paragraph> <epNN>` — calls Anthropic API with the rules baked in, emits episode.json + N clip JSONs that already pass `validateClipCasting.mjs` |
| Pattern A/B/C/D/E binding decision tree | `pickBindingPattern.mjs` — takes clip subjects + scene + props, returns one of A/B/C/D/E + recommended boundElements |
| The ~40 hard rules from memory (papa-active, audience-asks, no-red-liquid, comedy-intensity, costume-lock, 2500-char, @-ref-expansion, motion-toward verbs, group-nouns, sister visual collision, etc.) | `lintEpisode.mjs --episode NN` — runs ALL rules across episode.json + every clip JSON, exits non-zero on any violation |
| Audit-driven decision: which clips to re-submit | `autoFixDefects.mjs --audit content/episodes/ep15/audit_v1.json` — reads Gemini findings, applies prompt-tightening heuristics per defect type (character_passive → add body-part verbs; visual_clone → distinct anchors; scene_mismatch → split into two clips), auto-resubmits |
| Cost tracking ("are we over budget?") | `trackEpisodeBudget.mjs` — polls `/account/costs` + reads pipeline state, projects total cost, alerts >2200u |
| Suno song submission (still partial UI) | `submitSunoSong.mjs` — finish what `sunoSongs.mjs` started; full-API path once we sniff Suno's submit endpoint (download is already API per `lesson_suno_studio_api_v3.md`) |

# When to keep skill prose

Only the orchestrator narrative — *"phase A invokes draftEpisodeSpec, then phase B runs generateScenes…"* — is OK in `produce-episode/SKILL.md`. The orchestrator is one process per episode, branches by user input, and is hard to express as code without losing flexibility. Everything *inside* a phase should be a script.

# Migration order (highest-leverage first)

1. **`lintEpisode.mjs`** — biggest leverage; catches all known failure modes pre-submission. Saves ~$5-15/episode in re-renders. Rules sourced from `docs/lessons/*.md`.
2. **`draftEpisodeSpec.mjs`** — eliminates the ~30 min spec-drafting variance per episode. Single source of truth for Phase A.
3. **`autoFixDefects.mjs`** — closes the audit→resubmit loop. Currently me reading audit JSON + manually trimming prompts.
4. **`trackEpisodeBudget.mjs`** — cheap to write, prevents surprise overspend.

# Anti-patterns to avoid

- ❌ "I'll add a section to the SKILL.md describing how to do X." → write a script.
- ❌ "Memory file says: when you encounter <situation>, apply <transformation>." → that transformation belongs in a script the agent calls.
- ❌ Cross-referencing 5 memory files mid-decision. → one script that loads them all and decides.

# Caveat

Replacing prose with scripts is a one-way ratchet. Once a script exists, agents stop reading the prose for that decision. So when a script's heuristics need updating, the script is the single edit point — not 4 memory files. Keep scripts small + commented + linked to the memory file that justifies their rules.
