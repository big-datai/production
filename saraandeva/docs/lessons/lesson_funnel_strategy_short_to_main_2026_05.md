---
name: Funnel strategy — Short → Main → Hero (hub-and-spoke routing)
description: Sara & Eva winning funnel: 4 NOT-MfK Shorts → Related Video → respective Main; ep01/07/08 mains → end-screen → ep04 (channel hero); ep04 → end-screen → ep07. Playlist URL as ad landing gives ~90 min watch-potential. Made-for-Kids blocks end-screens BUT NOT playlists.
type: lesson
originSessionId: 2026-05-11-strategic-session
---
**The funnel architecture (set up 2026-05-11):**

```
Ad impression (Short)
       ↓
Short viewer
       ↓ Related Video tap
Main episode (5-9 min watch)
       ↓ End-screen → ep04 hero (~22% Subscribe rate)
ep04 (the channel-hero converter)
       ↓ End-screen → ep07 (next hero)
ep07 (Mother's Day, $0.054/sub)
       ↓ End-screen Subscribe button
SUBSCRIBED
```

## The 5 setup pieces (all done 2026-05-11)

### 1. Related video on every NOT-MfK Short

Set in Studio per Short. Points to the main episode that pays off the Short's hook. Currently:
- Joe's Stash Short → ep04 main
- Mother's Day Short → ep07 main
- ep14 Anniversary Short → ep14 main
- Costco Short → ep09 main

**Critical:** the Short must be Not-Made-for-Kids for Related Video to appear (the feature is gated on MfK status).

### 2. End-screens on every NOT-MfK main

Standard setup (last 20s of every main):
- Left card: Subscribe element (channel = Sara and Eva)
- Right card: 1 video (the next hero)

Routing map:
- ep04 main → ep07 (next hero, builds chain)
- ep07 main → ep04 (hub)
- ep01 main → ep04 (hub)
- ep08 main → ep04 (hub)

### 3. Cards (mid-video links) — TODO

Mid-video card at 30-50% mark could push viewers from underperformers to ep04. Not yet done.

### 4. Playlist URL as ad landing

Setting Website-visit promotion's landing URL to:
```
https://www.youtube.com/watch?v=cbJZAgm0HxY&list=PLMLz_1vaheL7MwZ8OdmSPd1qftZ_WRwvS
```
...opens ep04 with the "Watch in Order" playlist queued behind it. **Auto-plays next episode** = potential 90 min watch per click vs 60 min compilation cap.

### 5. Description CTA on every video

First line of every video description (all 32 videos):
```
Watch all Sara & Eva episodes in order: https://www.youtube.com/playlist?list=PLMLz_1vaheL7MwZ8OdmSPd1qftZ_WRwvS
```

Tap-rate on description links is low but compounding across catalog adds up.

## Critical constraint: MfK gates the features

| Feature | Works on MfK content? | Works on Not-MfK? |
|---|---|---|
| End-screens | ❌ | ✅ |
| Cards | ❌ | ✅ |
| Subscribe button on end-screen | ❌ | ✅ |
| Related Video on Shorts | ❌ | ✅ |
| Comments | ❌ | ✅ |
| **Playlists (auto-play next)** | ✅ | ✅ |
| Description links | ✅ | ✅ |
| In-video voice CTAs | ✅ | ✅ |

The 24/32 still-MfK videos rely on playlist + description for funneling. The 8 NOT-MfK videos get end-screens too.

## Why hub-and-spoke (not chain)

Alternative: ep01 → ep02 → ep03 → … chain order. Sounds intuitive but underperforms because:
1. If viewer drops on ep03, they never reach the hero (ep04)
2. Chain compounds failure rate at each step

Hub design: every video routes to ep04 (proven $0.042/sub converter). ep04 routes out to ep07 (next-hero). YouTube's "watch next" auto-suggestions handle non-redundancy (won't show ep04 again to someone who just watched it).

## Channel page setup (also done 2026-05-11)

- **Home tab: ENABLED** (was off — silent killer of channel-page experience)
- **Channel trailer:** ep04 (for non-subscribers — first impression auto-plays the proven hero)
- **First section:** "Watch in Order" playlist (15 episodes)
- **Themed arc playlists** (also created):
  - 🌲 The Magic Forest Adventure
  - 💝 Family Holidays
  - 🦷 Real-Life Firsts
  - 🐶 When the Pets Cause CHAOS!

## Lint rules

None directly enforce funnel setup — these are channel-level / per-video Studio configurations. Tracked in lesson only.

## Where this came from

Strategic session 2026-05-11. Built piece-by-piece across the day via Chrome MCP automation of Studio. Verified Related Video on Shorts works for kids/family channels. Confirmed end-screen Subscribe + video card combo works after MfK flip.

## Companion lessons

- `lesson_made_for_kids_classifier_triggers.md` — how to flip videos to Not-MfK so funnel features unlock
- `lesson_geo_watch_time_split_strategy_2026_05.md` — which geos to target per funnel goal
- `lesson_ypp_qualification_path_2026_05.md` — playlist landing = the watch-hour pump
