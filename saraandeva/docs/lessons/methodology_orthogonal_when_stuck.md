---
name: when stuck, try orthogonal approaches — not variations of the same one
description: Burned ~2 weeks on the Kling download because I kept trying UI-automation variants. Should have rotated approach categories after 2-3 failures.
type: methodology
originSessionId: 91221868-87c2-4813-aab7-e10a3e2ec0ec
---
**The failure pattern:** during the Kling download work, I tried, in sequence:

1. DOM scrape of static HTML
2. Materials-page bulk download
3. Strip thumbnail iteration via `nth(N)` selectors
4. Strip thumbnail iteration via `getByRole('img', { name: 'Thumbnail' })`
5. Detail panel click loop with `.back-icon` close
6. ArrowRight keyboard navigation
7. Click + screenshot per iteration to verify

**Every single one of those is a variation of "automate the UI."** When attempt 1 failed, I tweaked it. When attempt 2 failed, I tweaked it again. I never stepped back and asked *should I be in this category at all?*

The Chrome extension solved it on attempt 1 because its prompt-to-action mapping wasn't anchored to UI scraping. It just asked: *where does the data live?* → IndexedDB. Done.

**The discipline I should run when stuck:**

> After **2-3 failed attempts in the same category**, force a rotation to a different category before trying any more variations.

Categories to rotate through, ordered roughly by ease:

1. **Data layer** — IndexedDB, localStorage, sessionStorage, framework state (Vue/React/Svelte stores)
2. **Network layer** — intercept XHR/fetch responses, replay calls with cookies, find unauthenticated endpoints
3. **File system** — does the app cache files locally? Service worker cache? Browser disk cache?
4. **API reverse-engineering** — find the backend endpoint. Often there's a public/semi-public API the frontend calls.
5. **UI automation** — clicks, scrolls, keyboard, screenshot-driven loops
6. **Different tool entirely** — different MCP, browser extension, OS-level recorder, manual user step

Most of my Kling time was spent in category 5 with brief touches of category 1 (the static HTML dump). I never seriously tried 2, 3, or 4. I should have.

**The trigger to rotate:** *if my next attempt looks like "this time with a different selector / longer wait / different button," I'm in the same category and should switch instead.*

**Why this happens:** I anchor on the first frame I form. The first frame for Kling was "the user clicks tiles, so I should automate clicks." That frame trapped me. Frames are useful for fast progress, but when they fail repeatedly, the failure IS evidence the frame is wrong — not evidence I need to tweak harder within it.

**Procedural rule:** when an approach fails, before retrying, write down the CATEGORY of approach (one of the six above). If I've tried 2-3 things in the same category, I'm forbidden from another variation; I have to draft a one-liner for each of the OTHER five categories and pick whichever has the highest expected information value, even if it feels less direct.

**This is meta to all problem-solving, not just web scraping** — covers debugging code, finding files, optimizing queries, fixing UI bugs, anything where I might keep trying tweaks instead of changing approach.
