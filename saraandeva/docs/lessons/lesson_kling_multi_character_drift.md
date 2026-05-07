---
name: Kling multi-character identity drift — root cause + remedies (2026-05-07)
description: Even with correct API schema, single-prompt clips with 5+ characters drift identity hard (Eva turns dark-haired/dark-skinned, Papa grows hair). Single-element clips lock 100/100. Multi-shot mode (multi_prompt with 1-2 chars per shot) is the documented remedy but observed to hang on this account. Use single-prompt + few characters per shot when possible. This lesson supersedes the multi-shot enthusiasm post — multi_prompt is unreliable until proven.
type: lesson
severity: production-critical
appliedTo: any Kling Omni clip with 3+ bound characters
originSessionId: 2026-05-07-ep15
---

# Empirical observation (2026-05-07 ep15 production)

| Test | Chars in shot | Result |
|---|---|---|
| Eva-only, 5s, single-prompt, 1 element with 3-angle refs | 1 | **100/100 canon match** — fair porcelain skin, curly bright blonde, brown eyes, pumpkin onesie. Perfect. |
| Clip 1 v1 family, 10s, single-prompt, 5 elements | 5 | Eva: olive skin (canon: fair). Mama: missing-bald-Papa-gets-hair drift. Sara: fair-blonde survived. ~50/100 average. |
| Clip 1 v2 family with explicit "FAIR PORCELAIN SKIN" identity locks in prompt | 5 | Eva: BLACK hair + dark skin (worse than v1). Identity averaging dominated. ~30/100. |
| Clip 1 multi_prompt 3-shot (1 element max active per shot) | 5 in element_list, varying per shot | Submitted 2026-05-07 03:00 UTC, **stuck at "processing" 20+ minutes**, no result, no cancel. Possibly slower-queue OR hung. |

# Root cause

Kling's element binding is **per-clip**, not per-shot. When 5 elements are listed and the prompt mentions all 5 in one shot, Kling has to lock 5 distinct identities AT ONCE inside a single 10s render budget. With a finite ref-image budget per element (3-4 images), the model averages features across all chars, picking up on common attributes ("kid", "family member") and discarding distinguishing ones (skin tone, hair color).

Single-character renders avoid the averaging — Kling has full ref-image budget for that one identity.

# What works (proven on 2026-05-07)

1. **One element per shot is bulletproof.** ep15_Eva alone rendered 100/100 with `<<<element_1>>>` syntax + `image_list` anchor + 3-angle refs.
2. **Two elements per shot probably works** — not specifically tested in this session but the morning ep12_clip2 (Papa+Sara+Eva = 3 elements) rendered cleanly enough to go to YouTube.
3. **3+ elements per shot is the danger zone** — averaging dominates, identity drift visible in renders.

# Recommended pattern for multi-character scenes

For any clip with 3+ characters, **stage the shots so each shot has 1-2 characters max**, even if you have 5+ elements in `element_list`:

```
Shot 1 (3s): tight on @Eva (close-up)               → 1 char
Shot 2 (3s): two-shot of @Sara + @Mama              → 2 chars
Shot 3 (4s): pull-back wide showing all 5           → 5 chars but wide+brief
```

The wide-pull-back at the end gets some averaging tax but it's brief and at distance, where drift is less noticeable.

# multi_prompt status — CONFIRMED BROKEN on this account (do NOT use)

Tested 2026-05-07 with `multi_prompt: [{prompt, duration}×3]` carrying `<<<element_N>>>` references and a populated `element_list` of 5 ep15 characters. Submission accepted (200 OK), task processed for **35 minutes** (vs 85s for single-prompt), then returned a 10s video with off-model garbage:

- Shot 1 rendered with NO characters at all (empty house exterior).
- Shot 2 rendered a generic adult woman in a sparkly cocktail dress (looks like Frozen Elsa) — NOT the canonical Mama, no costume from the prompt.
- Shot 3 rendered two random kids in red costumes (one with a witch broom?) — none of the canonical chars in their canonical costumes from the prompt.

`element_list` was populated, `<<<element_N>>>` references were in the multi_prompt shot text. Same `<<<element_1>>>` syntax + `element_list` works perfectly in single-prompt (Eva-only test rendered 100/100). The bug appears to be that `multi_prompt` does NOT resolve element_list bindings inside its shot prompts — each shot is generated independently from the text alone.

**HARD RULE: do NOT use `multi_prompt` for character-consistent renders on this account.** Cost: 1× $0.60 wasted + 35min wall time validating this.

# What works instead — single-prompt + sequential continuity

For multi-shot cinematic feel, chain single-prompt clips with `image_list: [{image_url: <previous_clip_last_frame>}]`:

1. Submit clip N (single-prompt, multiple chars in `element_list`, `<<<element_N>>>` references in prompt text). Render returns ~85s.
2. ffmpeg extract clip N's last frame: `ffmpeg -hide_banner -loglevel error -sseof -0.1 -i clipN.mp4 -update 1 -vframes 1 -y last_N.png`
3. Upload to GCS: `gsutil cp last_N.png gs://saraandeva-kling-elements/<ep>/lastframes/`
4. Submit clip N+1 with `image_list: [{image_url: <https url of last_N.png>}]`
5. Repeat. Smooth cinematic cuts.

For multi-shot WITHIN a clip: use plain text shot markers in a single prompt, e.g. `Shot A (0-3s): close-up on @Eva. Shot B (3-7s): wide showing the family. Shot C (7-10s): low-angle on the dogs.` Single-prompt path renders in 85s and respects element_list bindings.

# Stronger refs reduce drift but don't eliminate it

The ep15 elements were created with 3 reference images (front + 3q + profile). Adding a 4th ref (the Halloween costume preview) is supported (max 3 in `refer_images` per docs but the schema accepts the costume PNG via `frontal_image` substitution). Stronger refs tighten the lock but with 5 chars in one shot, the bottleneck is the model's per-shot ref budget, not the per-element ref count.

# Negative prompts can help nudge

Adding character-specific negatives:
```
negative_prompt: "..., dark skin on Eva, brown skin on Eva, brunette Eva, mama with dark hair, papa with hair on head, sara in ponytail, ..."
```

Doesn't fix averaging fully but reduces the worst drift modes.

# Cost-aware testing

Before submitting all 22 clips of an episode:
1. Submit 1 single-element test (1u = $0.10/$0.30 std 5s) — verify schema works.
2. Submit 1 two-element shot (3u std 10s = $0.60) — verify dual-char identity.
3. THEN scale to full episode if previous tests on-model.

This session burned $7.80 on broken multi-char renders before discovering the schema was wrong. A staged test ladder would have caught it for $0.30.

# Continuity-locked sequencing (the alternative to multi_prompt)

Use `image_list: [{image_url: <previous_clip_last_frame>}]` to anchor clip N+1 on clip N's last frame. Smooth cinematic cuts without needing multi_prompt. Pipeline:

1. Submit clip N
2. ffmpeg extract clip N's last frame: `ffmpeg -sseof -0.1 -i clipN.mp4 -update 1 -vframes 1 -y last_N.png`
3. Upload to GCS
4. Submit clip N+1 with `image_list: [{image_url: <https url of last_N.png>}]`
5. Repeat

Trade-off: serializes the pipeline (each clip waits for the previous). 22 clips × 2-3 min each = ~50-60 min wall time. Worth it for the visual smoothness.
