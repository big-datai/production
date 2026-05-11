---
name: YouTube title SEO formula — keyword-first, drop "Ep N", Sara and Eva at end
description: Top kid channels (Like Nastya, Vlad & Niki, Cocomelon, Diana & Roma) DO NOT use "Episode N" in titles. They lead with high-search keywords. New title pattern: `[Primary Keyword] [Curiosity Hook] | Sara and Eva [SEO Descriptor]`. Episode number stays in description, never in title.
type: lesson
originSessionId: 2026-05-11-strategic-session
---
**Why this matters (the data):**

YouTube search-bar autocomplete shows kids/parents type things like "tooth fairy kids story" or "dentist for kids" — they NEVER type "Episode 17". Putting "Ep N" in the title:
1. **Wastes precious title characters** (100-char limit)
2. **Implies you missed 16 previous** → click hesitation for new viewers
3. **Loses SEO matching** — algorithm ranks by keyword density, not episode number
4. **Lower CTR** — numbers feel less compelling than action verbs

None of the top kids channels use "Ep N":
| Channel | Title format |
|---|---|
| Like Nastya (100M+) | "Nastya pretends to be a doctor with toys" |
| Vlad & Niki (100M+) | "Vlad and Niki found a treasure" |
| Cocomelon (170M+) | "Doctor Checkup Song" |
| Diana & Roma (100M+) | "Roma Sleepy Story for Kids" |

## The formula

```
[Primary Keyword] [Curiosity Hook] | Sara and Eva [SEO Descriptor]
```

| Component | Purpose | Examples |
|---|---|---|
| **Primary Keyword** | search-volume capture | Tooth Fairy / Dentist / First Day / Father's Day / Magic Forest |
| **Curiosity Hook** | CTR juice | "and a Sneaky Dog!" / "Won't Believe What Happens!" / "Will She Score?!" |
| **Brand** | recognition + branded-search | "Sara and Eva" |
| **SEO Descriptor** | long-tail capture | "Story for Kids" / "Family Cartoon" / "for Toddlers" |

## Worked examples

| ❌ Old format | ✅ New format |
|---|---|
| Sara and Eva 🦷 Ep 17: The Tooth Fairy's Mistake! | The Tooth Fairy's Big Mistake! 🦷 Sara and Eva (Lost Tooth Story for Kids) |
| Sara and Eva — Ep 18: Magic Forest Pt 3 | Magic Forest Hidden Friend! Sara and Eva Family Adventure |
| Sara and Eva — Ep 19: First Soccer Game | Eva's First Soccer Game — Will She Score?! Sara and Eva Story for Kids |
| Sara and Eva — Ep 20: Birthday Cake | Birthday Cake Disaster! Sara and Eva Family Story for Kids |
| Sara and Eva — Ep 30: Father's Day Surprise! 💝 | Sara and Eva's BIG Father's Day Surprise! Family Story for Kids |

## Character budget

- **Title limit (YouTube hard cap):** 100 chars
- **Useful range:** 60-90 chars (everything fits in mobile view + still reads well)
- **Description first line (the "above the fold" SEO line, where keywords matter MOST):** ~150 chars
- **Episode number:** lives in description body, NOT title

## Where the episode number goes (the loyal-fans accommodation)

Don't lose chronology — just move it. In every video description:

```
The Tooth Fairy's Big Mistake! Sara and Eva Story for Kids

Eva loses her FIRST tooth and Joe has a sneaky surprise! The whole family solves the mystery.

Watch all Sara & Eva episodes in order: https://www.youtube.com/playlist?list=PLMLz_1vaheL7MwZ8OdmSPd1qftZ_WRwvS

Episode 16 of Season 1.
```

Loyal binge-watchers see the episode # in description; new viewers see the keyword-first title in search. Both audiences served.

## Lint rule (enforced)

`lintEpisode.py` R17: title containing `Ep N`, `Ep.N`, or `Episode N` triggers WARNING with suggested rewrite.

## Where this came from

Strategic session 2026-05-11 — user asked "competitors don't do episode should we stop calling episodes?" Researched top kid channels, confirmed none use Ep N. Rewrote ep16-ep30 1-month publishing calendar with new format.

## Companion lessons

- `reference_youtube_kids_search_keywords_2026.md` — high-volume keyword list for picking [Primary Keyword]
- `lesson_ad_promotion_policy_2026_05.md` — ad-safe title variants (no emoji/caps for promoted versions)
