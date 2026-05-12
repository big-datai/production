/**
 * Playwright codegen recording — Kling Omni mode, 2026-04-27.
 * Captured by user during Ep 3 prep. Reference for submitOmniClip.mjs.
 *
 * Key discoveries (see analysis at bottom of file).
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: '/tmp/kling-storage.json' });
  const page = await context.newPage();

  await page.goto('https://kling.ai/app/video/new');

  // ✅ ENTER OMNI MODE — it's a LINK not a button
  await page.getByRole('link', { name: 'Omni' }).click();

  // Click into prompt textbox
  await page.locator('#design-view-container').getByRole('textbox').click();

  // ✅ ADD CHARACTERS via avatar-section slots (side panel)
  // Each character/element has its own div slot with .avatar-section inside.
  await page.locator('div:nth-child(3) > .avatar-section').click();   // bind char #1 (Sara)
  await page.locator('.element-item > .avatar-section').first().click();
  await page.locator('div:nth-child(4) > .avatar-section').click();   // bind char #2 (Eva)
  await page.locator('div:nth-child(6) > .avatar-section').click();   // bind char #3 (Ginger or Mama? slot 6)
  await page.locator('div:nth-child(8) > .avatar-section').click();   // bind char #4 (Joe? slot 8)

  // ✅ ADD FROM ELEMENT LIBRARY (for additional pre-saved characters)
  await page.getByRole('button', { name: 'Add from Element Library' }).click();
  await page.locator('div:nth-child(5) > .subject-item > .cover').click();

  // ✅ TAG INSERTION via @-AUTOCOMPLETE
  // Typing "@" in the prompt opens a dropdown of bound elements.
  // Click the dropdown item to insert a chip (not literal text).
  // Available tags in user's library: Sara, Eva, Ginger, Joe, mama, Papa, Grandma
  await page.getByRole('button', { name: 'Sara' }).click();      // dropdown item
  await page.getByRole('button', { name: 'Eva' }).click();
  await page.getByRole('button', { name: 'Ginger' }).click();
  await page.getByRole('button', { name: 'Eva', exact: true }).click();

  // ✅ ADD SCENE REFERENCE (separate from character refs)
  await page.locator('a').filter({ hasText: 'Image/Video' }).click();
  await page.getByText('Image-Upload').click();
  await page.getByRole('button', { name: 'Image/Video' }).setInputFiles('dining_room.png');
  await page.locator('div:nth-child(10) > .image-and-label-container > img').click();

  // ✅ REMOVE A BOUND ELEMENT
  await page.locator('div:nth-child(10) > .close').click();

  // ✅ QUALITY + DURATION SELECTOR
  // Default in Omni is 1080p · 5s (NEW DEFAULT — was 720p · 5s in single-shot mode!)
  await page.locator('div').filter({ hasText: /^1080p · 5s$/ }).first().click();   // open dropdown
  await page.locator('#el-id-7056-265').getByText('720p').click();                  // dynamic ID — needs alt
  await page.locator('#el-id-7056-265').getByText('10s').click();

  // ✅ GENERATE
  await page.getByRole('button', { name: 'Generate' }).click();

  await context.close();
  await browser.close();
})();

/* ─── ANALYSIS ──────────────────────────────────────────────────────────────

KEY FINDINGS FROM CODEGEN
─────────────────────────

1. OMNI ENTRY
   - Selector:  getByRole('link', { name: 'Omni' })
   - It's a <a> link, NOT a button. Don't use getByRole('button').

2. NEW DEFAULTS
   - 1080p · 5s (was 720p · 5s in Custom Single-Shot)
   - For credit parity with old pipeline, still pick 720p.
   - DURATION OPTIONS confirmed include 5s and 10s. (10s = 2× credits.)

3. TAG INSERTION CHANGED
   - OLD pipeline (Custom Single-Shot/Multi-Shot): literal "@Sara" text in prompt.
   - NEW (Omni): TYPE `@` → autocomplete dropdown opens → CLICK item → inserts a chip.
   - The textarea shows plain "Sara" without the @ prefix after insertion.
   - Programmatic insert pattern:
       await textbox.type('@');
       await page.waitForTimeout(300);  // dropdown render
       await page.getByRole('button', { name: tagName }).click();
   - This is a MAJOR difference — submitOmniClip.mjs must parse @-tags from the
     spec prompt and substitute the autocomplete clicks at each location.

4. AVAILABLE BOUND ELEMENTS (user's Kling library as of 2026-04-27)
   - Sara, Eva, Ginger, Joe, mama (lowercase), Papa, Grandma
   - Note inconsistent casing: "mama" lowercase but "Papa", "Grandma" uppercase.
     Worth normalizing in Kling library for predictable autocomplete.

5. ELEMENT BINDING SLOTS
   - Side panel uses `div:nth-child(N) > .avatar-section` pattern.
   - Indexing is positional in the DOM — fragile if Kling reorders.
   - Better: use Element Library "Add" → click cover by name attribute or alt text.
   - Verified path: getByRole('button', { name: 'Add from Element Library' })
                    → .subject-item > .cover (positional)
   - Reuse pattern: search library by name, click matching cover.

6. SCENE vs CHARACTER REFERENCES
   - Two separate input modes:
     a) "Element Library" — pre-saved characters (Sara, Eva, etc.).
     b) "Image/Video" → "Image-Upload" — for ad-hoc scene PNGs.
   - Scenes don't get an autocomplete tag the same way characters do.
     Need to verify: do uploaded scene images get auto-tagged by filename?

7. REMOVAL
   - Each bound tile has a .close button: `div:nth-child(N) > .close`

8. DYNAMIC IDs (FRAGILE)
   - Quality dropdown uses #el-id-7056-265 — auto-generated, will change per session.
   - Must locate dropdown by container text instead:
       page.locator('div').filter({ hasText: /^1080p · 5s$/ }).first()
     then drill into options by visible text.

9. WHAT WE STILL DON'T KNOW
   - [ ] Hard cap on # of bound elements? (User attempted to test 7+; codegen shows
         slots 3, 4, 6, 8 used → at least 4 elements. Need to verify max=7.)
   - [ ] Native Audio toggle location in Omni mode (not visible in this codegen).
         Hypothesis: stays per-session like before; default ON for SaraAndEva account.
   - [ ] Credit cost display for 10s + Native Audio ON (should be 90 if our math holds).
   - [ ] Whether scene references (uploaded PNGs) auto-resolve to @-tags or
         get implicitly applied to all shots.

NEXT-STEP RECOMMENDATIONS FOR submitOmniClip.mjs
───────────────────────────────────────────────
- New schema field per clip:  "mode": "omni"   (vs. "single-shot")
- Per-clip:
    boundElements: [
      { tag: "Sara", source: "library" },
      { tag: "Eva", source: "library" },
      { tag: "Ginger", source: "library" },
      { tag: "Joe", source: "library" },
      { tag: "Kitchen", source: "upload", file: "scenes/kitchen_morning.png" }
    ]
    durationSec: 10
    quality: "720p"
    nativeAudio: true
- Submission flow:
    1. Navigate /app/video/new
    2. Click 'Omni' link
    3. For each library element: open library → click matching cover
    4. For each upload element: switch to Image/Video → upload → set name
    5. Set quality 720p, duration 10s
    6. Type prompt with @-autocomplete: split prompt by @-pattern, type prefix,
       insert @, wait for dropdown, click matching button by name, continue.
    7. Verify Native Audio still ON (programmatic check)
    8. Read credit cost from Generate button text → assert == 90
    9. Click Generate
─────────────────────────────────────────────────────────────────────────── */
