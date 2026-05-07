---
name: @SaraAndEva YouTube performance snapshot — May 4 2026
description: First analytical pull of channel data after ep10 upload. Hero video is ep04 "Joe's Secret Stash" (16.8k views, 2x next). Use as baseline for promotion decisions and to understand what's working / not before drafting ep11+.
type: reference
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
Pulled 2026-05-04 via YouTube Data API v3 (channels + playlistItems + videos). Channel is 2 weeks old.

## Channel snapshot
- **Subs**: 8,670
- **Total views**: 35,875
- **Videos**: 20 (10 episodes + 10 shorts)
- **Channel created**: 2026-04-20
- **Subs/views ratio**: 24% — very high for kids YouTube; suggests engaged audience finding the channel

## Top 5 by views (long-form episodes)

| Rank | Episode | Title | Views | Likes | Published |
|---:|---|---|---:|---:|---|
| 🥇 | ep04 | Joe's Secret Stash! | 16,860 | 21 | 2026-04-29 |
| 🥈 | ep07 | The Best Mother's Day Present | 8,882 | 12 | 2026-05-01 |
| 🥉 | ep01 | The Puppies Want Pancakes | 8,616 | 24 | 2026-04-26 |
| 4 | ep09 | The Great COSTCO Coffee Quest | 2,193 | 4 | 2026-05-03 |
| 5 | ep08 | Sara's Silver Tooth! | 1,792 | 4 | 2026-05-03 |

Ep04 is the runaway hero — **2× more views than #2 and 9× more than #4**. Organic algo momentum already there.

## Patterns

### What's working in the top 3 (ep01, ep04, ep07):
- **Animal/character hook in title** (Joe the dog, Puppies, Mother's Day = Mama focus)
- **Concise titles** ("Joe's Secret Stash!" — 5 words)
- **Older publish dates** (more time on the algo, but ep07 is only 3 days older than ep08-09 and outperforms by 4×)

### What's not working:
- **Shorts: 4-76 views each** (one outlier at 76: Joe's Secret Stash short — same hero as the long-form). Most shorts dying organically.
- **Newer eps (8/9/10) underperform** even after a few days. ep10 title is too long: "Sara & Eva: Magic Forest! 🌲✨ (Soccer with Dad, Wawa Snacks, Magic Deer & Drive-In Burgers)" — should be < 50 chars.
- **Engagement rate 0.1-0.3%** (likes/views) — normal for Made-for-Kids since comments are disabled, but the bottom-tier videos have nearly zero engagement.

## Promotion strategy as of May 4 2026

1. **Hero = ep04 "Joe's Secret Stash"**. Promote with "Audience growth" goal. Algo will lean in because momentum is already there.
2. **Budget**: $5-10/day for 14 days. Target cost-per-subscriber < $0.50.
3. **In parallel — title cleanup**: shorten ep10 title and any other > 50 chars. Drop parentheticals. CTR scales inversely with title length on kids' content.
4. **Don't promote shorts yet** — fix the organic hook problem first (better thumbnails, faster opening shot).

## Hypotheses about why ep04 is winning

(Not yet confirmed — need YouTube Analytics API for CTR/AVD/retention curves.)

- **Pomeranian appeal**: dogs in titles + thumbnails are universal kid-magnets
- **Mystery framing**: "Secret Stash" creates curiosity gap that "Magic Forest" doesn't
- **Older = more algo time**: published April 29, has ~6 days more learning than the May 3-4 uploads
- **Ginger/Joe character continuity**: the dog characters are recurring; ep04 may be the "definitive Joe episode" that drives the dog-fan audience

## Action items for ep11+

- Bring back animal/dog focus where natural (ep11 candidate: Mama's pancake morning + Joe steals food?)
- Keep titles ≤ 50 chars, ≤ 7 words
- Front-load the most surprising visual in the first 3 seconds (parents scrub through previews)
- One clear character in the thumbnail at face-shot scale, not crowded family shots

## To enable for deeper analysis

YouTube Analytics API was disabled at this pull. To get CTR / AVD / retention curves:
- Visit https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview?project=800161458672
- Click Enable. Wait 5 min for propagation.
- Re-run the analytics query (the script attempts it for top 15 videos).

## Refresh cadence

Re-pull this data every 7-14 days. Update this file with new top-5 + observations. Trends shift fast on kids' channels — what works at 8k subs differs from what works at 50k subs.

## Targeting correction — 2026-05-04 (CRITICAL)

**Pre-correction (Apr 26 → May 4)**: ALL 5 promotions had India in their targeting (likely default "auto" or all-English-speaking). This dramatically distorted the headline metrics:

- **Cost-per-sub of $0.020-0.028** was India-blended. Real Tier 1 (US/UK/CA/AU) cost-per-sub for kids YouTube is typically **$0.30-1.00** — 15-50× higher.
- **Subs/views ratio of 20%** is suspicious for organic Tier 1 (typical 1-3%). Indian campaigns convert at higher rates due to mobile-first sub patterns.
- **Follow-on views at 0.3%** (48/17,135 on ep04) should be 3-8% in clean Tier 1 — confirms most viewers were Indian and weren't binging the American-coded show.
- **Channel identity drift risk**: algorithm locks in on whoever responds, then shows future episodes to similar viewers. Hard to unwind once set.

**Post-correction (2026-05-04 onward)**: User removed India from all 5 promotions. Targeting now strictly Tier 1: US, UK, Canada, Australia.

**Expected metric shifts** (watch over 3-5 days):
- Cost-per-sub: $0.020 → $0.30-1.00 (10-50× increase) — this is HEALTHY
- Subs/day per video: likely drops 70-80%
- Subs/views ratio: 24% → 1-5%
- Follow-on views ratio: 0.3% → 3-8% (the real channel-growth signal)
- Algorithm re-targeting: 7-14 days to fully refresh viewer profile

**Don't panic when numbers drop.** A subscriber from US/UK/CA/AU watches 5-10× more episodes over time than a Tier 3 sub. ROI on subscriber lifetime watch-time tilts MASSIVELY toward Tier 1 even at 50× higher cost-per-sub.

**Re-baseline 2026-05-09 (5 days post-correction).** All historical numbers above this section are India-blended and not predictive of future Tier 1-only performance.

## Active promotions snapshot — 2026-05-04 (PRE-CORRECTION — India still included)

5 active "Audience growth" promotions, $185.15 total spend:

| Episode | Cost | Impr | Views | Subs | Follow-on | $/sub | CTR | Sub conv | Days |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ep01 | $49.97 | 167.9k | 8,732 | 1,775 | 16 | $0.028 | 5.20% | 20.3% | 8 |
| ep04 | $79.16 | 325.8k | 17,135 | 3,694 | 48 | $0.021 | 5.26% | 21.6% | 6 |
| ep07 | $37.42 | 183.3k | 9,181 | 1,870 | 33 | $0.020 | 5.01% | 20.4% | 3 |
| ep08 | $9.05 | 44.7k | 2,155 | 415 | 0 | $0.022 | 4.82% | 19.3% | 1 |
| ep09 | $9.55 | 45.5k | 2,278 | 384 | 4 | $0.025 | 5.01% | 16.9% | 1 |

**Insight:** $185 spend → 8,138 ad-driven subs = **~94% of total channel subs from ads**. Channel hasn't yet hit organic-momentum threshold (~10k+ subs is where free recommendations start meaningfully).

**Cost-per-sub range:** $0.020-0.028 — all videos perform within 30% of each other on unit economics. This means the concentration question isn't about cost; it's about **which video can be PUSHED PAST the algo threshold** to start generating free recommendations.

**Hero metric that matters most: follow-on views.** Ep04 = 48 (highest), ep07 = 33, ep01 = 16. This is "did viewers watch ANOTHER episode after the promoted one?" — the channel-growth signal.

## Promotion strategy adopted 2026-05-04 (60/40 hybrid)

```
$60-80/day total budget allocation:
  60% → ep04   (the proven hero — push past viral threshold)
  15% → ep07   (warm second — maintain momentum)
  15% → ep01   (third — established performer)
  5%  → ep08, ep09  (testing newer episodes, smaller)
  5%  → 1 short for first time (e.g. Joe's Secret Stash short — only short with any traction at 76 views)
```

Watch ep04's follow-on views weekly. If trend climbs past 100 cumulative, double down ep04 spend further. If it plateaus, redistribute toward ep07.

## Title compliance audit (Google Ads Editorial Policy) — CORRECTED 2026-05-04

**The actual rule (per user correction + observation that ep01/ep07 with single emojis are running fine):**

> ❌ Punctuation or symbols **repeated consecutively** (like `!!` or `🌲✨`)
> ❌ Gimmicky use of multiple punctuation
> ❌ ALL CAPS words used as gimmicks
> ✅ ONE emoji separated by text from other special chars is fine
> ✅ Single `!`, single em-dash, single colon — fine

**Promo-compliant** (already running OR ready):
- ep01 — `Sara and Eva 🥞 The Puppies Want Pancakes! | Episode 1` (single 🥞)
- ep04 — `Sara and Eva — Ep 4: Joe's Secret Stash!` (no emoji)
- ep07 — `Sara and Eva 💐 The Best Mother's Day Present | Episode 7` (single 💐)
- ep03 — `Sara and Eva — Ep 3: Ginger's Package Mystery!`
- ep02 — `Ginger Steals the Pancakes! | Sara and Eva Ep 2`
- shorts: Joe's Secret Stash, Ginger Steals the Pancakes, Whose Helmet Is It

**NOT compliant — need title edit before promotion:**
- ep05 — parenthetical `(Sharing Is Caring!)` — drop it
- ep06 — parenthetical `(and Eva's First Ride!)` — drop it
- ep08 — two `!` in title `Tooth! 🦷 — Dentist Day!` — single `!`
- ep09 — consecutive emojis 🛒☕ + ALL CAPS `COSTCO` — separate emojis with text or drop one
- ep10 — consecutive emojis 🌲✨ + parenthetical — drop both

**Compliant rename pattern**: `Sara and Eva 🍩 The <Hook>!` or `Sara and Eva — Ep N: <Hook>!` (one emoji max OR none, single `!`).

## Action items (2026-05-04)

1. ✅ ep04 already promo-compliant + winning organically — make it the hero
2. 🔧 Edit ep10 title in Studio: `Sara & Eva: Magic Forest! 🌲✨ (...)` → `Sara and Eva — Ep 10: The Magic Forest!`
3. 🔧 Edit ep05/06/07/08/09/01 titles before promoting (emojis disallowed in ads)
4. 🆕 Add 1 short to promotions (currently zero shorts in promo)
5. 📊 Re-pull data 2026-05-11 (7 days) and check cost-per-sub trend as ep04 spend scales

## Time-normalized analysis (key insight added 2026-05-04)

When promotions run for different durations, **cumulative numbers mislead**. ALWAYS normalize by days in market:

| Episode | Days | $/day | Impr/day | Subs/day | $/sub |
|---|---:|---:|---:|---:|---:|
| ep07 | 3 | $12.47 | 61,090 ⭐ | 623 ⭐ | $0.020 ⭐ |
| ep04 | 6 | $13.19 | 54,296 | 616 | $0.021 |
| ep08 | 1 | $9.05 | 44,682 | 415 | $0.022 |
| ep09 | 1 | $9.55 | 45,460 | 384 | $0.025 |
| ep01 | 8 | $6.25 | 20,990 🔻 | 222 | $0.028 |

**Daily winner is ep07, NOT ep04.** ep04's lead is from longer time in market. ep01 is decaying (impressions/day dropped 60%+ — saturation).

## Decay rule (load-bearing insight)

**Any single video's audience-growth promotion has a 7-10 day effective window** before audience saturation hits and impressions/day drops 50%+. Daily cost-per-sub climbs.

**Implication:** rotate hero videos every week. Don't run one promotion forever. You need a **bench of promo-compliant videos** large enough to rotate through.

Currently the promo-compliant bench is only 4 videos (ep04, ep03, ep02, ep04 short). After title cleanup of all the emoji-laden titles, the bench grows to 10. **Title cleanup is therefore high-leverage** — it unlocks the rotation strategy.

## Revised strategy with decay-aware rotation

Weekly cadence:
- Week 1: hero ep04 + supporting ep07/ep08/ep01
- Week 2: rotate to hero ep07 + supporting ep04/ep08/ep09 (ep01 paused — saturated)
- Week 3: hero ep08 (after maturing) + supporting ep07/ep04/new ep
- ... continue rotating

This way each video gets ~2-3 weeks total promo time spread over 6-8 weeks elapsed, avoiding the daily-rate decay cliff.
