---
name: 90-day Sara & Eva sprint — 1–3 episodes/day
description: Sara & Eva production cadence: 90-day sprint starting ~2026-05-02, target 1 episode/day minimum (could ramp to 3/day = 270 eps). Every pipeline decision must minimize manual touchpoints so the user can run the day's batch and walk away.
type: project
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
User plan iterated 2026-05-02: 90-day sprint, target rate floats between **1 episode/day (= 90 eps total)** and **3 episodes/day (= 270 eps)**. Pipeline must support either without re-architecture.

**Why:** building @SaraAndEva audience at velocity. Volume + consistency, kid-pop dentist/family/sister-bond formula.

**Cost envelope (Kling pricing confirmed 2026-05-02: 26,000 cr = $150 ≈ $0.0058/cr):**

| Cadence | Total eps | Kling cr | Kling $ | Suno $ | Total $ |
|---|---:|---:|---:|---:|---:|
| 1 ep/day | 90 | 153,000 | $885 | $300 | ~$1,200 |
| 3 ep/day | 270 | 459,000 | $2,650 | $900 | ~$3,550 |

(Earlier $22k estimate used ~$0.05/cr which is ~10× the actual rate.)

**Per-episode budget rule of thumb:** budget ~1500 cr base + 25% retake buffer = **1875 cr target, 2200 cr abort** (something's wrong with the prompts if you're spending more).

**How to apply (every pipeline decision):**
1. **Don't add manual review steps.** If a step requires the user to look at a frame or pick a variant, it scales O(N) with episodes — kills cadence. Automate variant pick (default `--pick=1`), automate frame audit (sample-based + auto-retry on detected failures), automate title/description generation.
2. **Re-use dance footage.** Existing `assets/video/*.mp4` dance clips substitute for Kling A/B renders for music videos at $0 (saved 180 cr in ep08). Plan music videos from existing footage by default; only render new dance footage when the episode genuinely needs novel choreography.
3. **Templated thumbnails.** Frame-extract + Pillow text overlay = 5 seconds. (See `lesson_episode_thumbnail_recipe.md`.)
4. **Templated shorts.** Same `lesson_youtube_short_design.md` recipe — only the song/dance and title text change.
5. **Library elements:** `addMissingElements.mjs` orchestrates Nano-Banana gen + Kling library upload + library-existence check.
6. **Fail loud, fail fast.** Lint at submit-time (motion verbs, group nouns, music-sting phrases). Each failed render is 90 cr × multi-minute wait — at hundreds of clips, even 1% failure costs hundreds of credits.
7. **Single-command episode (target).** `node submitEpisode.mjs --episode=NN` should chain → generate scenes/props → upload library → submit clips → wait → download → assemble → upload main+short → done. User reviews UNLISTED in Studio and flips PUBLIC.
