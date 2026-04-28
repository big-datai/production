---
name: publish-story
description: 'End-to-end story publishing pipeline for GoReadling. Chains: story text generation, multi-voice podcast, Kling-animated video, YouTube upload, Firestore seeding, and website publishing — all from a single story title. Use this skill whenever the user wants to publish a story, create a new episode, run the full pipeline, generate and upload a story, or says anything like "publish", "new story", "create episode", "run the pipeline", or "ship a story". Also triggers for partial runs like "just generate the podcast" or "make the video for X".'
argument-hint: '"Story Title" [--skip-upload] [--from-step N] [--force]'
---

# Publish Story — Full Pipeline

Takes a story from idea to published (Spotify + YouTube + Firestore + website) in one flow. The pipeline has natural pause points — especially after Kling clip submission, since rendering takes minutes. Claude should run each phase, confirm success, then continue. **Spotify is published BEFORE YouTube.**

## NEVER DELETE WORKING FILES TO REGENERATE

**HARD RULE: ALWAYS ask the user before deleting OR removing ANY file — ANYWHERE on the filesystem, including temp folders, validation folders, and backup folders. Never use `rm`, `rm -f`, `rm -rf`, or overwrite files without explicit user permission. This applies to ALL locations, not just the main exports directory. Explain what you want to delete and why, wait for explicit "yes".**

**HARD RULE: NEVER delete existing MP3s, MP4s, or cached PCMs to "rebuild" them.** TTS calls are expensive and take hours. If you need to modify audio (trim intro, change volume, etc.), use ffmpeg to edit the existing file:

```bash
# Trim first 21 seconds from MP3:
ffmpeg -y -i input.mp3 -ss 21 -c copy output.mp3

# Move intro to middle of MP3:
ffmpeg -y -i input.mp3 -ss 21 -c copy body.mp3  # story without intro
ffmpeg -y -i input.mp3 -t 21 -c copy intro.mp3   # just the intro
# Then concat: body first half + intro + body second half

# Swap audio in MP4:
ffmpeg -y -i video.mp4 -i new_audio.mp3 -map 0:v -map 1:a -c:v copy -c:a aac output.mp4
```

**This costs 0 API calls and takes seconds.** Deleting and regenerating costs hundreds of API calls and takes hours. ALWAYS edit existing files, NEVER regenerate.

## STOP-ON-FAILURE RULE

**After EVERY step**, check the output for errors (`❌`, `FAILED`, `Error`, non-zero exit code, missing expected output files). If anything critical fails, **STOP the pipeline immediately** and:
1. **Read the error log** — find the exact page, segment, and error message
2. **Diagnose the root cause** — is it bad text, API issue, path bug, or quota?
3. **Fix the cause** — edit the translation JSON, fix the script, or wait for quota reset
4. **THEN retry** — never blindly resubmit without understanding why it failed

Do NOT continue to the next step with broken or missing output. Critical failures include:
- Story text generation fails or produces 0 pages
- `character_desc.json` not created (all voices fall back to same default — bad podcast)
- Podcast MP3 not created or has 0 duration
- Illustrations not generated or `kling_clips.json` missing
- Kling batch submission aborts (credit mismatch, cookie expiry, selector failure)
- Video assembly produces no MP4 or MP4 duration is wrong
- Subtitle generation fails (no .srt file)
- YouTube upload fails
- Firestore seed fails

## Arguments

- **Story title** (required): e.g., `"The Steadfast Tin Soldier"`
- **`--skip-upload`**: Stop after video assembly. Skip YouTube upload and Firestore seeding.
- **`--from-step N`**: Resume from step N (useful after Kling clips finish rendering). Steps are numbered 1-9 below.

## Environment

- **Project root**: `/Volumes/Samsung500/goreadling`
- **Content scripts**: `content/` directory (NOT `scripts/`)
- **Node**: `/usr/local/bin/node`
- **ffmpeg**: `/usr/local/bin/ffmpeg`
- **Kling cookies**: `/tmp/kling-storage.json`
- **Output**: `exports/stories/<SafeTitle>_MMDDYYYY/` with subdirs `spotify/`, `youtube/`, `text/`
- **Story constants**: `content/podcast/podcastStoryConstants.js`
- **Marketing metadata**: `exports/stories/YOUTUBE_MARKETING.md`, `exports/stories/SPOTIFY_MARKETING.md`
- **Spotify cookies**: `/tmp/spotify-storage.json`

Always run commands from the project root (`/Volumes/Samsung500/goreadling`).

## The Pipeline

### Phase 1: Story Text + Characters + Podcast + Illustrations (Steps 1-6)

**All handled by `dailyStory.mjs` in one run:**

```bash
cd /Volumes/Samsung500/goreadling
/usr/local/bin/node content/dailyStory.mjs --title "<Story Title>" --skip-seed --skip-index
```

This runs the full automated pipeline in order:
1. **Generate story idea** (title + synopsis) — or uses `--title` if provided
2. **Generate 25-page story text** in structured multi-voice segment format
3. **Append to podcastStoryConstants.js** + save story.json
4. **Generate character_desc.json** (character sheets with species/age/gender for voice assignment)
5. **Generate multi-voice podcast MP3** (uses character_desc.json for proper voice assignment)
6. **Generate illustrations + kling_clips.json** (ready for Kling AI animation)

Use `--skip-video` to stop after podcast (skip illustrations + Kling clips).
Use `--skip-seed --skip-index` to skip Firestore/Google indexing (do these after video is done).

**STORY FORMAT**: New stories use structured segments with Gemini `responseSchema`:
```json
{"page": 1, "segments": [
  {"speaker": "Narrator", "text": "The forest was quiet..."},
  {"speaker": "King Philip", "text": "King Philip believes this is wonderful!"}
]}
```

**Pipeline order matters**: character_desc.json → podcast MP3 → illustrations. This is enforced in dailyStory.mjs.

### Character Description Guidelines (CRITICAL for illustration quality)

Character descriptions in `character_desc.json` are the foundation for ALL illustrations. Bad descriptions → inconsistent characters across pages → unusable video. Follow these rules:

**1. Content filter safety** — Gemini's image generation blocks anything it considers unsafe. ALWAYS use child-friendly language:
- NO: "fangs", "claws", "imposing", "fierce", "sharp teeth", "menacing", "dangerous"
- YES: "friendly", "cuddly", "gentle", "round", "soft", "warm", "kind"
- For monsters/beasts: describe them as "friendly bear-like creature", "cuddly", "Disney-style", "children's storybook illustration style"
- For villains: describe them as "grumpy" or "sneaky" not "evil" or "wicked"
- Avoid "beautiful young woman" — use "kind girl" with specific age

**2. Recurring characters** — Luna and Captain Bramble appear in EVERY story. Their images are reused automatically:
- Luna: 8-year-old girl, lavender dress, crescent moon pendant, brown boots, wavy brown hair
- Captain Bramble: elderly man, navy peacoat, captain's hat, white beard, wooden pipe

**3. Family relationships must be visual** — If a character is Luna's father/mother/sibling, they MUST share visual traits:
- Same eye color (warm brown like Luna's)
- Same skin tone (warm olive)
- Same hair color family (dark brown)
- Description should explicitly say "He/She looks like Luna's father/mother"

**4. Age consistency** — Characters must look the right age for their role:
- Luna's parents: age 35-45, NOT elderly
- Grandparents: age 60-70
- Siblings: within a few years of Luna's age (8)
- Kings/queens: age 40-50

**5. Validate BEFORE generating illustrations** — After `--chars-only`, visually inspect EVERY character image:
```bash
# Generate characters only
STORY_SPOTIFY_DIR="..." STORY_YOUTUBE_DIR="..." \
/usr/local/bin/node content/podcast/generateYoutubeVideos.mjs "<Title>" --chars-only
```
Then READ each PNG file and verify:
- Characters look human (not animals, unless intentional like The Beast)
- Ages match descriptions
- Family members share visual traits
- No content filter artifacts (weird anatomy, wrong species)
- Style is consistent children's storybook illustration

**6. If character generation is blocked** — Create `character_desc.json` manually with softer descriptions and retry. Common fixes:
- Replace "beast/monster" with "friendly bear-like creature"
- Add "Children's storybook illustration style" to appearance
- Remove violent/scary descriptors
- Set age to child-appropriate values

**7. If illustrations are inconsistent** — Delete all page illustrations and regenerate:
```bash
rm -rf exports/stories/<SafeTitle>_MMDDYYYY/youtube/<SafeTitle>/illustrations/
# Keep character_desc.json, regenerate illustrations only:
STORY_SPOTIFY_DIR="..." STORY_YOUTUBE_DIR="..." \
/usr/local/bin/node content/podcast/generateYoutubeVideos.mjs "<Title>"
```

**8. Fix failed/duplicate page illustrations** — After generation, ALWAYS check for fallback duplicates:
```bash
# Find duplicate illustrations (failed pages fall back to previous page's image)
grep -E "(FAILED|fallback)" <pipeline_output>
```
The generator copies the previous page's image when Gemini blocks a page. This creates duplicate illustrations that look identical for consecutive pages.

**To fix failed pages:**
1. Identify which pages failed from the pipeline output
2. Read the page text to understand what scene should be illustrated
3. Write a softened illustration prompt that avoids content filter triggers:
   - Replace "crying/tears" → "looking sad with downcast eyes"
   - Replace "locked/imprisoned" → "alone in a room"  
   - Replace "dying/ill/sick" → "looking tired and weak"
   - Replace "attacked/fought" → "confronting" or "facing"
   - Replace "frightened/terrified" → "surprised" or "worried"
   - Replace "dark/gloomy" → "quiet" or "dim"
4. Delete the failed page illustration and regenerate individually:
```bash
# Delete the duplicate
rm exports/stories/<SafeTitle>_MMDDYYYY/youtube/<SafeTitle>/illustrations/page_NNN.png

# Regenerate specific page using the illustration generation script
# OR manually generate with Gemini API using softened prompt
```

**CRITICAL POST-GENERATION CHECK:** After ALL page illustrations are generated:
1. Visually inspect every page image (READ each PNG)
2. Look for: duplicate images, wrong characters, wrong species, missing characters
3. Fix any failed pages before proceeding to Kling clips
4. Never submit to Kling with duplicate/fallback illustrations — it wastes credits and produces bad video

**Common content filter triggers in illustrations:**
- Scenes with children crying, in distress, or alone at night
- Scenes with characters being locked up, imprisoned, or abandoned
- Scenes with illness, death, or danger to children
- Scenes with fire, storms, or natural disasters threatening characters
- Scenes labeled "beast" or "monster" even in fairy tale context
- The word "beautiful" combined with "young woman"
- Generic names like "The Beast", "The Monster", "The Witch" — ALWAYS give a proper name (e.g., "Barnaby" not "The Beast"). This applies to character_desc.json AND illustration prompts. The illustration prompt should say "Barnaby gave a flower to Luna" not "The Beast gave a flower to Luna"

For an EXISTING story that needs page rewrite:
```bash
/usr/local/bin/node content/regenerate-story-pages.mjs "<Story Title>"
```

If story text was lost, recover from exports:
```bash
/usr/local/bin/node content/recover-stories.mjs
```

### Running individual steps manually

If you need to run a step separately (e.g., re-generating just the podcast):

**Characters only** (fast, no illustrations):
```bash
STORY_SPOTIFY_DIR="exports/stories/<SafeTitle>_MMDDYYYY/spotify" \
STORY_YOUTUBE_DIR="exports/stories/<SafeTitle>_MMDDYYYY/youtube" \
/usr/local/bin/node content/podcast/generateYoutubeVideos.mjs "<Story Title>" --chars-only
```

**Podcast only** (requires character_desc.json to exist):
```bash
STORY_SPOTIFY_DIR="exports/stories/<SafeTitle>_MMDDYYYY/spotify" \
/usr/local/bin/node content/podcast/generatePodcast.mjs "<Story Title>"
```

**Illustrations + Kling clips** (Kling is default, use `--ken-burns` for legacy):
```bash
STORY_SPOTIFY_DIR="exports/stories/<SafeTitle>_MMDDYYYY/spotify" \
STORY_YOUTUBE_DIR="exports/stories/<SafeTitle>_MMDDYYYY/youtube" \
/usr/local/bin/node content/podcast/generateYoutubeVideos.mjs "<Story Title>"
```

`STORY_SPOTIFY_DIR` and `STORY_YOUTUBE_DIR` env vars are needed for `generatePodcast.mjs` and `generateYoutubeVideos.mjs` when run standalone.

### Phase 2: Kling Animation (Steps 7-8)

Illustrations and `kling_clips.json` were already generated by `dailyStory.mjs` in Phase 1. Now submit to Kling AI for animation.

**Step 7 — Submit clips to Kling AI**

```bash
/usr/local/bin/node content/kling-batch-generate.mjs \
  exports/stories/<SafeTitle>_MMDDYYYY/youtube/<SafeTitle>/kling_clips.json \
  --load-storage /tmp/kling-storage.json
```

**CRITICAL — the script enforces these settings on EVERY clip:**
- **720p** (set AFTER uploading frames — settings bar not active until frames loaded; retries up to 5× with verification)
- **Native Audio OFF** (reads SVG icon state, clicks to toggle if ON, re-verifies after click; retries up to 5× and throws if it can't confirm OFF — prevents the silent +15 credit drift that inflates cost from 30→45)
- **30 credits per clip** (reads Generate button text, HARD ABORT if cost ≠ 30)

**Execution order per clip** (this order is critical, do NOT rearrange):
1. Navigate to fresh form (`kling.ai/app/video/new?ac=1`)
2. Upload start + end frames FIRST
3. Type animation prompt
4. Set 720p (click settings bar → click `div.inner` with text "720p" → Escape + mouse click to close → verify bar text; retries up to 5×)
5. Disable Native Audio (reads SVG icon state, clicks if ON, re-verifies; retries up to 5×, throws if still ON)
6. Validate Generate button shows exactly 30 credits
7. Click Generate (ABORT if cost ≠ 30)

**Stale paths in `kling_clips.json`** — the file stores absolute paths (e.g. `/Users/admin/goreadling/...`) from whichever machine generated it. If the repo has moved, `kling-batch-generate.mjs` auto-remaps any `.../exports/stories/...` prefix to the current repo root before uploading frames. No manual rewrite needed; the self-heal is silent when it works.

**Resubmitting specific failed clips** — use `--only` flag with comma-separated clip numbers:
```bash
/usr/local/bin/node content/kling-batch-generate.mjs <clips.json> \
  --load-storage /tmp/kling-storage.json \
  --only 11,25
```

**Mouse interference warning** — if the user moves their mouse during 720p selection, the settings panel may close before 720p is clicked. The script retries up to 5× and throws if it can't confirm 720p.

**If the script aborts with a credit mismatch**, the Kling UI has changed. Re-record selectors:
```bash
npx playwright codegen --load-storage=/tmp/kling-storage.json --channel chrome "https://kling.ai/app/video/new?ac=1"
```

**If cookies are expired**, tell the user: "Sign into kling.ai in Chrome, then I'll re-export cookies."

To re-export cookies (**must capture localStorage too** — `storageState()` alone returns 0 localStorage entries):
```bash
# User must launch Chrome with debug port:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222

# Then export full storage (cookies + localStorage):
node -e "const{chromium}=require('playwright');(async()=>{
  const b=await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx=b.contexts()[0];
  const page=ctx.pages().find(p=>p.url().includes('kling'));
  const ls=await page.evaluate(()=>{const r={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);r[k]=localStorage.getItem(k);}return r;});
  const s=await ctx.storageState();
  s.origins=[{origin:'https://kling.ai',localStorage:Object.entries(ls).map(([name,value])=>({name,value}))}];
  require('fs').writeFileSync('/tmp/kling-storage.json',JSON.stringify(s));
  console.log('Saved',s.cookies.length,'cookies +',Object.keys(ls).length,'localStorage items');
})()"
```

**Wait 4 minutes after the last clip is submitted**, then proceed to download. No user confirmation needed — clips render in 3-10 minutes, 4 min wait covers most cases. If download finds unfinished clips, wait and retry.

**Step 8 — Download + assemble video**

After user confirms clips are done:
```bash
/usr/local/bin/node content/kling-build-story.mjs "<Story Title>"
```

This script:
1. Downloads clips watermark-free from kling.ai assets page using batch select:
   - Clicks "Select" button → selects N checkboxes → hovers "Download" button → clicks "Download without Watermark" from dropdown
   - Downloads a zip file, extracts with Python (handles unicode filenames)
   - Reverses clip order (Kling downloads newest first = last clip)
2. Detects segment durations from audio silence gaps
3. Loops each animated clip to match its segment duration with crossfade
4. Concatenates all clips + podcast audio → final MP4

**IMPORTANT:** The download uses Python for zip extraction (Kling filenames contain unicode that `unzip` can't handle). Python is the preferred language for data processing scripts.

Use `--skip-download` if clips are already downloaded to `illustrations/animated/`.

**If download fails:** Manually select clips on kling.ai → "Download without Watermark" → save zip to `exports/stories/<SafeTitle>_MMDDYYYY/kling_clips.zip`, then run:
```bash
python3 -c "
import zipfile, os, shutil
z = zipfile.ZipFile('exports/stories/<SafeTitle>_MMDDYYYY/kling_clips.zip', 'r')
mp4s = sorted([f for f in z.namelist() if f.endswith('.mp4')])
for i, name in enumerate(reversed(mp4s)):
    out = f'exports/stories/<SafeTitle>_MMDDYYYY/youtube/<SafeTitle>/illustrations/animated/anim_{i:03d}.mp4'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with z.open(name) as src, open(out, 'wb') as dst:
        shutil.copyfileobj(src, dst)
z.close()
"
# Then build video:
/usr/local/bin/node content/kling-build-story.mjs "<Story Title>" --skip-download
```

### Phase 3: Post-Production (Steps 9-11)

**Step 9 — Generate subtitles**

```bash
/usr/local/bin/node content/podcast/generateYoutubeSubtitles.mjs "<Story Title>"
```

Auto-discovers files in `exports/stories/<SafeTitle>_MMDDYYYY/` — no env vars or symlinks needed.

Output: `exports/stories/<SafeTitle>_MMDDYYYY/youtube/<SafeTitle>/<SafeTitle>.srt`

**Step 10 — Generate Spotify marketing metadata**

```bash
/usr/local/bin/node content/podcast/generateSpotifyMarketing.mjs
# Per-language (writes SPOTIFY_MARKETING_<lang>.md):
/usr/local/bin/node content/podcast/generateSpotifyMarketing.mjs --lang es
```

Generates/updates `exports/stories/SPOTIFY_MARKETING.md` (or `SPOTIFY_MARKETING_<lang>.md` under `--lang`) with episode titles and rich descriptions for ALL stories. The descriptions include story blurbs, links to the app/YouTube/website. STORY_DATA in the script contains the authoritative descriptions. Per-language runs use `languageConfig.titlePattern` + `descIntro` + a localized link block.

**Step 11 — Generate YouTube marketing metadata**

```bash
/usr/local/bin/node content/podcast/generateYoutubeMarketing.mjs
```

This auto-generates entries for ALL stories in podcastStoryConstants.js, with chapter timestamps from silence detection. Output goes to `exports/stories/YOUTUBE_MARKETING.md`.

The script auto-generates STORY_DATA (emoji, description, hashtags, tags) via Gemini for any story that doesn't have a hardcoded entry. No manual action needed — just run it.

### Phase 4: Publish (Steps 12-14) — skipped with --skip-upload

**IMPORTANT: Spotify is published FIRST, then YouTube. Both upload scripts auto-patch `seedBednightStories.mjs` with their IDs via `patchSeedIds.mjs`, so no manual ID entry is needed.**

**Step 12 — Upload to Spotify**

```bash
/usr/local/bin/node content/podcast/uploadToSpotify.mjs "<Story Title>"
# Or upload to a per-language Spotify show:
/usr/local/bin/node content/podcast/uploadToSpotify.mjs "<Story Title>" --lang es
# Force audio-only (MP3) if needed; default is MP4 video podcast:
/usr/local/bin/node content/podcast/uploadToSpotify.mjs "<Story Title>" --audio
```

The script:
- **Defaults to MP4 video podcast** (Spotify video feed + auto-extracts audio for RSS). Use `--audio` to force MP3.
- `--lang <code>` routes to per-language Spotify show (IDs in `languageConfig.mjs` spotifyShow). Picks up the language MP4/MP3 from `{storyDir}/<lang>/youtube/<safe>_<lang>.mp4`.
- Reads episode title + description from `SPOTIFY_MARKETING.md` (or `SPOTIFY_MARKETING_<lang>.md` under --lang).
- Uploads cover image (cover.png → intro.png → page_001.png fallback).
- Connects to Chrome on `localhost:9222` via CDP. Uses a local HTTP server + browser-side `fetch()` to bypass Playwright's 50MB CDP file transfer cap — works for 1 GB+ MP4s.
- 30-min timeout for MP4 preview/transcode on Spotify's side (5-min for MP3).
- Publishes the episode automatically.
- **Auto-patches `SPOTIFY_IDS` in `seedBednightStories.mjs`** with the new episode ID.

Prerequisites:
- Chrome running with `--remote-debugging-port=9222`, signed into `podcasters.spotify.com` / `creators.spotify.com`.
- `SPOTIFY_MARKETING.md` (or `SPOTIFY_MARKETING_<lang>.md`) must be up to date — run step 10 first.
- For `--lang`, the per-language show must already exist on Spotify with its ID filled into `languageConfig.mjs`.

**Step 13 — Upload to YouTube**

```bash
/usr/local/bin/node content/podcast/uploadToYoutube.mjs "<Story Title>"
```

The script:
- Scans `exports/stories/*/youtube/*/` for MP4 files
- Parses marketing metadata from `exports/stories/YOUTUBE_MARKETING.md`
- Uploads as **private** + made-for-kids. User reviews and makes public manually.
- **Auto-patches `YOUTUBE_IDS` in `seedBednightStories.mjs`** with the new video ID

**Step 14 — Seed Firestore (publish to website)**

Both upload scripts auto-patch `seedBednightStories.mjs` via `patchSeedIds.mjs`, so IDs are already in place. Just verify and seed:

1. **Verify IDs are present** (should be auto-patched by steps 12-13):
```bash
grep "<Story Title>" content/podcast/seedBednightStories.mjs
```

2. **Add FOLDER_TO_TITLE entry** (only if SafeTitle loses special characters like commas/apostrophes):
```javascript
const FOLDER_TO_TITLE = {
  // ... existing entries ...
  '<SafeTitle>': '<Story Title>',
};
```
Most stories auto-populate from folder names. Only add manual entries for titles with commas, apostrophes, or other stripped characters.

3. **Run the seed**:
```bash
/usr/local/bin/node content/podcast/seedBednightStories.mjs seed "<Story Title>"
```

The script auto-discovers story folders in `exports/stories/`. It:
1. Splits the MP3 into per-page audio chunks using SRT timestamps
2. Uploads cover image (uses `cover.png` if present, falls back to `illustrations/intro.png`)
3. Uploads per-page illustrations (`illustrations/page_001.png` ... `page_025.png`) to Firebase Storage
4. Uploads audio chunks to Firebase Storage
5. Creates a Firestore doc with youtubeUrl, spotifyUrl, pages[] (each page has `illustrationUrl` and `audioUrl`)

**Illustrations are required** — without them, the story page on the website shows nothing. The seed script uploads:
- **Cover**: `illustrations/intro.png` (or `cover.png` if it exists) → used as the story card thumbnail
- **Per-page**: `illustrations/page_NNN.png` → displayed while each page's audio plays

**Step 15 — Move to _published (FINAL STEP)**

After the story is fully published (Spotify + YouTube + Firestore), move its export folder to `_published/`:

```bash
mv exports/stories/<SafeTitle>_MMDDYYYY exports/stories/_published/
```

This keeps `exports/stories/` clean — only stories currently being worked on remain there. All pipeline scripts (seed, marketing generators, etc.) automatically search both `exports/stories/` and `exports/stories/_published/`.

**IMPORTANT:** This is always the LAST step. Only move after confirming:
- ✅ Spotify episode published with correct description
- ✅ YouTube video uploaded with correct description  
- ✅ Firestore seeded with pages, illustrations, and audio
- ✅ IDs patched in `seedBednightStories.mjs`

**Step 16 — Post-publish tasks**

After moving to `_published/`, run these:

1. **Regenerate marketing files** (includes new story in descriptions):
```bash
node content/podcast/generateSpotifyMarketing.mjs
node content/podcast/generateYoutubeMarketing.mjs
```

2. **Update YouTube description** for the new video (adds story page link, Spotify link, recommended stories):
```bash
node scripts/seo/updateYoutubeDescriptions.mjs
```

3. **Update Spotify description** (requires Chrome debug port on creators.spotify.com):
```bash
node scripts/seo/updateSpotifyDescriptions.mjs
```

4. **Submit to Google Indexing API**:
```bash
node scripts/seo/requestIndexing.mjs
```

5. **Generate YouTube Shorts** (Part 1 + Part 2):
```bash
node scripts/generate-story-summaries.mjs    # generates 120-word summary + TTS audio
python3 scripts/create-shorts.py "<Title>"    # creates Part 1 + Part 2 shorts in story/shorts/
node scripts/upload-shorts.mjs               # uploads to YouTube as private
```

**Note on TTS summaries:** Use `thinkingBudget: 0` in Gemini config to prevent thinking mode from consuming output tokens. Without this, summaries come out as 10-15 words instead of 120-150.

6. **Create YouTube Shorts description** — each Short gets a description with:
   - Story page link
   - Full YouTube video link
   - Spotify episode link
   - iOS + Android app links
   - Pinned comment template (note: comments disabled on made-for-kids content)

**The `--force` flag:** Use `node content/dailyStory.mjs --title "Story" --force` to regenerate an existing story's text in multi-voice segment format. This replaces the old entry in podcastStoryConstants.js.

**MP3 location:** `kling-build-story.mjs` reads the MP3 directly from `spotify/` dir — no copy to `youtube/` dir. Don't look for MP3 in the youtube folder.

### Spotify Cookie Export

To export Spotify cookies for Playwright automation:

1. Launch Chrome with debug port:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-pipeline-profile
```

2. Sign into podcasters.spotify.com (if not already signed in)

3. Export cookies:
```bash
node -e "const{chromium}=require('playwright');(async()=>{
  const b=await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx=b.contexts()[0];
  const s=await ctx.storageState();
  require('fs').writeFileSync('/tmp/spotify-storage.json',JSON.stringify(s));
  console.log('Saved',s.cookies.length,'cookies');
})()"
```

Use the same Chrome profile (`/tmp/chrome-pipeline-profile`) for both Kling and Spotify cookie exports.

### Batch Spotify ID Fetcher

For batch operations (e.g., many stories uploaded without auto-patch):
```bash
/usr/local/bin/node content/podcast/getSpotifyEpisodeLinks.mjs --update-seed
```
Navigates all pages of the Spotify episodes list, extracts IDs, maps to canonical story titles, and patches `SPOTIFY_IDS` in `seedBednightStories.mjs`.

### Manual ID Patching

If auto-patch fails, use the CLI utility:
```bash
/usr/local/bin/node content/podcast/patchSeedIds.mjs --youtube "Story Title" VIDEO_ID
/usr/local/bin/node content/podcast/patchSeedIds.mjs --spotify "Story Title" EPISODE_ID
```

### YouTube Compilations

Build themed compilation videos from existing story MP4s for massive watch time:
```bash
/usr/local/bin/node content/podcast/buildCompilation.mjs                    # build all
/usr/local/bin/node content/podcast/buildCompilation.mjs "Animal"           # build one
/usr/local/bin/node content/podcast/buildCompilation.mjs --list             # list available
```

Output: `exports/compilations/<SafeTitle>/<SafeTitle>.mp4` + `marketing.json` (title, description, chapters, tags).

Current compilations:
- Animal Bedtime Stories (5h) — Jungle Book, Peter Rabbit, Ugly Duckling, etc.
- Fairy Tale Bedtime Stories (5h) — Cinderella, Rapunzel, Hansel & Gretel, etc.
- Adventure Bedtime Stories (3h) — Aladdin, Wizard of Oz, Jack & the Beanstalk, etc.

The script handles mixed resolutions (rescales mismatched videos) and generates YouTube chapter markers from story durations.

### Spotify Playlists & Cross-Promotion

Spotify playlists mix our episodes with popular kids content for SEO discovery. Created via Spotify Web API (`/tmp/spotify-user-token.json` — OAuth token with `playlist-modify-public` scope).

Current playlists:
- 🐻 Animal Stories: `1F7HLRMf9poiqE72vI1nFx`
- 👸 Fairy Tales: `2fwpPneDLaUkCDj9P4za2S`
- ⚔️ Adventures: `6ijFyBSaqE9ElNW75iOYPw`
- 🌙 All Stories (12+ hrs): `5MVXN9XzMzL59mNIkI8JEG`

Cross-promotion is wired between:
- Website `/stories` page → Spotify playlists + YouTube compilations
- Individual story pages → playlist links (for bednight stories)
- YouTube compilation descriptions → Spotify playlists + website
- Spotify playlist descriptions → YouTube @goreadling + app

Spotify API credentials: `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env.local`. OAuth redirect: `http://127.0.0.1:8888/callback` (registered in Spotify Developer dashboard).

## SafeTitle Convention

Convert the story title to a filesystem-safe name:
- Remove all non-alphanumeric characters (except spaces)
- Replace spaces with underscores
- Example: "The Steadfast Tin Soldier" → `The_Steadfast_Tin_Soldier`

The date stamp is MMDDYYYY format: `The_Steadfast_Tin_Soldier_04072026`

## Error Recovery

- **Podcast fails on very short segments** ("Giggle!", "Goo-goo!"): Gemini TTS returns empty audio for 1-2 word segments. Fix: merge the short segment into the adjacent narrator line in `podcastStoryConstants.js`, delete cached PCMs for that page, and rerun. Check for short segments BEFORE generating: `node -e "..." | grep` for segments with < 5 words.
- **Missing character voices** (4+ characters get "fallback Zephyr"): `dailyStory.mjs` may generate fewer characters than the story references. After Phase 1, check the podcast output for `⚠️ NO voice assignment` warnings. Fix: manually add missing characters to `character_desc.json` with species/gender/age, then rerun podcast.
- **Podcast failed mid-generation (Gemini 500 error)**: The script caches per-page PCM files in `spotify/_cache_<SafeTitle>/`. Just rerun — it resumes from cached pages. Common causes:
  - API quota exhaustion from parallel story generation (wait 60s between retries)
  - Gemini TTS instability (usually recovers after 1-3 retries)
  - Each retry progresses further as cached pages are skipped
  - Check progress: `grep "Page.*words" <output> | tail -3` and cache count: `ls spotify/_cache_*/*.pcm | wc -l`
  - If stuck on same page repeatedly, check page content for content filter triggers (distress words)
- **Character image wrong species/age**: Gemini may generate wrong character (e.g., reindeer as rabbit, young girl as old woman). Fix: manually edit `character_desc.json` with correct description, delete wrong PNG, rerun `--chars-only`. ALWAYS visually validate EVERY character image before proceeding to illustrations.
- **Kling clip failed**: Rerun `kling-batch-generate.mjs` with `--start N` to skip already-submitted clips.
- **Kling clips at wrong settings (60 credits instead of 30)**: The script HARD ABORTS if Generate button shows ≠ 30 credits. If old clips were submitted at 1080p/60, they must be re-submitted at 720p/30.
- **Video assembly failed**: Rerun `kling-build-story.mjs` — it re-downloads and reassembles.
- **Story text lost from constants**: Run `node content/recover-stories.mjs` — it dynamically scans all `exports/stories/*/text/story.json` files and recovers any missing.

## Lessons Learned (Updated After Every Issue)

### Gemini Content Filter — The #1 Source of Pipeline Failures

The Gemini image generation API aggressively blocks content it considers unsafe. This affects both character images AND page illustrations. The pipeline MUST proactively avoid triggers.

**Pre-generation checklist (do BEFORE generating anything):**
1. Every character name must be a proper name — `generateYoutubeVideos.mjs` auto-renames generics (The Beast → Barnaby, The Witch → Griselda, etc.)
2. Story text in `podcastStoryConstants.js` must be softened for illustration prompts — the sanitizer replaces scary words, but emotional distress words also trigger blocks
3. Character descriptions must use child-friendly language — "friendly bear-like creature" not "imposing creature with fangs"
4. Family relationships must be visually consistent — parents share eye/hair/skin color with children

**Words that trigger PROHIBITED_CONTENT in illustrations:**
| Blocked | Safe Replacement |
|---------|-----------------|
| trembling, shaking | standing bravely |
| heart sank, devastated | considered thoughtfully |
| cold dread, terror, frightened | thought carefully, worried |
| crying, tears, sobbing | looking sad with downcast eyes |
| imprisoned, locked away | alone in a room, staying at |
| dying, ill, sick | looking tired, resting |
| separated from children | dad going on a trip |
| abandoned, left behind | waiting at home |
| attacked, fought | confronting, facing |
| dark, gloomy, sinister | quiet, dim, mysterious |
| beast, monster (as name) | Use proper name (Barnaby) |
| beautiful young woman | kind girl |

**When illustrations fail (fallback duplicates):**
1. Check which pages failed: `grep "FAILED\|fallback" <output>`
2. Read the page text — identify the emotional trigger
3. Soften the text in `podcastStoryConstants.js` (this is permanent, not ad-hoc)
4. Delete the duplicate illustration PNGs
5. **Delete `scene_directions.json` cache** — it contains the old prompts with blocked words. Without deleting this, regeneration uses the same blocked prompts:
```bash
rm -f exports/stories/<SafeTitle>_MMDDYYYY/youtube/<SafeTitle>/scene_directions.json
```
6. Regenerate — the script skips existing pages and only generates missing ones
6. Visually verify ALL pages before submitting to Kling

**When character images fail:**
1. Create `character_desc.json` manually with softer descriptions
2. Use "Children's storybook illustration style" in every description
3. Monsters/beasts: "friendly", "cuddly", "Disney-style", "round", "soft fur"
4. Verify each character image visually with `--chars-only` before page generation
5. Delete old generic-named files (the_beast.png) after renaming (barnaby.png)

### Spotify Upload
- ALWAYS use clipboard paste for descriptions, NEVER `keyboard.type()` — garbles text in contenteditable fields
- Use CDP connection (`connectOverCDP`) to logged-in Chrome, not `storageState` launch (session expires)

### Kling Download
- Use batch select → hover Download → "Download without Watermark" (el-dropdown-menu__item)
- Extract zip with Python (unicode filenames break `unzip`)
- Reverse clip order (Kling downloads newest first = last clip)
- Wait 15 min between stories to avoid mixing clips on "My Videos" page

### Story Text
- Old stories use flat string format — must regenerate with `--force` for multi-voice segments
- `dailyStory.mjs --force` replaces existing story text in podcastStoryConstants.js
- Python preferred for data processing scripts

## Key Rules

- Content scripts live in `content/`, NOT `scripts/`
- `STORY_SPOTIFY_DIR` and `STORY_YOUTUBE_DIR` env vars are ONLY needed for `generatePodcast.mjs` and `generateYoutubeVideos.mjs` — all other scripts auto-discover from `exports/stories/`
- **Pipeline order matters**: Story text → character_desc.json → podcast MP3 → video → upload. Character descriptions MUST exist before podcast generation for proper multi-voice assignment
- Kling is UI-only — no API. Uses Playwright + saved cookies
- Each Kling clip costs ~30 credits and takes 3-10 min to render
- **720p, no audio, 30 credits** — enforced EVERY clip, verified before clicking Generate
- **Sequential frames**: Each clip uses page N as start frame and page N+1 as end frame, creating smooth transitions between pages. Last clip uses same image for both.
- Cookie export MUST include localStorage (not just cookies)
- Settings must be applied AFTER uploading frames (settings bar inactive before upload)
- All downloads must be **watermark-free**
- `kling-build-story.mjs` uses animated clips DIRECTLY
- Dialogue should be 40-50% of each page, audio drama style, characters reference each other by name (no pronouns), first person
- New stories should use multi-voice segment format with speaker tags
- **Every character MUST have a real proper name** — never generic titles like "The King", "Innkeeper", "Old Man", "Simpleton". Use "King Philip", "Innkeeper Henrik", "Old Man Tobias", etc. This is enforced in the `dailyStory.mjs` prompt.
- **NEVER delete or unlist videos on any GoReadling channel.** The main @GoReadling still holds older mixed-language uploads from before per-language channels existed; leave them alone. "Move to X channel" always means re-upload additively, never delete the original.

## Multilingual Pipeline

Translate existing stories into Spanish, Arabic, Hindi, Portuguese, Russian. Same video (illustrations + Kling animation), different audio + subtitles. **32 stories are translatable** (have MP3 + MP4 + SRT + illustrations). 8 are excluded (missing assets). Chinese dropped (YouTube/Spotify blocked in China — use Bilibili/Ximalaya instead).

### Language Config

`content/podcast/languageConfig.mjs` — central config with language codes, YouTube playlist IDs, Spotify show IDs, title patterns.

### Scripts

**Translate story text** (Gemini):
```bash
node content/podcast/translateStory.mjs "Cinderella" --lang es
node content/podcast/translateStory.mjs all --lang es,ar,hi,pt,ru
```
- Outputs `{storyDir}/{lang}/text/story_{lang}.json`
- ALL translations output segment format `{page, segments: [{speaker, text}]}` regardless of source format
- Flat string stories are converted to segments during translation
- Character names stay in English (for voice mapping)

**Generate TTS in target language** (same `generatePodcast.mjs` with `--lang`):
```bash
STORY_SPOTIFY_DIR="exports/stories/_published/<SafeTitle>_MMDDYYYY/spotify" \
node content/podcast/generatePodcast.mjs "Cinderella" --lang es --key 1
```
- `--key N` uses ONLY that API key (1-based, no rotation) — use for parallel execution
- Gemini TTS auto-detects language from text — no `spokenLanguageCode` needed
- Outputs `{storyDir}/{lang}/spotify/{SafeTitle}_{lang}.mp3`

**Swap audio track** (ffmpeg, no re-encoding):
```bash
node content/podcast/swapAudioTrack.mjs "Cinderella" --lang es
```
- Copies video stream from English MP4 + replaces audio with translated MP3
- Output: `{storyDir}/{lang}/youtube/{SafeTitle}_{lang}.mp4`

**`--pro` flag** uses Pro TTS model (separate RPM quota from Flash):
```bash
node content/podcast/generatePodcast.mjs "Cinderella" --lang es --key 1         # Flash TTS
node content/podcast/generatePodcast.mjs "Cinderella" --lang es --key 1 --pro   # Pro TTS
```
Flash and Pro have SEPARATE RPM limits → run both on same key = 2x throughput per key.

**Parallel TTS: 6 keys × 2 models = 12 stories at once:**
Each key can run 1 Flash + 1 Pro simultaneously. With 6 keys = 12 parallel TTS slots.
Launch manually with dedicated key+model per story for maximum throughput.

**Batch orchestrator:**
```bash
node content/podcast/translateAllStories.mjs --lang es              # full pipeline
node content/podcast/translateAllStories.mjs --lang es --only-tts   # just TTS
node content/podcast/translateAllStories.mjs --lang es --only-swap  # just audio swap
node content/podcast/translateAllStories.mjs --lang es --story "Cinderella"
```
- `PARALLELISM = API_KEYS.length` (currently 6)
- Each story gets `--key N` so no rotation conflicts
- Skips stories that already have MP4/MP3

### File Structure

```
exports/stories/_published/Cinderella_04012026/
  spotify/Cinderella.mp3                    # English (untouched)
  youtube/Cinderella/Cinderella.mp4          # English (untouched)
  youtube/Cinderella/illustrations/          # SHARED across languages
  es/
    spotify/Cinderella_es.mp3               # Spanish audio
    youtube/Cinderella_es.mp4               # same video + Spanish audio
    youtube/Cinderella_es.srt               # Spanish subtitles
    text/story_es.json                      # translated text (segments)
  ar/ hi/ pt/ ru/                           # same pattern
```

**Upload multilingual videos to YouTube:**
```bash
node content/podcast/uploadMultilangYoutube.mjs --lang es
node content/podcast/uploadMultilangYoutube.mjs --lang es,hi,ar
node content/podcast/uploadMultilangYoutube.mjs --lang es --story "Cinderella"
```
- Localized titles from `story_{lang}.json` titleTranslated field
- Localized descriptions with app/web/Spotify links per language
- Sets `defaultAudioLanguage` + `defaultLanguage` for YouTube recommendations
- Auto-adds to language playlist from `languageConfig.mjs`
- Uploads as private (make public separately or use overnight script)

**Overnight batch (full pipeline for new languages):**
```bash
# Create script, run with nohup:
nohup bash /tmp/overnight_<langs>.sh > /tmp/overnight_log.txt 2>&1 &
# Check progress: tail -f /tmp/overnight_log.txt
```
Pattern: translate → TTS (1 story at a time, safest) → swap → upload → make public. See `/tmp/overnight_ru_pt.sh` for template.

### YouTube: Same channel, language playlists
- 🇬🇧 English: Night Stories `PLLiQnta0Yb9iOZ-9TLfYOnRG5mrOaF0aV`
- 🇪🇸 Spanish: `PLLiQnta0Yb9jmKWA4ZB8dj8lMjQkb7kkU`
- 🇮🇳 Hindi: `PLLiQnta0Yb9gFaGNY6BS4Mnomhmn7dz4_`
- 🇸🇦 Arabic: `PLLiQnta0Yb9heqk7Cf9hx60itJ3V4M0FR`
- 🇧🇷 Portuguese: `PLLiQnta0Yb9hnbBdEa28Z_hC7Yg5IV0e4`
- 🇷🇺 Russian: `PLLiQnta0Yb9ic1p_gNLmgOX0WX6crSJiT`
- Video titles in target language: "Cenicienta — Cuento para Dormir para Niños (37 Min)"
- Set `defaultAudioLanguage` per video

### Spotify: Separate shows per language
- English: `5Xibl3BuCkhfxRJRu5v6ML` (existing)
- Other languages: TODO (create on Spotify for Podcasters, one show per language)
- Show IDs stored in `languageConfig.mjs`

### Intro/Outro Rules (All Languages)
- **Intro** (~3 seconds): "Welcome to GoReadling Stories. {Story Title}." in native language
- **Outro** (~3 seconds): "Don't forget to subscribe to GoReadling Stories!" in native language
- **Existing English stories**: Trim first 18-21s using YouTube Studio Editor trim (Playwright automation) — do NOT regenerate
- **Existing translated stories**: Trim first 21s with `ffmpeg -y -i input.mp3 -ss 21 -c copy output.mp3` — do NOT regenerate
- **New stories**: Short intro inserted at mid-story (not beginning — kids need action now)
- **Intro placement**: `generatePodcast.mjs` inserts intro after `pages.length / 2` pages, not at start
- Constants: `podcastStoryConstants.js` PODCAST_INTRO and PODCAST_OUTRO are the short versions
- `translateStory.mjs` translates these short versions per language into `story_{lang}.json` intro/outro fields

### Key Rules
- **Gemini TTS auto-detects language** from input text — do NOT set `spokenLanguageCode` (field doesn't exist in API, returns 400 error)
- **Dedicated keys for parallel** — use `--key N` to avoid rotation conflicts
- **Flash + Pro = 2x throughput** — separate RPM limits per model. Use `--pro` flag for Pro TTS
- **6 keys × 2 models = 12 parallel TTS** — maximum throughput
- **MAX_RETRIES = 3** — fail fast, segments are cached, just rerun. Don't waste time retrying 30x
- **Translations always output segment format** — even for old flat-string stories
- **Translation validation**: `translateStory.mjs` filters out empty segments (missing speaker/text) instead of throwing — Gemini sometimes returns segments with null text. If ALL segments are empty after filtering, it retries.
- **32 translatable stories** — 8 excluded (Aladdin, Pocahontas, Sleeping Beauty, Snow White, Frog Prince, Winnie-the-Pooh, Ali Baba, Boy Who Cried Wolf)
- **Podcast cover**: `podcast-cover.png` (1400x1400, RGB PNG) at project root
- **Languages**: Spanish, Arabic, Hindi, Portuguese, Russian (NOT Chinese — YouTube/Spotify blocked in China)
- **Priority**: Hindi > Spanish > Arabic (by market size and competition)

### TTS Failure Analysis (ALWAYS diagnose before retrying)

When TTS fails, **check the log to find the exact segment and error** before resubmitting:

```bash
# Find the failing segment
grep -E "💥|Page.*segmented" /tmp/tts_<lang>_<key>.log | tail -5
```

**Common TTS failures and fixes:**

| Error | Cause | Fix |
|-------|-------|-----|
| "No audio data from Gemini TTS" | Segment text describes voice/actions instead of dialogue ("Captain Bramble's voice was warm") | Edit `story_{lang}.json` — rewrite segment as actual spoken words |
| "Model tried to generate text, but it should only be used for TTS" | Text looks like a prompt/instruction to the model | The script now prefixes non-English text with "Read aloud:" — if still fails, shorten the segment |
| "API Key not found" | Rotated to a deleted/invalid key | Check `.env.local` — ensure all `GEMINI_API_KEY_*` are valid tier 2 keys |
| Segment too short (1-2 words like "Giggle!") | Gemini TTS returns empty for ultra-short text | Merge into adjacent narrator segment in source text |
| ENOENT narration.wav | Script tries to delete English wav in wrong dir | Path bug in `--lang` mode — check outputDir logic |

**Automated protections (built into scripts):**
1. `translateStory.mjs` prompt rules 9-12 explicitly forbid meta-descriptions with wrong/right examples
2. `sanitizeSegments()` post-processor auto-strips segments matching known patterns in ALL 5 languages:
   - English: "voice was/had/sounded", "spoke nervously", "eyebrows furrowed", "eyes widened", "smiled gently"
   - Hindi: "आवाज़ में/थी/से/आई", "भौंहें", "मुस्कुराई", "आँखें आश्चर्य"
   - Arabic: "صوت...كان", "قالت بقلق", "حاجبيا تقطب", "عيناه اتسع"
   - Spanish: "voz era/sonaba", "dijo con preocupación", "cejas fruncidas"
   - Portuguese: "voz era/soava", "disse com preocupação", "sobrancelhas franzidas"
   - Russian: "голос был/звучал", "сказала с тревогой", "брови нахмурил", "глаза расширились"
   - Single-word segments (< 2 words) stripped
   - **Max 12 segments per page** (overflow merged into last segment)
3. `generatePodcast.mjs` prefixes non-English text with "Read aloud:" for TTS
4. MAX_RETRIES = 3 — fail fast, diagnose, don't burn quota

**If TTS STILL fails after automated protections:**
1. Check the log: `cat /tmp/tts_<lang>_<key>.log | tail -20`
2. Identify which page and segment failed
3. Read the segment text — find the meta-description or trigger
4. Edit `story_{lang}.json` — remove or rewrite the bad segment
5. Delete cached PCMs for that page: `rm exports/stories/_published/<dir>/<lang>/spotify/_cache_*/<page>_*.pcm`
6. THEN retry

**Common meta-description patterns that cause TTS failures:**
- "Captain Bramble's voice was warm and deep" → describes voice, not content
- "Paper Ballerina's eyebrows furrowed with worry" → describes action/emotion
- "Rosie spoke nervously" / "Other Tin Soldiers' voice had concern" → describes tone
- "She said softly, trembling with fear" → emotional stage direction
- Single words: "Giggle!", "Goo-goo!" → merge into narrator segment
- Very long segments (400+ words / 18+ segments per page) → reduce to max 12 segments

### Disk Space Management
- `exports/stories/_published/` is symlinked to `/Volumes/Samsung500/goreadling/exports/stories/_published` (external SSD)
- **CRITICAL: The symlink path must be EXACT** — a wrong path creates an empty directory that silently loses data
  - WRONG: `/Volumes/Samsung500/goreadling/_published` (root level — empty!)
  - RIGHT: `/Volumes/Samsung500/goreadling/exports/stories/_published` (actual data location)
- **After creating/fixing a symlink, ALWAYS verify**: `ls exports/stories/_published/ | head -5` — must show story folders
- **Use `find -L`** (not `find`) to follow symlinks when counting files
- **NEVER `cp -r` a symlink target into itself** — this creates a nested `_published/_published/` duplicate (73 GB wasted). Use `rsync --no-links` or copy BEFORE creating the symlink
- Delete `_cache_*` dirs after TTS is done — they contain PCM segments already baked into MP3s
- Each story's TTS cache can be 50-100 MB; 33 stories × 3 langs = ~5-10 GB of cache
- **After any disk operation, verify file counts**: `find -L exports/stories/_published -name "*.mp4" -path "*/youtube/*" ! -path "*/animated/*" | wc -l` should equal total stories

### Multilingual Parallel TTS — Lessons Learned
1. **RPM limit is per-key AND per-model** — Flash and Pro have separate limits
2. **Don't use all 12 slots at once** unless stories are short — long stories + many parallel = API instability
3. **Best approach: use `translateAllStories.mjs --lang pt,ru --upload --make-public`** — one Node.js command handles everything. NEVER use bash overnight scripts (apostrophe bugs, wrong paths)
4. **Deleted API keys stay in running processes** — always kill and restart after changing `.env.local`
5. **`translateStory.mjs all`** translates ALL 32 translatable stories, not just the 11 Kling stories — this is fine, extra translations don't hurt
6. **`KLING_STORIES` is the single source of truth** — imported from `languageConfig.mjs`, never hardcoded in scripts
7. **Swap script (`swapAudioTrack.mjs all`)** tries all 32 stories but only succeeds for ones with MP4s — "No MP3" errors for non-Kling stories are expected
8. **Pages with 18+ segments** consistently fail TTS — `sanitizeSegments()` auto-caps at 12
9. **After fixing a story_*.json**, always delete the cached PCMs for modified pages AND the page_NNN.pcm (full page cache)
10. **Intro/outro placement**: intro goes at MID-STORY (after page ~12), not at the beginning. Kids need action immediately — 29s of intro before story = they leave. Translated intro/outro read from `story_{lang}.json`
11. **YouTube trim**: existing English videos need first 18s trimmed via YouTube Studio Editor. Script: `trimYoutubeIntros.mjs` (Playwright automation). Cut from 00:00:03 to 00:00:21 (keep 3s brand, remove rest of intro)
12. **Before trimming YouTube videos**: download all MP4s as backup first with `yt-dlp`. Verify ALL 42 stories have local MP4s: `find -L exports/stories/_published -name "*.mp4" -path "*/youtube/*" ! -path "*/animated/*" | wc -l`
13. **Apostrophes in story titles**: bash scripts break on "The Emperor's New Clothes". Always use Node.js scripts (not bash) for batch operations. The `safe()` function strips apostrophes — Node handles them correctly in spawn/exec

### API Keys
- 6 Gemini API keys in `.env.local` (GEMINI_API_KEY through GEMINI_API_KEY_6)
- All tier 2 (high limits)
- `--key N` flag in generatePodcast.mjs uses ONLY key N (1-based, no rotation)
- When removing/adding keys: kill all running TTS processes first, then restart

## Known Issues

- YouTube IDs and Spotify IDs in `seedBednightStories.mjs` are auto-patched by upload scripts via `patchSeedIds.mjs`. If auto-patch fails, use `patchSeedIds.mjs` CLI or `getSpotifyEpisodeLinks.mjs --update-seed` for batch updates
- `FOLDER_TO_TITLE` auto-populates from folder names, but special characters (commas, apostrophes) get stripped — verify for titles like "Pinocchio, the Wooden Boy"
- `generateYoutubeMarketing.mjs` auto-generates STORY_DATA via Gemini for stories without a hardcoded entry
- `uploadToYoutube.mjs` filter normalizes underscores to spaces when matching story title argument
- **Page text format**: New stories use structured segment objects (`{page, segments}`) in `podcastStoryConstants.js`, but Firestore pages must have flat string `text`. The seed script uses `pageToText()` to flatten — if the frontend shows a blank page with React error #31 ("object with keys {segments, page}"), the text wasn't flattened before seeding
- `seedBednightStories.mjs` uses `folderToPath` map to resolve dated story folders (`<SafeTitle>_MMDDYYYY`) — the old `path.join(YOUTUBE_DIR, folder)` fallback is kept for legacy paths
- Playwright E2E tests after seeding require local dev server running — `ECONNREFUSED` errors are expected if server is off; the seed itself still succeeds
