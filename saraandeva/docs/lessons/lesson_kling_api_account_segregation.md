---
name: Kling API ↔ UI account segregation (bidirectional) + element CRUD endpoints
description: Kling AI fully segregates UI vs API accounts in BOTH directions. UI-submitted tasks/elements are not visible to AK/SK API; API-created elements are not visible to UI. Confirmed empirically 2026-05-05 (UI→API) and 2026-05-06 (API→UI). Element CRUD IS exposed on the API at `/v1/general/advanced-custom-elements` (the prior memory said otherwise — that was wrong, we just probed the wrong path). Includes the refer_images 1-3 quirk and the GCS bucket hosting setup.
type: lesson
severity: hard-rule
appliedTo: produce-episode pipeline + future API migration planning
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---

# Kling API ≠ UI account (bidirectional)

The API account and UI account are completely separate task + element pools. Same billing portal, but the data behind each interface is isolated. Confirmed in BOTH directions:

| Direction | When tested | Result |
|---|---|---|
| UI tasks → visible via API list endpoints? | 2026-05-05 (9 ep12 UI submissions) | **No.** All `/v1/videos/{mode}` endpoints returned `data:[]` |
| UI elements → visible via API element list? | 2026-05-05 | **No.** `/v1/general/advanced-custom-elements` returned 0 envelopes despite 20+ UI elements existing |
| API elements → visible in UI library? | 2026-05-06 (created `Joe` + `jo_beach` via API) | **No.** Both elements present in API list with valid `element_id`s, but absent from the UI's "My Elements" panel |
| API tasks → visible in UI history? | not tested, but assume same pattern | n/a |

**Practical implication:** you cannot mix UI and API for the same workflow. Either fully UI (current pipeline) or fully API (future migration). API-created elements are useless if you submit video gen via UI, and vice-versa.

## JWT auth (works against api-singapore.klingai.com)

```js
const now = Math.floor(Date.now() / 1000);
const header  = { alg: "HS256", typ: "JWT" };
const payload = { iss: ACCESS_KEY, exp: now + 1800, nbf: now - 5 };
// HS256-sign (b64url-header).(b64url-payload) with SECRET_KEY
// Send as: Authorization: Bearer <token>
```

## Confirmed working endpoints (2026-05-06)

| Method | Path | What it does |
|---|---|---|
| GET | `/v1/videos/text2video?pageNum=1&pageSize=N` | List API t2v tasks |
| GET | `/v1/videos/image2video` | List API i2v tasks |
| GET | `/v1/videos/multi-image2video` | **Omni mode list** (this is what Omni maps to) |
| GET | `/v1/videos/effects` | List effects tasks |
| POST | `/v1/general/advanced-custom-elements` | **Create element** (async, returns task_id) |
| GET | `/v1/general/advanced-custom-elements/{task_id}` | Poll create-element task |
| GET | `/v1/general/advanced-custom-elements?pageNum=1&pageSize=500` | List user's custom elements |
| GET | `/v1/general/advanced-presets-elements` | List Kling's 54 official preset elements (Dragon, Snowfield, Kitty, etc.) |
| POST | `/v1/general/delete-elements` | Delete custom element by element_id |

**Wrong paths we tried first (all 404):** `/v1/elements`, `/v1/element`, `/v1/library/elements`, `/v1/videos/omni`, `/v1/account/balance`, `/v1/account/costs`. The element resource lives under `/v1/general/...` not `/v1/...`.

## Element create — payload shape + gotchas

```json
POST /v1/general/advanced-custom-elements
{
  "element_name": "Joe",                          // ≤ 20 chars
  "element_description": "Friendly bearded ...",  // ≤ 100 chars
  "reference_type": "image_refer",                // or "video_refer"
  "element_image_list": {
    "frontal_image": "https://.../joe_front.png",
    "refer_images": [                              // MUST have 1-3 entries
      {"image_url": "https://.../joe_3q.png"},
      {"image_url": "https://.../joe_profile.png"}
    ]
  },
  "tag_list": [{"tag_id": "o_102"}],              // o_102 = Character
  "external_task_id": "joe-1"                     // unique per user; query-friendly
}
```

**Quirks (confirmed empirically 2026-05-06):**

1. **`refer_images` is REQUIRED with 1-3 entries** even when `frontal_image` is set. Empty `refer_images: []` returns `code 1201: "The number of element refer images must be between 1 and 3"`. The docs say "1 to 3 additional reference images" which reads as optional but is not.
2. **Workaround for single-image elements:** duplicate the frontal URL into refer_images (`refer_images: [{image_url: <same as frontal>}]`). Tested and accepted.
3. **First poll often returns `succeed` within 5s** — element creation is fast.
4. **`final_unit_deduction: 0`** on every element create so far — appears to be free against API quota (or charged separately, TBD).
5. **`reference_type` echoes back as `null`** in the GET response — only required on POST. Not a bug.
6. **`task_id` (the create-job ID) ≠ `element_id` (the durable element ID).** Use `task_id` only to poll; persist `element_id` from `task_result.elements[0]` for video gen calls.

## Hosting reference images: GCS bucket setup (2026-05-06)

Kling needs publicly fetchable URLs for `frontal_image` / `refer_images` (or base64 inline ≤10MB each, ~40MB total — works but unwieldy). We provisioned a dedicated GCS bucket:

- **Bucket:** `gs://saraandeva-kling-elements`
- **URL pattern:** `https://storage.googleapis.com/saraandeva-kling-elements/<path>`
- **Project:** `gen-lang-client-0430249113` (same as Firebase project)
- **Region:** `asia-southeast1` (Singapore — same region as api-singapore.klingai.com)
- **Access:** uniform bucket-level access + `roles/storage.objectViewer` granted to `allUsers`
- **Cache:** `Cache-Control: public, max-age=31536000` set on all uploads
- **Layout:** `characters/<filename>.png` and `scenes/<filename>.png` (mirrors `assets/characters/` and `assets/scenes/` in saraandeva repo)
- **Initial upload:** 129 PNGs (35 character angles + 94 scenes), ~86MB total

To upload a new file: `gcloud storage cp --cache-control="public, max-age=31536000" <local> gs://saraandeva-kling-elements/<path>/`

## Reusable scripts (in /tmp, not in repo)

- `/tmp/kling_list_elements.py` — list custom + preset elements
- `/tmp/kling_list_videos.py` — list video gen tasks (returns prompt + CDN URL per task)
- `/tmp/kling_create_element.py` — generic element creator (`name desc frontal_url [refer_urls...]`)
- `/tmp/kling_create_joe.py` — first smoke test (Joe character, 3 angles)
- `/tmp/kling_elements_created.json` — running registry of API-created element_ids

## Migration prerequisite (when moving from UI-only to API-only)

1. Re-create every existing UI element via API (Sara, Eva, Mama, Papa, all scenes) — they will not transfer
2. Switch `submitOmniClip.mjs` from Playwright UI → POST `/v1/videos/multi-image2video` with `kling_elements: [{element_id}]`
3. Switch `downloadOmniByPrompt.mjs` to query `/v1/videos/multi-image2video?external_task_id=<clipfile>` — direct mp4 URL in `task_result.videos[0].url` (no auth needed to download)
4. Element creation is currently free; video gen is billed against API pay-as-you-go (separate from UI prepaid)

## Sources / confirmed against
- Official docs: `https://kling.ai/document-api/apiReference/model/element` (JS-rendered, captured by user 2026-05-06)
- Empirical: ep12 v2 UI submission test on 2026-05-05; Joe + jo_beach API element creation 2026-05-06
