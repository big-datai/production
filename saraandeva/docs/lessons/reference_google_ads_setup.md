---
name: Google Ads campaign setup checklist for @SaraAndEva
description: Step-by-step recipe for creating a YouTube subscriber-growth campaign in Google Ads (ads.google.com), with bid/audience/creative defaults tuned for Sara & Eva. First-time setup taught 2026-05-04.
type: reference
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
**Use case:** when the user asks to "set up Google Ads", "create a campaign", or "promote with ads.google.com" — walk them through the click-by-click setup. Do NOT try API campaign creation; it requires Google Ads Developer Token approval (1-2 days from Google).

## Pre-requisites
- Google Ads account exists (ads.google.com — Expert Mode, NOT Smart campaign)
- @SaraAndEva YouTube channel linked: Tools & Settings → Linked accounts → YouTube
- User signed in to ads.google.com with the same Google account that owns the channel
- Ad blocker disabled on ads.google.com tab

## Campaign creation flow (~10 minutes per campaign)

### Screen 1 — Campaign objective
Pick: **"YouTube reach, views and engagements"** (formerly "Awareness and consideration").
- NOT "Leads" or "Sales" — those expect a website sale.
- NOT "Create without guidance" — leaves too much on default.

### Screen 2 — Buying type + Goal + Campaign type

The "YouTube reach, views and engagements" objective opens a 3-pick screen:

- Buying type: **Auction** (NOT Reservation — that's for big brands at $50k+ commitments)
- Campaign goal: **YouTube subscriptions and engagements** (NOT "Video views" which Google "recommends" — subs is what optimizes for the channel-growth metric we actually care about)
- Campaign type: Auto-resolves to **Demand Gen** (Google's modern campaign type for sub acquisition; replaces older Video → skippable in-stream path for this goal)

### Screen 3 — Demand Gen campaign settings (full field-by-field)

```
Campaign name:        Sara & Eva - Hero ep<NN> - <Month> <Year>
Campaign goal:        YouTube engagements (auto-selected from prior pick)

YouTube conversions:
  ✓ YouTube channel subscriptions
  ✓ YouTube follow-on views
  
View-through conversions: ❌ LEAVE UNCHECKED (beta — adds noise to first 30 days of learning data)

Target CPA:           LEAVE EMPTY (Google "Maximize conversions" by default)
                     After 14 days of data, set tCPA to ~70% of observed CPA

Budget:
  Type:               Daily
  Amount:             US$ 20  (start)
  Start date:          today
  End date:            today + 10 days  (deliberate evaluation gate)

Customer acquisition: ❌ Don't check "only bid for new customers"

Brand guidelines:     Leave default (customize later if needed)

EU political ads:     ✓ No

Location & language:  Set at ad group level (don't set here)
Devices:              All eligible (mobile dominates kids YouTube)
Ad schedule:          All day
Third-party measurement: None
Campaign URL options: None
IP exclusions:        None
```

(Old advice: "Video campaign type with skippable in-stream ads" was based on pre-Demand-Gen path. Google's UI now routes "YouTube subscriptions and engagements" goal to Demand Gen automatically.)

### Screen 3 — Campaign settings

```
Campaign name:       Sara & Eva — Tier 1 — Hero <ep#> — <Month> <Year>
Bidding:             Maximum CPV (manual)
Max CPV bid:         $0.03 (target — Google may bid below)
Networks:            ✓ YouTube videos
                     ✓ YouTube search results
                     ✗ Video partners on Display Network
Locations:           United States, United Kingdom, Canada, Australia
                     ✓ Presence: people in your targeted locations
                     (do NOT use "Presence or interest")
Languages:           English
Inventory type:      Standard inventory (auto-blocks Made-for-Kids violations)
Excluded content:    Embedded YouTube videos, Live streaming
Excluded categories: Tragedy & conflict, Sensitive social issues, Sexually suggestive
Daily budget:        $20/day  (start)
Total cap:           $400  (20 days max — forces rotation)
Frequency capping:   3 impressions / user / day
```

### Screen 4 — Ad group

```
Ad group name:    Hero <ep#> — Parents 25-44

Demographics:
  Age:                25-34, 35-44
  Gender:             All
  Parental status:    ✓ Parent of toddler (1-3 yrs)
                     ✓ Parent of preschooler (4-5 yrs)
                     ✓ Parent of grade schooler (6-12 yrs)
  Household income:   All  (kids' content performs across HHI)

Audiences (the high-leverage targeting):
  Custom segment → "People who searched these in last 7 days":
    bluey episode
    cocomelon
    miss rachel toddler
    kids cartoon
    preschool youtube
    kids show pixar style
    family cartoon

  In-market audiences:
    Parenting & Family → Parenting Resources
    Family-Focused

Content:
  Topics: Family Filmmaking, Family-Friendly Animation, Children's TV/Games
  (Leave Placements + Keywords blank for first campaign — let Google optimize)
```

### Screen 5 — Ad creation

```
Video URL:        https://youtu.be/<chosen episode id>
Final URL:        https://www.youtube.com/@SaraAndEva (drives to channel = sub conversion)
Display URL:      youtube.com/@SaraAndEva
Headline:         New kids' cartoon!
Long headline:    Sara and Eva — <hook from episode title>
Description:      Pixar-style family adventures with sisters, dogs and surprises. Subscribe for new episodes weekly.
Call-to-action:   Subscribe
```

### Screen 6 — Review + Publish

## Targeting cheat sheet

**Always Tier 1 only:** US, UK, Canada, Australia. India / Tier 3 destroys cost-per-sub quality (memory: `reference_youtube_promo_data_may2026.md`).

**Custom Intent search terms** are the single biggest leverage. Update quarterly based on what's trending in kids YouTube. The current set above (Bluey, Cocomelon, Miss Rachel, etc.) is the May 2026 baseline.

**Avoid these defaults that hurt cost-per-sub:**
- "Optimized targeting" toggle (Google adds non-relevant audiences) — turn OFF
- "Video partners on Display Network" (low-quality off-YouTube placements)
- "Embedded YouTube videos" inventory
- "Presence or interest" location targeting (spray and pray)

## Performance benchmarks (Tier 1 only, kids YouTube)

- Cost per view: $0.02-0.05 — view rate above 25%
- Cost per subscriber: $0.30-1.00 (real Tier 1 rate; the $0.020 from India-blended Studio Promote is NOT comparable)
- View rate (% of impressions watched 30s+): 25-40%
- Sub-conversion rate from views: 1-5%
- Follow-on views ratio: 3-8% (the channel-binding signal that matters most)

## When to add a Demand Gen campaign (Week 2)

After Video campaign has 7+ days of data:
- Type: Demand Gen
- Same audience targeting as Video campaign (custom intent + parental status)
- Different inventory: Shorts feed, Discover feed, Gmail, YouTube home feed
- Bid: Maximize conversions
- Run in parallel with Video — they target different placements

## When to add Retargeting (Week 3+)

After accumulating 1k+ video views:
- Audiences → Your data → Video viewers → "Watched 25%+ of any of your videos in last 30 days"
- Show them the next episode in sequence (ep04 viewers → ep07 → ep01)
- This is the cheapest sub acquisition channel YouTube offers

## Programmatic creation (FUTURE — not yet possible)

To create campaigns via Google Ads API requires:
1. Apply for Google Ads Developer Token via an MCC (manager) account
2. Wait 1-2 business days for Google approval
3. OAuth with `https://www.googleapis.com/auth/adwords` scope
4. Customer ID for the @SaraAndEva account

If user wants this someday, walk them through the Developer Token application. Until approved, UI is the only path.
