---
name: ep10 — three orchestration-script bugs fixed
description: downloadOmniByPrompt regex skipped letter-clips, submitEpisode wanted a flat ep10.json (per-clip layout silently failed), submitOmniClip's required-negative-terms list now auto-prepends instead of failing validation.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
ep10 surfaced three latent issues across the orchestration scripts. Fixed in this session.

## 1. `downloadOmniByPrompt.mjs` — letter-clip regex
**Bug:** loader regex `/^\d+\.json$/` excluded `A.json`, `B.json`, `C.json` — music-video specs were silently dropped.
**Symptom:** ep10 first download was 20/20 numeric clips (correct) but A/B/C music videos NEVER appeared in output even though they had rendered.
**Fix:** regex now `/^(\d+|[A-Z])\.json$/` — accepts numeric AND letter clip filenames. The type-check fix from post-ep09 (which accepted string `clip` values) finally runs on letter clips.
**Pattern in earlier post-ep09 fix:** the type-check inside the loop was correct; the issue was the dirent filter UPSTREAM. Verify the file iterator regex AND the type check together.

## 2. `submitEpisode.mjs` — needs flat ep10.json
**Bug:** `--episode=10` resolves to `content/episodes/ep10.json` (flat consolidated file). The per-clip layout (`content/episodes/ep10/{1..20,A,B,C}.json` + `episode.json`) is NOT a valid input by itself.
**Symptom:** `submitEpisode --episode=10` errors with "episode JSON not found" if you only authored the per-clip files.
**Workaround used in ep10:** built a small Python consolidator that reads `episode.json` + all per-clip JSONs and writes a flat ep10.json with embedded `clips[]` and `musicVideos[]` arrays.
**TODO:** add a flag to submitEpisode: `--auto-consolidate` that looks for `content/episodes/ep<NN>/episode.json` and builds the flat file in-memory before reading.

## 3. `submitOmniClip.mjs` — REQUIRED_NEGATIVE_TERMS validator
**Bug (UX, not a real bug):** the validator hard-fails if the clip's negativePrompt is missing any of the 10 required terms (duplicate character, twin, clone, etc.). 5 of ep10's 23 clips failed first-pass submit because I'd customized their negativePrompts and dropped the standard list.
**Symptom:** `❌ negativePrompt missing required terms: duplicate character, clone, two of the same...`
**Fix applied (this session):** auto-prepend the missing terms instead of failing — saves a re-edit + re-submit cycle.
**Code in submitOmniClip.mjs ~line 186 should now:**
```js
const missingNeg = REQUIRED_NEGATIVE_TERMS.filter(t => !negLower.includes(t.toLowerCase()));
if (missingNeg.length > 0) {
  console.warn(`⚠ auto-prepending ${missingNeg.length} required negative terms to spec.negativePrompt`);
  spec.negativePrompt = missingNeg.join(", ") + ", " + (spec.negativePrompt || "");
}
```

## How to apply
- Any new orchestrator script that iterates per-clip JSONs MUST allow letter clips (`A.json`, `B.json`, `C.json`) — don't restrict to numeric.
- New consolidated-flat-file builders (e.g. an `assembleEpisodeJson.mjs`) belong as part of submitEpisode, not as ad-hoc Python scripts.
- Validators that block submission for fixable inputs should AUTO-FIX with a warning, not hard-fail.
