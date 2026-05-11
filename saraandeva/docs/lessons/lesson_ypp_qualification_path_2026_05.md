---
name: YPP qualification path — what watch-hours actually count
description: YPP needs 4,000 VALID PUBLIC LONG-FORM watch hours in last 365 days. Shorts watch time DOESN'T count toward this threshold (separate 10M Shorts views path). Paid promotion hours take 30+ days to validate. Channel had 395 Analytics-API hours but only 8 valid YPP hours on May 11 — the gap is paid-but-not-yet-validated traffic. Strategy: long-form playlist-landing campaigns + organic episode cadence.
type: lesson
originSessionId: 2026-05-11-strategic-session
---
**The 4,000-hour gap discovery (2026-05-11):**

YouTube Studio's YPP eligibility page showed:
- Subscribers: 15,027 ✅ (over 1,000 threshold)
- **Valid public watch hours (last 365 days): 8 / 4,000** ❌

But YouTube Analytics API showed **395 watch hours** in last 28 days alone.

50× gap. The reason: **most of the 395 hours don't qualify for YPP**.

## What counts toward YPP's 4,000 hours

Per YouTube help docs (verified by the empirical 8-hour count):

✅ **Counts:**
- Long-form video watch time (>60 sec videos)
- Public, non-unlisted, non-private videos
- ORGANIC traffic (or paid traffic AFTER 30-90 day validation period)
- Real human watch sessions (not bots, not view-farms)

❌ **Doesn't count toward the 4,000 hours threshold:**
- Shorts watch time (separate 10M Shorts-views path)
- Private or unlisted video watch time
- Watch time from recent paid promotions (held in validation purgatory)
- Removed videos' watch time

## The two YPP paths (only need ONE)

**Path A: Long-form**
- 1,000 subscribers
- 4,000 valid public long-form watch hours in last 365 days

**Path B: Shorts**
- 1,000 subscribers
- 10M valid public Shorts views in last 90 days

Sara & Eva current state (May 11):
- 15,027 subs ✅
- 8 long-form valid hours / 4,000 = 0.2%
- 180 Shorts views / 10M = 0.002%

Both paths are blocked. Path A is the realistic one (organic long-form discovery scales; viral Shorts is luck).

## Why paid hours don't validate immediately

YouTube needs to verify paid traffic isn't bot-driven. Validation takes 30-90 days. The $1,500+ in paid promotion has generated paid watch hours that will eventually validate IF the algorithms judge them legitimate. Some never validate.

**Implication:** ad spend ≠ instant YPP. The campaigns running today (May 11) might not credit toward YPP until late June / July.

## The strategy

### Short-term (May-June)
1. **Maintain 2 watch-hour campaigns** (Joe Stash Short + ep14 Anniversary Short → playlist URL)
2. **Use playlist landing** (~90 min watch potential per click) — maximize per-click hours
3. **Don't expect YPP unlock from these alone** — let validation work in background

### Medium-term (June-August)
4. **Upload 3 episodes/week** organically (Wed/Fri/Sun cadence) — organic long-form is the fastest valid-hour pump
5. **Cross-link with playlists + end-screens** to keep viewers binging long-form
6. **Re-check YPP eligibility weekly** — Apply button will activate when threshold hits

### Long-term (90 days out)
7. **Re-evaluate** — if watch-hours haven't hit 4,000 by August, the organic engine isn't strong enough. Either:
   - Pivot to Shorts viral strategy (10M views path)
   - Increase ad spend significantly
   - Accept slower path

## Apply-button behavior

The "Apply now" button on Earn page is GREYED OUT until threshold met. YouTube won't accept early applications. Re-check weekly:
- Studio → Earn → Eligibility box
- Updates lag by 1-2 days vs reality

## Important: what unlocks WITHOUT YPP

Even without YPP, the following work:
- Custom thumbnails (verified)
- Channel watermark (set via API May 11)
- Playlists, channel sections, banner customization
- Studio Promotions (Quick Promote) — uses Google Ads under the hood, available without YPP

What requires YPP:
- Watch-page ad revenue ($$$)
- External Link element on end-screens (the goreadling.com link play)
- Channel memberships, Super Chat
- Shopping integration
- (Most ad-rev features)

## Caveat: Made-for-Kids monetization restrictions

Even AFTER YPP unlock, Made-for-Kids content has restricted monetization:
- No personalized ads (only contextual) — typically 30-50% lower CPM
- No memberships, Super Chat, etc.

So the strategy of flipping select episodes to NOT-MfK isn't just about end-screens — it's also about unlocking full ad revenue post-YPP.

## Lint rule

None directly — this is a channel-level state, not per-episode.

## Monitoring

Manual: Studio → Earn → Eligibility, check weekly.
Automated (TODO): Python script to pull YPP eligibility metric via Analytics API and alert when threshold crosses.

## Where this came from

Strategic session 2026-05-11. User asked "let's apply for YPP" — confidently expected to qualify based on Analytics API showing 395 hours. Eligibility page revealed 8 valid hours. Investigated the gap = paid validation lag + Shorts watch time not counting.
