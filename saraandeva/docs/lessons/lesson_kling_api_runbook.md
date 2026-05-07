---
name: Kling API submission runbook — pick this path when API-side work is needed
description: Canonical workflow for submitting a clip via the Kling AK/SK API instead of the kling.ai web UI. Reusable across sessions — all moving parts now persisted in the saraandeva project (`/tmp` ad-hoc scripts deprecated). Two-script pipeline: `createElementViaApi.mjs` (one-time per character/scene) → `submitOmniViaApi.mjs` (per clip). Both read `content/elements_registry.json` for the {name → element_id} map. Cost ~$0.60/10s std clip. Account segregated from UI per `lesson_kling_api_account_segregation.md` — pick one path per episode.
type: lesson
severity: hard-rule
appliedTo: any per-clip API submission, especially fixes / re-renders / new-element creation
originSessionId: b923ac34-5ab5-423b-b230-8d3dc1dc3937
---
# When to use API path vs UI

| Need | Path |
|---|---|
| Full episode submission, first cut | UI (`submitEpisode.mjs`, Phase D in produce-episode SKILL) |
| Per-clip fix or re-render | **API** (this runbook) |
| New character/scene element creation | **API** (faster than UI drag-drop, no manual stalls) |
| API quota exhausted / saving credits | UI |

# Required prereqs

- `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` in `/Volumes/Samsung500/goreadling-production/.env.local`
- `content/elements_registry.json` exists (created 2026-05-07 with Joe/jo_beach/Sara/Eva/Papa)
- GCS bucket `gs://saraandeva-kling-elements` for hosting images (public-read)
- Memory: `lesson_kling_api_account_segregation.md` (the segregation rule), `lesson_kling_papa_active_prompt_template.md` (the prompt structure that works)

# One-time: create a new element

```bash
cd /Volumes/Samsung500/goreadling-production/saraandeva
gcloud storage cp --cache-control="public, max-age=31536000" \
  assets/characters/<name>_front.png \
  gs://saraandeva-kling-elements/characters/

node .claude/skills/saraandeva-episode/scripts/createElementViaApi.mjs \
  --name "<Name>" \
  --description "<= 100 chars description" \
  --frontal https://storage.googleapis.com/saraandeva-kling-elements/characters/<name>_front.png \
  --refer https://storage.googleapis.com/saraandeva-kling-elements/characters/<name>_3q.png \
  --refer https://storage.googleapis.com/saraandeva-kling-elements/characters/<name>_profile.png \
  --tag o_102
```

Tag IDs: `o_101` Hottest, `o_102` Character, `o_103` Animal, `o_104` Item, `o_105` Costume, `o_106` Scene, `o_107` Effect, `o_108` Others.

The script appends the `element_id` to `content/elements_registry.json` automatically. Element creation costs 0 units (free against quota).

**Critical quirk:** Kling rejects `refer_images: []`. Always pass at least one `--refer`. If you only have one image, pass it as both `--frontal` and `--refer` (same URL twice) — the script handles this fallback.

# Per-clip: submit a clip via Omni

```bash
# 1. Generate the group still via Nano Banana
python3 content/generateGroupShot.py ep<NN>_clip<MM>_<beat> \
  --chars papa,sara,eva \
  --pose "<see lesson_kling_papa_active_prompt_template.md>" \
  --scene <scene_id>

# 2. Upload the still to GCS
gcloud storage cp --cache-control="public, max-age=31536000" \
  assets/scenes/group_ep<NN>_clip<MM>_<beat>.png \
  gs://saraandeva-kling-elements/scenes/

# 3. Save prompt + negative to files (so they're audit-able later)
mkdir -p content/episodes/ep<NN>/prompts
# write prompt to content/episodes/ep<NN>/prompts/clip<MM>.txt
# write negative to content/episodes/ep<NN>/prompts/clip<MM>.neg.txt

# 4. Submit
node .claude/skills/saraandeva-episode/scripts/submitOmniViaApi.mjs \
  --anchor https://storage.googleapis.com/saraandeva-kling-elements/scenes/group_ep<NN>_clip<MM>_<beat>.png \
  --elements Papa,Sara,Eva \
  --prompt-file content/episodes/ep<NN>/prompts/clip<MM>.txt \
  --negative-file content/episodes/ep<NN>/prompts/clip<MM>.neg.txt \
  --duration 10 --mode std --aspect-ratio 16:9 \
  --external-id ep<NN>-clip<MM>-1 \
  --out season_01/episode_<NN>/clips/<MM>.mp4

# 5. Audit the result before declaring done
node .claude/skills/saraandeva-episode/scripts/auditClipsWithGemini.mjs \
  /tmp/single_clip_dir   # copy the new mp4 there first
```

Cost: 6 units = $0.60 per 10s std (16:9, 720p). Pro mode roughly 2x. 4k roughly 5x. Wall time: 4-6 min per render.

# Element ordering matters

Pass elements in the order they're referenced in the prompt:

```
--elements Papa,Sara,Eva
```

Maps to:
- `<<<element_1>>>` = Papa
- `<<<element_2>>>` = Sara
- `<<<element_3>>>` = Eva

Re-ordering = different render. The Papa-active template uses element_1 = the lead character (whoever has the most body-part-verbs in caps).

# Server-side history

Every API submission persists for 30 days on Kling's side. To pull recent tasks:

```bash
node .claude/skills/saraandeva-episode/scripts/sunoDownloadLatest.mjs --list
# (this is for Suno — for Kling, see /tmp/kling_list_videos.py for now;
#  port to skill is a TODO)
```

# Don't do

- Hardcoded per-clip submitter scripts in `/tmp` — these don't survive a session restart. Use `submitOmniViaApi.mjs` with arguments instead.
- Mix UI + API in the same episode — segregation means the assembly will see only half the clips.
- Skip the post-render audit (`auditClipsWithGemini.mjs`) — Kling renders need visual QC every time.
