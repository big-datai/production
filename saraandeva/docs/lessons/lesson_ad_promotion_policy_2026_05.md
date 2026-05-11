---
name: Studio Quick Promote / Google Ads policy rules — what flags "Active (limited)"
description: Empirically verified ad-copy policy bans on 2026-05-11. Medal emojis 🥇🥈🥉 + ALL CAPS words + emoji-at-start all trigger partial-disapproval ("Active (limited)") on YouTube Studio Promotions. Ad-safe titles need a separate metadata field. EU political ads radio must be set to NO.
type: lesson
originSessionId: 2026-05-11-strategic-session
---
**The pattern:** YouTube Studio Promotions auto-pulls ad headlines from your video title. If anything in the title violates Google Ads policy, the campaign goes to "Active (limited)" — meaning it serves in some placements but not others (you lose reach + waste budget on partial CPM).

Hard-bans verified by triggering the policy 2x today:

## Banned in ad headlines

| What | Example | Fix |
|---|---|---|
| **Medal emojis** | 🥇 🥈 🥉 | Drop them; use ⭐ ✨ or none |
| **ALL CAPS words** | "1 HOUR", "BIG SURPRISE", "ALL EPISODES" | Lowercase or Title Case |
| **Emoji at start** | "📺 Watch all episodes..." | Move emoji to end OR drop |
| **Excessive punctuation** | "!!!", "???" | Single "!" or "?" max |
| **Excessive capitalization** | "WATCH ALL SARA AND EVA EPISODES" | Title Case |

## Safe in ad headlines

- "&" in brand name (Sara & Eva)
- Em-dash (—) between phrases
- Single "!" at end
- Single emoji at end (NOT a medal)
- Title Case throughout
- ASCII characters universally

## The two-version solution

Every video needs TWO title variants in metadata:

```json
{
  "title": "The Tooth Fairy's Big Mistake! 🦷 Sara and Eva",
  "youtubeMetadata": {
    "title": "The Tooth Fairy's Big Mistake! 🦷 Sara and Eva",
    "adSafeTitle": "Tooth Fairy and a Sneaky Dog Sara and Eva Story for Kids",
    "adSafeDescription": "Family animated series. Watch every episode in one place."
  }
}
```

When creating a promotion, ALWAYS override the auto-pulled fields with `adSafeTitle` + `adSafeDescription` — even if the source title is clean, the description auto-pull will include hashtags + emoji from the video description that may flag.

## Override-fields workflow in Studio Promote

1. Create promotion → pick video
2. Click **"Edit promotion headline and description (optional)"** to expand
3. Paste `adSafeTitle` into Promotion headline
4. Paste `adSafeDescription` into Promotion description
5. CTA: pick "Watch now" (NOT "Visit site" if landing is a video)
6. **EU political ads: select "No"** ← critical, default may be unselected which excludes EU markets
7. Save → review takes 2-48h

## EU political ads radio (don't miss this)

Every promotion has a "European Union political ads — Yes/No" question. If left unselected OR set to Yes → promotion can't run in EU at all (loses ~20% of reach).

**Always answer NO.** Sara & Eva is family animation, not political content.

## The "Active (limited)" recovery flow

If a campaign gets policy-flagged:

1. Open promotion → Status: Active (limited)
2. Click "See details" → identifies specific violations
3. Edit headline + description fields with clean override copy
4. Save → re-review starts (2-48h)
5. Status moves: Active (limited) → Pending → Active

**Don't just click Save without changing fields** — Studio re-submits the same flagged copy → same verdict.

## Verified triggers (this session, 2026-05-11)

| Headline | Verdict |
|---|---|
| `🥈 1 HOUR of Sara & Eva 🎬` | ❌ Flagged: medal emoji + ALL CAPS |
| `Watch all Sara & Eva episodes` | ✅ Approved (Pending → Active) |
| `Watch ALL Sara & Eva episodes 💕` | ⚠️ Flagged on prior trigger (ALL caps) |
| `10 Years of Love Sara Eva Ep 14 Shorts` (auto-pulled from title) | ⚠️ Flagged (pulled in 📺 + ALL from description) |

## Description sanity rules

The 70-char promotion description field also auto-pulls from video description. To prevent pulling problematic phrases:

1. Keep video descriptions clean of medal emojis everywhere (lint R23)
2. Don't lead descriptions with "📺 Watch ALL..." (was the cause of 17 simultaneous Active-limited flags). Use "Watch all..." instead.
3. Override per-promotion when launching new campaigns.

## YouTube URL as Website-visit landing (works!)

Verified 2026-05-11: `youtube.com/watch?v=<videoId>` IS accepted as a valid Website-visit destination. This unlocks paid Short → Main funneling. Use this for watch-hour campaigns.

Format that works: `youtu.be/<videoId>` or `www.youtube.com/watch?v=<videoId>` or `www.youtube.com/watch?v=<videoId>&list=<playlistId>` (playlist auto-play landing = ~90 min watch potential).

## Where this came from

Strategic session 2026-05-11. Created Website-visits promotion with headline `🥈 1 HOUR of Sara & Eva 🎬` — flagged. Diagnosed via "See details" — medal + caps. Replaced with `Watch all Sara & Eva episodes` + `Family animated series. Watch every episode in one place.` → approved. Replicated for other policy-blocked campaigns.
