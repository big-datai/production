/**
 * Playwright codegen recording v2 — Kling Omni mode, 2026-04-27.
 * Captured by user during Ep 3 prep (extended scenario).
 *
 * v2 adds the FULL scene-creation flow that was missing in v1:
 *   - Subject panel → Add Image menu → Uploads tab → pick → Confirm → name → Generate
 *   - User named scenes: dining-room, living-room, kids-bedroom, kitchen
 *   - Generate button lives in <footer> (role=contentinfo)
 *   - History button for previously-used elements
 *   - Element categories (Characters, Animals, Scenes)
 *   - VERIFIED COST: 45 credits for 5s + Native Audio ON, 90 for 10s + Native Audio ON
 *     → formula confirmed: 30 × ceil(durationSec/5) × 1.5
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: '/tmp/kling-storage.json' });
  const page = await context.newPage();

  await page.goto('https://kling.ai/app/video/new');
  await page.getByRole('link', { name: 'Omni' }).click();

  // ────── PROMPT TEXTBOX ──────
  await page.locator('#design-view-container').getByRole('textbox').click();

  // ────── BIND CHARACTERS (Library elements via avatar slots) ──────
  await page.locator('div:nth-child(3) > .avatar-section').click();
  await page.locator('.element-item > .avatar-section').first().click();
  await page.locator('div:nth-child(4) > .avatar-section').click();
  // ... more slots up to 6 chars (positional)
  await page.locator('div:nth-child(6) > .avatar-section').click();
  await page.locator('div:nth-child(8) > .avatar-section').click();

  // ────── ADD MORE FROM ELEMENT LIBRARY ──────
  await page.getByRole('button', { name: 'Add from Element Library' }).click();
  await page.locator('div:nth-child(5) > .subject-item > .cover').click();

  // ────── @-AUTOCOMPLETE TAG INSERTION ──────
  // Type "@" → dropdown opens → click item to insert chip
  // (Codegen shows the dropdown items as buttons)
  await page.getByRole('button', { name: 'Sara' }).click();
  await page.getByRole('button', { name: 'Eva' }).click();
  await page.getByRole('button', { name: 'Ginger' }).click();
  await page.getByRole('button', { name: 'Eva', exact: true }).click();

  // ────── ADD A NEW SCENE FROM UPLOADS (FULL FLOW) ──────
  // 1. Open subject/scene panel
  await page.locator('.subject-item').first().click();
  // 2. Click Add Image menu
  await page.getByRole('menuitem', { name: 'Add Image' }).click();
  // 3. Switch to Uploads tab (vs. Library or History)
  await page.getByText('Uploads').click();
  // 4. Pick an image from the upload list
  await page.locator('#panel-reference-upload-container > .container > .virtual-list-container > .virtual-list-content > div > .items-row > div > .image-item > .image-item-mask').first().click();
  // 5. Confirm selection
  await page.getByRole('button', { name: 'Confirm' }).click();
  // 6. Name the new element
  await page.getByRole('textbox', { name: 'Enter Name' }).click();
  await page.getByRole('textbox', { name: 'Enter Name' }).fill('dining-room');
  // 7. Generate (button in <footer>)
  await page.getByRole('contentinfo').getByRole('button', { name: 'Generate' }).click();

  // ────── HISTORY (re-pick previously used) ──────
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('menuitem', { name: 'Add Image' }).click();
  // ... select from history list

  // ────── ELEMENT CATEGORIES ──────
  await page.getByText('Animals').click();   // tab/category filter
  await page.getByText('Scenes').click();    // tab/category filter
  // (Plus default characters category — not visible but inferred)

  // ────── QUALITY + DURATION ──────
  await page.locator('div').filter({ hasText: /^1080p · 5s$/ }).first().click();
  await page.locator('#el-id-7056-265').getByText('720p').click();   // dynamic ID
  await page.locator('#el-id-7056-265').getByText('10s').click();

  // ────── REMOVE BOUND ELEMENT ──────
  await page.locator('div:nth-child(10) > .close').click();

  // ────── GENERATE ──────
  await page.getByRole('contentinfo').getByRole('button', { name: 'Generate' }).click();

  await context.close();
  await browser.close();
})();

/* ─── ANALYSIS v2 ────────────────────────────────────────────────────────────

VERIFIED FACTS (from this codegen + user confirmation)
─────────────────────────────────────────────────────

1. CREDIT COST
   - 5s + Native Audio ON  = 45 credits   (= 30 × 1 × 1.5)
   - 10s + Native Audio ON = 90 credits   (= 30 × 2 × 1.5)
   - Formula:    expectedCredits = 30 * Math.ceil(durationSec / 5) * (nativeAudio ? 1.5 : 1)
   - Native Audio toggle exists & defaults ON for SaraAndEva account.

2. BIND CAP
   - 7 bound elements per clip max (user verified: 6 chars + 1 scene works).

3. NEW ELEMENT CREATION FLOW (uploads)
   - Click .subject-item → menuitem 'Add Image' → 'Uploads' tab → pick image
     → Confirm → name in 'Enter Name' textbox → Generate.
   - Element category tabs visible: Characters, Animals, Scenes, Uploads, History.
   - History tab lists prior session uploads/picks (great for reuse).

4. GENERATE BUTTON LOCATION
   - Inside <footer> (role=contentinfo).
   - Selector: page.getByRole('contentinfo').getByRole('button', { name: 'Generate' })
   - Plain `getByRole('button', { name: 'Generate' })` may also match other Generate
     buttons inside the element-creation modal — prefer the contentinfo-scoped one
     to avoid mis-clicks.

5. NAMED ELEMENT TEXTBOX
   - getByRole('textbox', { name: 'Enter Name' })
   - Names allowed: lowercase, hyphens (user used dining-room, living-room, etc.)
   - These names auto-feed the @-autocomplete dropdown after creation.

6. UPLOADS PANEL VIRTUAL LIST
   - #panel-reference-upload-container > .container > .virtual-list-container
   - Items: .virtual-list-content > div > .items-row > div > .image-item
   - Click `.image-item-mask` or `.image-item-source` (both work).

DRAFT submitOmniClip.mjs FLOW (locked enough to start writing)
──────────────────────────────────────────────────────────────

Per clip JSON spec:
{
  "mode": "omni",
  "durationSec": 10,                   // default for Ep 3+
  "quality": "720p",                   // default — must override the 1080p Omni default
  "nativeAudio": true,                 // SaraAndEva default
  "expectedCredits": 90,               // computed from formula
  "boundElements": [
    { "tag": "Sara",        "source": "library" },
    { "tag": "Eva",         "source": "library" },
    { "tag": "Ginger",      "source": "library" },
    { "tag": "Joe",         "source": "library" },
    { "tag": "Mama",        "source": "library" },     // after lowercase fix
    { "tag": "Kitchen",     "source": "upload",
      "file": "assets/characters/saraandeva/scenes/kitchen_morning.png" }
  ],
  "prompt": "Wide shot in @Kitchen. @Sara and @Eva walk in...",
  "negativePrompt": "..."
}

Programmatic flow:
1. await page.goto('https://kling.ai/app/video/new')
2. await page.getByRole('link', { name: 'Omni' }).click()
3. For each boundElement.source === "library":
     a. await page.getByRole('button', { name: 'Add from Element Library' }).click()
     b. find element by name (need to discover the name-search selector — likely a
        text-input inside the library modal; iterate during first dry run)
     c. click matching cover
4. For each boundElement.source === "upload":
     a. await page.locator('.subject-item').first().click() — open upload panel
     b. await page.getByRole('menuitem', { name: 'Add Image' }).click()
     c. await page.getByText('Uploads').click()
     d. setInputFiles(file) — but uploads list shows already-uploaded; need to upload
        first via separate file picker. (Verify on first run.)
     e. .image-item-mask click → getByRole('button',{name:'Confirm'}).click()
     f. textbox 'Enter Name' .fill(tag)
5. Type prompt: split by @-pattern, type prefix, type '@', wait 300ms,
   click button by tag name, type next prefix, etc.
6. Quality dropdown: click div with text '1080p · 5s' → click '720p' → re-open → click '10s'
7. Assert credit cost on Generate button:
     const txt = await page.getByRole('contentinfo').getByRole('button', { name: /Generate/ }).innerText()
     const cost = Number(txt.match(/\d+/)[0])
     assert(cost === expectedCredits)
8. Click Generate.

OPEN ITEMS (resolve at first dry run):
- [ ] How to find a Library element by name (search input vs. scroll-and-click)?
- [ ] Does setting a scene element auto-add it to @-autocomplete? (Probably yes since user
      named them and the prompt resolved @Kitchen successfully in v1 codegen.)
- [ ] Does Native Audio toggle have a programmatic check? Need to inspect DOM.
─────────────────────────────────────────────────────────────────────────── */
