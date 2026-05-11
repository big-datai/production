# Title Template — Quick Reference Card

**Last updated:** 2026-05-11

For full strategic reasoning see `saraandeva/docs/lessons/lesson_title_seo_formula_2026_05.md`.

## The formula

```
[Primary Keyword] [Curiosity Hook] | Sara and Eva [SEO Descriptor]
```

| Component | Char budget | Examples |
|---|---|---|
| Primary Keyword | 10-25 chars | "Tooth Fairy" / "First Day of School" / "Father's Day" |
| Curiosity Hook | 15-30 chars | "and a Sneaky Dog!" / "Won't Believe What Happens!" / "Will She Score?!" |
| Brand | "Sara and Eva" (10 chars) | (fixed) |
| SEO Descriptor | 10-25 chars | "Story for Kids" / "Family Cartoon" / "for Toddlers" |

**Total title: target 60-90 chars, hard cap 100.**

## 5 worked examples

```
Tooth Fairy and a Sneaky Dog! 🦷 Sara and Eva Story for Kids
Magic Forest Hidden Friend! 🌲 Sara and Eva Family Adventure
Eva's First Soccer Game — Will She SCORE?! ⚽ Sara and Eva Story for Kids
Sara and Eva's BIG Father's Day Surprise! 💝 Family Story for Kids
Birthday Cake Disaster! 🎂 Sara and Eva Family Story for Kids
```

## DON'T

❌ "Sara and Eva — Ep 17: The Tooth Fairy's Mistake" (Ep N wastes chars + buries keyword)
❌ "Episode 17: Father's Day Special" (no SEO hook)
❌ "🥈 The BEST Father's Day Story!" (medal emoji + ALL CAPS = ad-flagged)
❌ "📺 Watch all Sara & Eva episodes!" (emoji at start = ad-flagged)

## Two metadata fields needed

Every episode JSON needs both:

```json
"youtubeMetadata": {
  "title":         "Tooth Fairy and a Sneaky Dog! 🦷 Sara and Eva Story for Kids",
  "adSafeTitle":   "Tooth Fairy and a Sneaky Dog Sara and Eva Story for Kids"
}
```

`title` is what gets uploaded. `adSafeTitle` is what gets pasted into Studio Promotion Headline override field (no emojis, no caps abuse, no medals).

## Description first line (the SEO frontload)

YouTube reads the first ~150 chars heavily. Pattern:

```
[Primary Keyword] [hook] for kids! [Setup sentence with secondary keyword].

Watch all Sara & Eva episodes in order: https://www.youtube.com/playlist?list=PLMLz_1vaheL7MwZ8OdmSPd1qftZ_WRwvS

Episode N of Season 1.
```

Episode number lives HERE (not in title).

## Tags strategy (15-25 per video)

| Bucket | Examples |
|---|---|
| Brand | `sara and eva`, `sara eva cartoon`, `sara and eva story` |
| High-volume topic | `tooth fairy`, `kids story`, `family cartoon`, `puppy story` |
| Long-tail | `first lost tooth story`, `kids dentist story`, `family animation` |
| Competitor-adjacent (rides their suggested feed) | `like nastya`, `vlad and niki`, `bluey`, `cocomelon` |

## Lint enforcement

`lintEpisode.py` checks:
- R17 (WARN): title contains "Ep N" or "Episode N"
- R18 (WARN): title doesn't start with a high-volume keyword
- R21 (ERR): title exceeds 100 chars
