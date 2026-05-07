---
name: when scraping a SPA, check the data layer before the DOM
description: Lost ~2 weeks fighting Kling's UI when the answer was in IndexedDB the whole time
type: methodology
originSessionId: 91221868-87c2-4813-aab7-e10a3e2ec0ec
---
**The mistake:** spent multiple sessions trying to download rendered Kling clips by automating the UI — DOM scraping, materials-page bulk download, thumbnail-strip iteration, detail-panel click loops, screenshot-then-click. All of it brittle, all of it flaky, none of it shipping reliably.

**The actual answer (discovered via the Claude-in-Chrome extension on 2026-04-29):** Kling caches the entire work feed in `request_data_cache` → `task-feeds` IndexedDB store. Every task has the full prompt and the direct CDN mp4 URL. One IndexedDB read returns 60 cached tasks; map them to specs via fingerprint substring; `curl` the URLs directly. End-to-end download of an 18-clip episode in seconds. **No UI automation at all.**

**The lesson, generalized:** when you need data the page has already loaded, check the data layer FIRST:

1. **IndexedDB** — open DevTools → Application → IndexedDB → expand databases. Modern SPAs cache server JSON here by default. Always look here first.
2. **localStorage / sessionStorage** — for smaller blobs (auth tokens, user prefs, recent items).
3. **Network tab** — find the XHR that loaded the data. The endpoint + auth header is reusable; you can hit it directly.
4. **Framework state** — Vue/React devtools expose component state, often with the same JSON.
5. **Static HTML** — last resort. SPAs render almost everything client-side from data fetched separately, so the static HTML is usually a shell.

Only AFTER none of these have what you need should you reach for UI automation (Playwright clicks, scrolls, waits). UI automation is the most brittle option — selectors break, virtualization hides items, click handlers depend on focus state, and you fight a moving target.

**Why I missed it for so long:** my mental model was "scrape what the user sees." That's wrong for SPAs. The right model is "the page is a view of an underlying data store; find the store." The Chrome extension prompt didn't impose my UI-first frame, so it found the store on the first try.

**For Kling specifically:** the `_download_via_indexeddb.mjs` script in `saraandeva-episode/scripts/` is the canonical bulk-download path. Don't go back to UI scraping unless the IndexedDB schema changes.

**For ANY web app I'll scrape in the future:** start with `await page.evaluate(async () => { const r = indexedDB.databases ? await indexedDB.databases() : []; return r; })` to enumerate IDB stores. If anything looks promising, query it before touching the DOM.
