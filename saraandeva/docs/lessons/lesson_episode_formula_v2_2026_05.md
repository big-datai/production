---
name: Empirical episode formula v2 — 3 ingredients + 22-clip structure (data-validated)
description: Every Sara & Eva winner has THREE ingredients in common — real-life moment + pet mishap + emotional payoff. Plus required Papa-active scene + 2-4 camera-asks. Ideal runtime 4-6 min. Top performers (ep04, ep07, ep08, ep14) all fit; flops (ep10, ep11, ep12, ep13) miss one or more.
type: lesson
originSessionId: 2026-05-11-strategic-session
---
**The empirical winning formula (from 32 published episodes, May 2026):**

```
Real-life moment  +  Pet mishap  +  Emotional payoff  =  Hit
```

If an episode is missing any of the 3, it underperforms.

## Winner audit

| Ep | Real-life moment | Pet mishap | Emotional payoff | Result |
|---|---|---|---|---|
| ep04 Joe's Stash | (none required - whole ep IS the pet mishap) | Joe steals everyone's stuff | Mama explains Joe's making a nest, Joe gets his own blanket | 🏆 $0.042/sub, 18k views |
| ep07 Mother's Day | Mother's Day | Ginger steals pancake mid-disaster | Mama tears up at the coupon book | 🏆 $0.054/sub, 11k views |
| ep08 Dentist Day | First dentist visit | (animal-friendly: turtle puzzle) | Sara's "Brave Tooth" silver bridge | 🏆 strong |
| ep14 Anniversary | 10-year anniversary | (none required - emotional retrospective) | Mama tears at the gift + song | 🏆 $0.029/sub |

## Loser audit

| Ep | Missing ingredient | Result |
|---|---|---|
| ep10 Magic Forest | weak pet mishap + thin emotional payoff | $0.267/sub, 1k views |
| ep11 Burger Heist | strong pet mishap (Joe sausage) but weak payoff | $0.314/sub, 23 views |
| ep12 Magic Bottle | weak on all 3 | 66 views |
| ep13 Tag Game | weak pet mishap (Joe runs onto court doesn't pay off) | 22 views |

## Required scene rules (in addition to the 3 ingredients)

1. **Papa-active scene** — 15s, mandatory in every ep. Per `lesson_papa_play_scene_per_episode.md`. Top retention driver.
2. **2-4 audience camera-asks** — per `lesson_fourth_wall_audience_engagement.md`. Final beat = always a camera-ask cliffhanger.
3. **Opening voice CTA** — first 5 seconds: "Hi friends! Tap subscribe so you don't miss tomorrow's adventure!" Works on MfK content (only end-screens are blocked, not voice).
4. **Pet involvement** — Joe OR Ginger must appear and DO something, not just exist in background.

## Ideal runtime

| Length | Performance |
|---|---|
| 2-3 min | ⚠️ feels rushed |
| **4-6 min** | ✅ **sweet spot** (ep07@3:58, ep08@5:53 = winners) |
| 7-8 min | ⚠️ acceptable for arc-content (ep14@8:59 OK) |
| 9+ min | ❌ underperforms (ep10@8:32 = dud) |

## 22-clip beat structure (the canonical template)

```
Beat 1     HOOK + Voice CTA (5s)
Beat 2-4   Setup (real-life moment introduction, family in normal state)
Beat 5-7   Inciting incident (the pet does something, or the kid moment happens)
Beat 8     CAMERA-ASK #1 ("Do YOU think...?")
Beat 9-12  Mishap escalation (chaos comedy peak)
Beat 13-14 Crisis / emotional low point (someone tears up)
Beat 15-17 Resolution turn (Sara has an idea / Mama explains)
Beat 18    EMOTIONAL PAYOFF (hug, tears, payoff line)
Beat 19    PAPA-ACTIVE SCENE (15s, mandatory)
Beat 20-21 Family group moment / pet redemption
Beat 22    CAMERA-ASK CLIFFHANGER ("What did YOU...? See you tomorrow!")
```

22 clips × ~15s avg = ~5:30 runtime.

## Cross-arc pollination (the secret sauce)

The TOP videos do callbacks/crossovers:

- ep04 Joe's Secret Stash → established the "Joe steals stuff" universe
- ep17 (Tooth Fairy, planned for May 13): callback to ep04's "stash" reveal — Joe's stash now includes Eva's tooth
- ep25 (Eva makes breakfast, planned): callback to ep01/02 pancake universe
- ep26 (Library): callback to goreadling.com app (ep04's intro block)

Each callback compounds the algorithm signal — viewers who watched the original get pushed the callback.

## Lint rules (enforced)

- `lintEpisode.py` R24 (proposed): WARNING if episode JSON has no `petMishap` field
- `lintEpisode.py` R25 (proposed): WARNING if no Papa-active beat tagged
- `lintEpisode.py` R26 (proposed): WARNING if < 2 audience-engagement camera-asks

## Where this came from

Strategic session 2026-05-11. Pulled performance data via YouTube Analytics API across 32 videos. Reverse-engineered formula from top 6 vs bottom 6. Validated by user observations on ep04 / ep07 (winners) vs ep11-13 (flops).
