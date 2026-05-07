---
name: Kling API costs + budget endpoint + UI vs API cost comparison
description: Empirical Kling API rates measured 2026-05-06 against the trial resource pack. kling-v3-omni std mode bills 0.6 units/sec; element creation is 0 units (free). Trial pack cost $10 for 100 units → $0.10/unit. The account-budget endpoint is `GET /account/costs` (no /v1 prefix) with snake_case params. Includes UI-vs-API per-clip and per-episode cost comparison so we can decide when API migration pays off.
type: lesson
severity: nice-to-know
appliedTo: produce-episode pipeline cost planning + API migration ROI analysis
originSessionId: b923ac34-5ab5-423b-b230-8d3dc1dc3937
---
# Kling API rates (empirical, 2026-05-06)

Measured against an active trial resource pack (`Trial-Video-100Units-5Con-1Months`). User confirmed pack cost: **$10 for 100 units = $0.10/unit**.

## Per-second rates by model + mode

| Model | Mode | Resolution | Units/sec | $/sec @ trial | $/sec @ regular* |
|---|---|---|---|---|---|
| `kling-v3-omni` | std | 720p | **0.6** | $0.060 | $0.084 |
| `kling-v3-omni` | pro | 1080p | ~1.0–1.2 (est, untested) | ~$0.10–0.12 | ~$0.14–0.17 |
| `kling-v3-omni` | 4k | 4K | ~3.0+ (est, untested) | ~$0.30+ | ~$0.42+ |

*Regular tier per public docs: $4200/3 months = 30,000 units → $0.14/unit. Always confirm against the user's actual pack.

## Per-clip and per-episode costs (std mode, 720p)

| Clip length | Units | Trial $ | Regular $ |
|---|---|---|---|
| 3s | 1.8 | $0.18 | $0.25 |
| 5s | 3.0 | $0.30 | $0.42 |
| 10s | 6.0 | $0.60 | $0.84 |
| 15s | 9.0 | $0.90 | $1.26 |

**Typical Sara & Eva episode** (~22 clips, mostly 10s std, plus letter-clip music videos): ~140 units = **~$14 trial / ~$20 regular**.

## Free operations (0 unit deduction)

- Element creation (`POST /v1/general/advanced-custom-elements`)
- Element listing/get (`GET /v1/general/advanced-custom-elements`)
- Element delete (`POST /v1/general/delete-elements`)
- Task list/get (`GET /v1/videos/{mode}` and `/v1/videos/{mode}/{task_id}`)
- Account budget query (`GET /account/costs`)

# Budget / billing endpoint

```
GET https://api-singapore.klingai.com/account/costs?start_time=<epoch_ms>&end_time=<epoch_ms>
Authorization: Bearer <JWT>
```

**Notes:**
- **No `/v1` prefix** on this endpoint (unlike all the video/element endpoints).
- Params are **snake_case** (`start_time`, `end_time`), NOT camelCase. CamelCase silently fails with `code 1200: Missing Request Parameter`.
- Times are epoch milliseconds.
- A 90-day window is plenty for current-state checks.

**Response shape:**

```json
{
  "code": 0, "message": "SUCCEED",
  "data": {
    "code": 0, "msg": "success",
    "resource_pack_subscribe_infos": [
      {
        "resource_pack_name": "Trial-Video-100Units-5Con-1Months",
        "resource_pack_id": "...",
        "resource_pack_type": "decreasing_total",
        "total_quantity": 100.0,
        "remaining_quantity": 95.2,
        "purchase_time": 1778010834695,
        "effective_time": 1778010834693,
        "invalid_time": 1780602834693,
        "status": "online"
      }
    ]
  }
}
```

`remaining_quantity` is the live budget. `decreasing_total` packs drain on each generation; `effective_time` and `invalid_time` are the validity window in epoch ms.

# UI vs API cost comparison

## UI rate (from `project_270_episode_sprint.md` + ep12 episode.json planning)

| Clip length | UI credits | $/cr (mid plan ~$0.012/cr) | $/clip |
|---|---|---|---|
| 5s | ~45 cr | $0.012 | ~$0.54 |
| 10s std | 90 cr | $0.012 | ~$1.08 |
| 15s std | 135 cr | $0.012 | ~$1.62 |

So UI is roughly **9 cr/sec ≈ $0.108/sec** at mid-tier consumer plan ($32.99/mo for 3000 cr → $0.011/cr).

## Side-by-side per-second + per-episode

| | UI prepaid | API trial ($0.10/unit) | API regular ($0.14/unit) |
|---|---|---|---|
| $/sec (std 720p) | ~$0.108 | **$0.060** | $0.084 |
| 5s clip | ~$0.54 | **$0.30** | $0.42 |
| 10s clip | ~$1.08 | **$0.60** | $0.84 |
| Typical 22-clip ep (~220s) | **~$24** | **~$13** | **~$18** |
| Element creation | manual UI drag-drop, ~30s/element of human time | **free + scriptable** | free + scriptable |

**Bottom line:** API is **~45% cheaper than UI** at the trial rate, **~25% cheaper at the regular rate**, AND removes the manual element-creation step. The catch: API account is segregated from UI (per `lesson_kling_api_account_segregation.md`) — once you start using API, all elements + clips for that episode must go through the API too.

## When API migration pays off

- **Always:** if you have ≥1 ep/day cadence and want zero manual element drag-drop.
- **Yes (cost-wise):** trial pack is strictly cheaper per second; regular pack is still cheaper.
- **Wait:** if you've already prepaid a chunky UI credit pack, burn that down first — the segregation means you can't mix.

# Reusable scripts (in /tmp)

- `/tmp/kling_list_elements.py` — list custom + preset elements
- `/tmp/kling_list_videos.py` — list video gen tasks
- `/tmp/kling_create_element.py` — generic element creator (auto-dups frontal into refer if no refers given)
- `/tmp/kling_omni_jo_beach.py` — single-element Omni smoke test
- `/tmp/kling_omni_3char_beach.py` — 3-element Omni test
- `/tmp/kling_elements_created.json` — running registry of created element_ids

For account budget anytime:
```bash
TOKEN=$(...gen JWT...)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api-singapore.klingai.com/account/costs?start_time=$((($(date +%s) - 90*86400)*1000))&end_time=$(($(date +%s)*1000))" | python3 -m json.tool
```

# Caveats

- Trial pack expires **2026-06-05** (one month from purchase 2026-05-05). After that, refill or migrate back.
- Pro/4k mode rates are estimates from public pricing — measure empirically when first used and update this file.
- USD-per-unit varies by pack tier. Always re-check `total_quantity` × pack-cost ÷ pack-price.
