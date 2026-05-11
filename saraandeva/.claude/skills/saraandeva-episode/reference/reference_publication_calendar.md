# Publication Calendar — Quick Reference Card

**Last updated:** 2026-05-11

## Cadence: 3 episodes/week on Wed / Fri / Sun

Why this cadence:
- Sunday is the channel's best subscriber-conversion day (2,706 subs gained on Sundays in 28d data)
- Friday is peak views (29,227 views in 28d data — pre-weekend setup)
- Wednesday spaces the catalog evenly + catches mid-week kid-content searches
- 3/week is sustainable production load (1 ep / ~2 days)

Skip Tuesday — worst sub conversion (851 subs gained in 28d).

## Holiday timing (publish 0-7 days before the holiday)

| Holiday | 2026 date | Best publish date | Episode # (current plan) |
|---|---|---|---|
| Mother's Day | Sun May 10 | (already passed) | ✅ ep07 |
| **Father's Day** | **Sun June 21** | **Sun June 21** | ep30 |
| Independence Day | Sat July 4 | Fri July 3 | TBD |
| Back to school | last week of August | week of Aug 24-30 | TBD |
| Halloween | Sat October 31 | week of Oct 26 | ✅ ep15 (early) |
| Thanksgiving (US) | Thu November 26 | week of Nov 23 | gap |
| Christmas | Fri December 25 | Wed Dec 23 | gap |
| Valentine's Day | Sat Feb 14, 2027 | Fri Feb 13 | future |
| Easter (2027) | Sun April 4 | week of Mar 29 | future |

## The ramp pattern for big holidays

For Father's Day-level holidays (200k+ monthly seasonal search):

- **Week before:** publish 1-2 themed Shorts as teaser (e.g. "What's the BEST Daddy Gift?!" Short on Friday)
- **Day of:** publish the main episode at the optimal Sun slot
- **Day after:** publish a follow-up Short featuring the same episode's hook

This 3-pronged ramp lets the algorithm aggregate signals before the day-of push.

## 1-month rolling calendar (template)

Auto-generate via `scripts/_draft_publication_calendar.py` (TODO) using:
- Today's date
- Last published episode #
- Upcoming holidays in next 30 days
- Backlog of drafted scripts in `content/episodes/`

## May 2026 example (from this session)

| Date | Day | Ep | Title |
|---|---|---|---|
| Wed May 13 | Wed | ep16 | Tooth Fairy and a Sneaky Dog! Sara and Eva |
| Fri May 15 | Fri | ep17 | Magic Forest Hidden Friend! Sara and Eva |
| Sun May 17 | Sun | ep18 | Eva's First Soccer Game — Will She Score?! |
| Wed May 20 | Wed | ep19 | Magic Forest Finale — Ginger's Secret! |
| Fri May 22 | Fri | ep20 | Birthday Cake Disaster! |
| Sun May 24 | Sun | ep21 | Backyard Camping Adventure! (Memorial Day) |

## Holiday-relative ep number math

```python
from datetime import date, timedelta
last_ep_pub = date(2026,5,9)         # ep15 published this date
last_ep = 15
target_holiday = date(2026,6,21)     # Father's Day
days_until_holiday = (target_holiday - date.today()).days
# 3 eps per week ≈ 1 ep per 2.33 days
eps_in_between = round(days_until_holiday / 2.33)
holiday_ep_num = last_ep + eps_in_between
# => Father's Day = approximately ep15 + 15 = ep30
```

## Companion lessons

- `lesson_title_seo_formula_2026_05.md` — how to title each episode
- `reference_youtube_kids_search_keywords_2026.md` — what topics to slot into the calendar
- `lesson_episode_formula_v2_2026_05.md` — required structure per episode
