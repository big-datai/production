---
name: Geo + watch-time split strategy — India for watch-hours, Tier 1 for subs
description: India = 22.94% sub conversion (5× Tier 1) + 68% of all watch hours, but low avg view duration (23s) and low CPM. Tier 1 English = 4-6% conversion but high LTV. Strategy: split geo by campaign goal. Watch-hour campaigns include India. Sub-quality campaigns Tier 1 only. Skip BR/DE/FR/IT/MX/PL/UA/NL/PH (0 conversion in 28d data).
type: lesson
originSessionId: 2026-05-11-strategic-session
---
**The data (28-day window, May 11 2026):**

| Country | Views | Watch hrs | Subs gained | sub/100v | avg view duration |
|---|---|---|---|---|---|
| 🇮🇳 India | 42,083 | **270 hrs (68%)** | **9,654 (73%)** | **22.94%** | 23s |
| 🇬🇧 UK | 25,528 | 49 hrs | 1,435 | 5.62% | 28s |
| 🇺🇸 US | 19,803 | 39 hrs | 923 | 4.66% | 31s |
| 🇨🇦 Canada | 10,407 | 21 hrs | 521 | 5.01% | 26s |
| 🇦🇺 Australia | 5,983 | 8 hrs | 256 | 4.28% | 24s |
| 🇮🇪 Ireland | 301 | 2 hrs | 42 | 13.95% | 28s |
| 🇳🇿 NZ | 1,051 | 1 hr | 62 | 5.90% | 21s |
| 🇧🇷 BR / 🇩🇪 DE / 🇫🇷 FR / 🇮🇹 IT / 🇲🇽 MX / 🇵🇱 PL / 🇺🇦 UA / 🇳🇱 NL / 🇵🇭 PH | 0-12 each | 0 hrs | 0-1 | 0% | n/a |

## Three takeaways

### 1. India is unicorn-tier for sub conversion + watch hours

22.94% subs/view is **5× the Tier 1 rate**. India contributed:
- 73% of all subscribers gained in 28 days
- 68% of all watch hours

But: avg view duration only 23s (vs 31s in US). For long-form watch-hour goal (YPP threshold) this is "OK enough" — 23s × 60M+ Indian YT users at scale = lots of hours.

### 2. Tier 1 English is quality, not volume

US/UK/CA/AU/IE/NZ combined = 31% of watch hours BUT:
- Longer avg view duration (26-31s)
- Higher YouTube ad CPM (when monetization unlocks → $3-7 per 1000 views vs India $0.50)
- Higher LTV viewers (more likely to install apps, watch longer in future)

### 3. "Expansion" countries are dead

Brazil, Germany, France, Italy, Mexico, Poland, Ukraine, Netherlands, Philippines — ALL were tested by including in past campaigns. ZERO meaningful conversion from any. The "spread wider for more growth" instinct = wrong here.

## The strategy: GEO BY CAMPAIGN GOAL

### Watch-hours goal (Website visits → playlist/compilation)

**Include:** IN + GB + US + CA + AU + IE + NZ
**Why include India:** dominant watch-hours engine. Don't care about per-viewer LTV; just need total hours toward YPP.

### Subscriber-quality goal (Audience growth → main videos)

**Include:** GB + US + CA + AU + IE + NZ only (NO India)
**Why exclude India:** future ad revenue from these subs > India equivalent. CPM gap is 6-14×.

### General-discovery goal (broad campaigns)

**Include:** all 7 above. Skip the dead 9 countries entirely.

## Skip list (never include in any campaign)

🚫 Brazil, Germany, France, Italy, Mexico, Poland, Ukraine, Netherlands, Philippines, Turkey, Spain, Indonesia, Vietnam

These have been tested with paid promotion in May 2026 with $0 results. The YouTube ad auction self-corrects against them — you'll burn budget on impressions that don't convert.

## Why YouTube even shows you these countries in geo-picker

YouTube's default targeting auto-includes countries based on language match + similar-channel data. Studio Promote's "default audience" can pull in 13+ countries unprompted. **Always verify the geo list before launching.**

## When India usage gets revisited

If/when YPP unlocks ad revenue, the per-view CPM in India becomes the constraint. At low India CPM, ad-revenue-per-Indian-view is ~10-20× lower than US. Once monetized:

- **Keep India for:** Shorts feed (algorithmic boost), top-of-funnel sub acquisition
- **Move spend toward:** Tier 1 for revenue-driving views

## Lint rule

None — geo selection is per-campaign, not per-episode. Document in playbook only.

## Where this came from

Strategic session 2026-05-11. Pulled per-country analytics via YouTube Analytics API (post-enablement). Found India = 68% of watch hours. User had paused India targeting on May 4 based on "low watch time" instinct — was wrong; needed to be split by goal not removed entirely.

## Companion lessons

- `lesson_funnel_strategy_short_to_main_2026_05.md` — what landing pages to use per goal
- `reference_youtube_promo_data_may2026.md` — earlier (incomplete) snapshot, now superseded
