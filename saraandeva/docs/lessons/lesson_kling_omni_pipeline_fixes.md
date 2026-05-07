---
name: Kling Omni pipeline — submit / download / assembly fixes (post-ep03 → ep07)
description: Hard-won fixes for the Kling Omni production pipeline (submit, download, assemble, music-mix, YouTube upload). Each rule below addresses a distinct silent-failure mode. Baked into submitOmniClip.mjs / downloadOmniByPrompt.mjs / assembleEpisode.mjs / uploadEpisodeToSaraAndEva.mjs.
type: feedback
originSessionId: 0a33ed02-6e17-4cc8-9bd0-435d91636136
---
The Sara-and-Eva production pipeline went through ep03 → ep07 (April–May 2026). This file captures every load-bearing fix learned across those episodes. Don't relax any of these — each one represents credits burned or a publish-time embarrassment.

**Why:** The cost guard / upload pipeline can't detect most of these failure modes locally. Without these rules, ~30% of clips silent-fail at credit cap, render with wrong characters, get downloaded out of order, or publish with garbled text.

## Submission (submitOmniClip.mjs)

1. **Hard-reload `/app/omni/new` at the start of every submission.** Kling persists quality + duration across submissions; without reload the dropdown opener clicks the *currently displayed* label which may have changed. Hard reload resets to 1080p+5s defaults.

2. **Multi-opener dropdown candidates** — try `["5s","10s","15s"]` for duration, `["1080p","720p","540p"]` for quality. Whichever is currently displayed wins.

3. **Use `.option-tab-item.duration_N` direct-class click** (post-ep07) — the duration tabs are pre-rendered in DOM but with rect=0 (collapsed). Force-click by class works around the invisible-tab issue.

4. **Force the "All" library tab** — Characters/Scenes filters can hide newly-uploaded library elements. The All tab DOM is `<div class="selected"><span>All</span><span class="total-number">N</span></div>`. Click that, never Characters/Scenes specifically.

5. **Library element lookup with name variations + scroll fallback** — try kebab/Title/space/snake/UPPER variations of the tag name. If not found in viewport, scroll the panel before giving up.

6. **For `source: "upload"` use `waitForEvent('filechooser')`** (post-ep07) — Kling's "Image/Video → Image-Upload" triggers a native file picker. `setInputFiles` on the role=button div fails ("Node is not an HTMLInputElement"). The picker auto-binds the file with no name/save step.

7. **Prompt-verification guard before Generate** — read back the textbox content, verify length ≥85% of expected, last-50-chars matches, every quoted dialogue chunk present. Catches dropped @-chips that would otherwise spend credits.

8. **Each `@Tag` exactly once in the prompt** — repeated tags cause the clone bug (character renders twice). Submit script HARD-FAILS on this; don't relax.

9. **Library element names are user-defined; verify before writing specs** — `backyard` may not exist; could be `backyard-front` (driveway side) and `backyard-kitchen` (kitchen side). Always check actual library before writing scene tags.

10. **Silent credit-cap failure mode** — when Kling runs out mid-burst, the Generate click *log-succeeds* but no task queues. Submit script can't detect it locally; only IndexedDB cache (post-refresh) shows truth. After every batch verify queued count == submitted count.

## Download (downloadOmniByPrompt.mjs)

11. **CLEAR `request_data_cache → task-feeds` before reading** — Kling caches API responses by pageTime. Stale pages keep status=5 (rendering) entries forever even after they finish. Without clear, recently-completed renders are invisible.

12. **Scroll-to-fetch after cache clear** (post-ep07) — clear+reload alone often fetches only newest 20 tasks (page 1). Recent re-renders may be on later pagination pages. Scroll the task feed sidebar 6× to trigger pagination fetches.

13. **NEVER fall back to `/app/user-assets/materials`** — order is render-completion-time, not submission order. Breaks the numbered-clip mapping. IndexedDB-driven prompt-matching is the only reliable method.

14. **Match clips by normalized longest-common-prefix** — both `@Tag` references (in spec) and `Element1/2/3` references (in cached prompt) get normalized to `X` placeholder. Greedy-assign best pairs first. MIN_SCORE = 30; below that = silent-failed at credit cap.

15. **Prompt-matching limitation when prompts diverge across versions** (post-ep07) — when re-rendering a clip with a substantially different prompt, the OLD task may score higher on prefix-match than the NEW one. Mitigation: scroll-to-fetch (so newer tasks are loaded), and verify visually via frame sample after download. The user may need to manually download from Kling UI in edge cases.

## Recurring object + text rendering (Kling-side limits)

16. **Bind every recurring physical prop in Kling library.** Helmet, package, shoe, vehicle, coupon book, notepad — anything that appears in 2+ clips. Without binding, Kling redraws it differently each render (color, shape, sticker pattern drift). For ep07 the helmet looked different across clip_04a/b/c/05a until bound.

17. **Even bound text-prop elements get re-rendered with imperfect text** (post-ep07) — `@papa-notepad` was bound with perfect "VACUUM CLEANER?" text, but Kling rendered it as "Wac1wan cemler?". Native text rendering is unreliable even with bound elements.

18. **For pixel-perfect text, do POST-PROCESSING** (post-ep07) — overlay or replace the Kling-rendered visual with the original Nano Banana image via ffmpeg. Pattern: Ken-Burns slow zoom on the prop image (`zoompan` filter) + audio extracted from the rendered Kling clip. Replaces the visual entirely while keeping the dialogue audio.

19. **Anchor language explicitly in prompts** for any text in-frame: `English text only, large clear printed Roman alphabet, NO foreign characters`. Negative: `Cyrillic, Chinese characters, Korean, Japanese, Arabic, garbled letters, misspelled, scrambled letters`. Even with this, expect ~20-30% drift on text-heavy clips.

20. **Group nouns ("the family", "the kids", "everyone") spawn strangers** (post-ep07) — without bound element references, Kling improvises with stock characters. ep07 clip 8 ("Sara mid-hug with the family") rendered Sara with 4 random adults. Either bind every member, or don't mention them — the previous-clip context carries.

21. **Duplicate-character bug persists ~11%** even with per-character LEFT/RIGHT anchors. Mitigations: separate verbs per character (not "play together"), explicit different OBJECTS each holds, aggressive negative-prompt terms (`second eva, two eva, duplicate eva`). When it slips through anyway: re-submit with stronger anchors, don't try to fix in post.

## Assembly (assembleEpisode.mjs)

22. **Reusable assets convention** — generate intro/OUTRO/theme-song clips ONCE, save to `season_01/intro/` and `season_01/OUTRO/`. Episode `episode.json` declares `reuse.intro` + `reuse.outro` blocks. Saves ~315 cr per episode.

23. **`0_song.mp4` sort hack** (post-ep07) — assembleEpisode.mjs uses `parseInt(f) || Infinity` so files starting with `0` get parsed to 0 → JS truthy fallback to Infinity → sort LAST. Intentional, not a bug. The "Yeah!" finale must close the episode after the subscribe pair, so `0_song.mp4` lives in `OUTRO/` and sorts last via this trick. Don't "fix" it.

## Songs (Kling can't sing — use Suno)

24. **Kling Native Audio cannot reliably render songs.** Singing comes out flat, off-key, no real music. Theme songs / Mama songs / any musical number must be generated externally on Suno (or similar) and ffmpeg-mixed over Kling visuals.

25. **Audio mixing recipe** (post-ep07) — for clips with dialogue + Suno song background:
    ```
    [1:a]atrim=start=X:duration=N,asetpts=PTS-STARTPTS,volume=0.30[bg];
    [0:a]volume=1.4[fg];
    [fg][bg]amix=inputs=2:duration=first:dropout_transition=0[a]
    ```
    Dialogue at 1.4×, song at 0.30×. amix duration=first ensures clip length is preserved. For continuous song flow across multiple clips, pick sequential timestamps (e.g. 34-44s → 44-54s → 54-64s).

## YouTube upload (uploadEpisodeToSaraAndEva.mjs)

26. **Banner upload** — `channelBanners.insert` returns a URL. To apply: fetch existing `brandingSettings`, merge in `image.bannerExternalUrl`, send back the FULL object. Partial PATCH gets 400 "Required" because YouTube treats unsent fields as "clear them".

27. **`channelBanners.insert` API quirk** — googleapis Node lib's wrapper sometimes 400s. Direct HTTP POST to `/upload/youtube/v3/channelBanners/insert?uploadType=media` with `Content-Type: image/png` and binary body works.

28. **Made-for-Kids forced ON, default UNLISTED** — review-then-flip-to-PUBLIC flow. Pass `--privacy public` only when explicitly publishing.

## Operational gotchas

29. **macOS TCC blocks bash from reading `~/Desktop`** — even when Claude's Read tool can. If a user attaches a screenshot, ask them to drag it to `/Volumes/...` (not TCC-protected).

30. **Playwright 1.57 service-worker assertion** — `node_modules/playwright-core/lib/server/chromium/crBrowser.js` line ~147 crashes when attaching to Kling's service worker (no browserContextId). Hot-patch: skip context-less service_workers in `_onAttachedToTarget`. Re-apply after every `npm install`.
