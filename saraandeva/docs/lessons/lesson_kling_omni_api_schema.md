---
name: Kling Omni API submission schema (the EXACT field names + prompt syntax)
description: Cracked 2026-05-07 after burning ~$8 on broken renders. The official kling-v3-omni POST body uses element_list/image_list (NOT elements/image_urls), and prompts must reference characters as <<<element_1>>>, <<<element_2>>> by INDEX (NOT @Sara, NOT @Element1). Wrong field names + wrong syntax = Kling silently ignores the bind and renders generic from text only. Use the working schema canonized below.
type: lesson
severity: hard-rule
appliedTo: any direct Kling API submission for video generation
originSessionId: 2026-05-07-ep15
---

# tl;dr — the working POST body

```json
POST https://api-singapore.klingai.com/v1/videos/omni-video
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "model_name": "kling-v3-omni",
  "mode": "std",                    // std | pro | 4k
  "aspect_ratio": "16:9",           // 16:9 | 9:16 | 1:1
  "duration": 10,                   // INTEGER seconds, NOT string
  "external_task_id": "ep15-clip1-1",
  "prompt": "Required even with multi_prompt. Top-level summary.",
  "negative_prompt": "duplicate character, ghost, off-model...",
  "image_list": [{"image_url": "https://storage.googleapis.com/.../anchor.png"}],
  "element_list": [
    {"element_id": 310094133206523},  // <<<element_1>>>
    {"element_id": 310093803059503},  // <<<element_2>>>
    {"element_id": 310094139106317}   // <<<element_3>>>
  ],
  "multi_prompt": [                 // optional: per-shot prompts
    {"prompt": "Shot text", "duration": 3},
    {"prompt": "Shot text", "duration": 4},
    {"prompt": "Shot text", "duration": 3}
  ]
}
```

**Inside the prompt text**, reference characters with **`<<<element_1>>>`**, **`<<<element_2>>>`**, etc. — by index in the `element_list` array, lowercase, triple-angle, underscore.

# Things that DO NOT work — Kling silently ignores them and renders generic

| What I tried (wrong) | What Kling expects |
|---|---|
| `elements: [{frontal_image_url, reference_image_urls}]` | `element_list: [{element_id: <int>}]` (pre-create elements first) |
| `image_urls: [...]` | `image_list: [{"image_url": "..."}]` |
| `element_id: [310086..., 310086...]` | `element_list: [{element_id: 310086...}]` |
| Prompt: `@Sara opens the door` | Prompt: `<<<element_1>>> opens the door` |
| Prompt: `@Element1` (capital E, no underscore) | Prompt: `<<<element_1>>>` (lowercase, underscore) |
| Top-level `prompt` omitted when multi_prompt present | `prompt` REQUIRED even with multi_prompt |

When the schema is wrong, the API still returns `code:0 SUCCEED`, the task renders, and you get billed — but Kling silently rendered generic chars from prompt-text descriptions only. The element bindings were attached to the request but never resolved because the prompt didn't reference them in the right syntax.

# Element creation (one-time per character/scene)

```json
POST /v1/general/advanced-custom-elements
{
  "element_name": "ep15_Sara",                 // ≤ 20 chars
  "element_description": "7yo girl, fair skin, dark-blonde wavy hair.",  // ≤ 100 chars
  "reference_type": "image_refer",             // exact value
  "element_image_list": {
    "frontal_image": "https://.../sara_front.png",  // singular, REQUIRED
    "refer_images": [                           // 1-3 entries, each {image_url}
      {"image_url": "https://.../sara_3q.png"},
      {"image_url": "https://.../sara_profile.png"}
    ]
  },
  "tag_list": [{"tag_id": "o_102"}],            // o_102=Character, o_103=Animal, o_106=Scene
  "external_task_id": "ep15-sara-1"
}
```

Returns `task_id` immediately. Poll `/v1/general/advanced-custom-elements/{task_id}` until `task_status === "succeed"`, then read `task_result.elements[0].element_id`. Element creation is FREE (deduction=0u).

**Critical quirks on element creation:**
- `refer_images: []` is REJECTED — must have ≥1 entry. If you only have the frontal image, pass it as both `frontal_image` and once in `refer_images`.
- `element_name` > 20 chars rejected (1201). Use `ep15_Sara` not `ep15_Sara_Halloween_Princess`.
- `element_description` > 100 chars rejected (1201). Trim aggressively.
- `reference_type: "image"` is rejected — must be exactly `"image_refer"`.
- `frontal_image` at the top level (not nested) is rejected — must be inside `element_image_list`.

# How to use — the canonical scripts in this repo

```bash
# Project root
cd /Volumes/Samsung500/goreadling-production/saraandeva

# 1. Create element (free, ~10s)
node .claude/skills/saraandeva-episode/scripts/createElementViaApi.mjs \
  --name "ep15_Sara" \
  --description "7yo girl, fair skin, wavy dark-blonde hair, brown eyes." \
  --frontal "https://storage.googleapis.com/saraandeva-kling-elements/ep15/Sara.png" \
  --refer "https://storage.googleapis.com/saraandeva-kling-elements/ep15/sara_3q.png" \
  --refer "https://storage.googleapis.com/saraandeva-kling-elements/ep15/sara_profile.png" \
  --tag o_102

# auto-appends to content/elements_registry.json

# 2. Submit clip ($0.60 for 10s std)
node .claude/skills/saraandeva-episode/scripts/submitOmniViaApi.mjs \
  --anchor "https://.../scenes/group_ep15_clip1.png" \
  --elements "ep15_Sara,ep15_Eva,ep15_Mama" \
  --prompt-file content/episodes/ep15/prompts/clip1.txt \
  --negative-file content/episodes/ep15/prompts/clip1.neg.txt \
  --duration 10 --mode std --aspect-ratio 16:9 \
  --external-id ep15-clip1-1 \
  --out content/episodes/ep15/clips/clip_1.mp4

# In the prompt-file, reference characters as <<<element_1>>>, <<<element_2>>>, <<<element_3>>>
# in the order they're passed via --elements
```

# Empirical caps + quirks

- **Per-shot prompt** in `multi_prompt[].prompt` ≤ **512 characters** (1201 if over).
- **Top-level prompt** required even with `multi_prompt` (1201 if missing).
- **`duration`** is an integer (10), not string ("10"). Old morning code submitted as string and it worked, so both may be accepted, but integer is the documented form.
- **Parallel task cap**: ~5 concurrent. 6th submission returns 429 "parallel task over resource pack limit" — wait for one to land before retrying.
- **No cancel endpoint** exists. Tried POST /omni-video/{id}/cancel, DELETE /omni-video/{id}, POST /videos/cancel — all 404. A submitted task either succeeds (bills) or fails (no charge).
- **Slow tasks**: single-prompt 5-element 10s = 85s. **`multi_prompt` is BROKEN** on this account (verified 2026-05-07): it processes 35+ min and returns off-model garbage that ignores `element_list` bindings. Each shot is rendered from text only, no element resolution. **HARD RULE: do not use `multi_prompt`** until kling.ai fixes it. See `lesson_kling_multi_character_drift.md`.
- **Cost rates** confirmed 2026-05-07: `kling-v3-omni std` = 0.6 units/sec. 5s = 3u. 10s = 6u. 15s = 9u. At trial pack rate ($0.10/unit) that's $0.30/$0.60/$0.90 per clip.

# How to verify a submission actually used the elements

The GET response on `/v1/videos/omni-video/{task_id}` does **not** echo back the request body. So you can't confirm `element_list` was honored from the API alone. Verify visually:

1. Render a single-character test clip (1 element) with the canonical avatar.
2. Extract a frame, compare to the canonical PNG.
3. If on-model → schema accepted. If generic → wrong schema OR wrong prompt syntax.

The 2026-05-07 ep15_Eva-only test (prompt: `<<<element_1>>> is a 3-year-old toddler with fair porcelain skin and voluminous curly bright-blonde hair...`) rendered 100/100 canon match — that's the proven baseline.

# When this lesson saves money

This session burned ~$7.80 on 11 broken `element_id` + `@Element1` renders before discovering the working schema in the user's `/tmp/kling_omni_*.py` scripts. A new session starting from this lesson skips that cost entirely.

# Sources of truth (external)

- https://docs.magnific.com/api-reference/video/kling-v3-omni/overview (formerly docs.freepik.com)
- https://app.klingai.com/global/quickstart/klingai-video-3-omni-model-user-guide
- The working morning scripts at `/tmp/kling_omni_*.py` (now consolidated into the skill — see `lesson_kling_api_runbook.md`)
