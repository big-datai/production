---
name: Costume preview PNG ≠ Kling element — silent fallback to generic destroys consistency
description: ep15 retrospective 2026-05-07. The pipeline generated Halloween costume preview PNGs via Nano Banana for Sara/Eva/Papa/Mama/Joe/Ginger/Isabel/Leo (8 of 8 listed in episode.json.newCostumePreviews) but only 5 of 8 were uploaded as Kling elements (`ep15_<Name>`). For Papa/Isabel/Leo the pipeline silently fell back to the generic non-costumed element via `resolveElementId()` in kling_ep15_pipeline.mjs, so Kling rendered everyday-look frontals while the prompts asked for werewolf/unicorn/dinosaur. Result: Papa appears in jeans in clip 7+10 and as werewolf in clips 17+19+20 (Pattern E group still). Now lint-blocked by E5 in lintEpisode.py.
type: lesson
severity: hard-rule
appliedTo: every multi-costume episode (Halloween, Christmas, Birthday, Pajama-Day, etc.)
---

# What happened (ep15)

`episode.json` declared 8 costume previews:

```json
"newCostumePreviews": [
  "assets/scenes/group_ep15_sara_princess_preview.png",
  "assets/scenes/group_ep15_eva_pumpkin_preview.png",
  "assets/scenes/group_ep15_papa_werewolf_preview.png",
  "assets/scenes/group_ep15_mama_cozy_preview.png",
  "assets/scenes/group_ep15_joe_bug_preview.png",
  "assets/scenes/group_ep15_ginger_pumpkin_cape_preview.png",
  "assets/scenes/group_ep15_isabel_unicorn_preview.png",
  "assets/scenes/group_ep15_leo_dinosaur_preview.png"
]
```

`elements_registry.json` had **5 of 8**: `ep15_Sara`, `ep15_Eva`, `ep15_Mama`, `ep15_Joe`, `ep15_Ginger`. **Missing**: `ep15_Papa`, `ep15_Isabel`, `ep15_Leo`.

In `kling_ep15_pipeline.mjs`, `resolveElementId(name)` prefers `ep15_<Name>` over generic. When `ep15_Papa` doesn't exist, it falls back to `Papa` (everyday-look frontal) **silently** — no warning, no log, no error. The submit body was technically valid (had a real element_id). Kling then had to reconcile:

- `frontal_image` of element = everyday Papa (jeans, T-shirt)
- prompt cast identity locks = "friendly werewolf with floppy ears"

Kling sometimes followed the image (gave us everyday Papa), sometimes the prompt (gave us werewolf), and sometimes a half-and-half. Each render was independent so consistency across the 22-clip arc was destroyed.

# Why we missed it

1. **Pre-render PNGs were generated** so the look was conceptually documented.
2. **Some clips used Pattern E group still** as boundElement (clips 17/19/20) — those got werewolf Papa from the group still PNG, masking the bug.
3. **Bare-element clips** (7, 10) used the silent-fallback generic Papa — these are where the bug surfaced.
4. **No pre-submit check** that costume previews and elements line up.
5. **Cost was already paid** by the time we noticed (audit caught only narrative-level issues like "audio says 5 stars but card shows 3" — Gemini didn't flag the cross-clip inconsistency).

# Fix landed (E5 in lintEpisode.py)

Every `newCostumePreviews` entry must have a matching `ep<NN>_<Char>` in `content/elements_registry.json`. Filename convention `(group_)?ep<NN>_<char>_<costume>_preview.png`. Hard-fail (🔴 error) if missing.

```python
# from lintEpisode.py
for p in previews:
    m = preview_pat.search(p)
    if not m: continue
    char_key = m.group(1).capitalize()
    if char_key in CANONICAL_CAST:
        expected = f"{ep_prefix}{char_key}"
        if expected not in registry:
            findings.append(("error", f"E5 ... {expected!r} missing"))
```

# Procedural fix (next costumed episode)

Before phase 5 (submit) of `runEpisodePipeline.py`:

1. `python3 generateScenes.py` → produces costume preview PNGs
2. **For every preview PNG**: upload to GCS as the element's frontal_image, call `createElementViaApi.mjs` with that frontal + costume description in element name/description, write back to `elements_registry.json` as `ep<NN>_<Char>`
3. `python3 lintEpisode.py --episode <NN>` → E5 verifies the registry coverage. Fails if any preview lacks an element.
4. Only then proceed to submit.

This sequence should eventually be a Python script `extendCostumedElementsRegistry.py` (top-3 Python migration target #4 alongside draftEpisodeSpec / autoFixDefects / trackEpisodeBudget).

# Anti-pattern to remember

❌ "I generated the costume preview PNG" ≠ "Kling has the element registered". The PNG is for human-eyeball reference and Pattern E image-to-video. The Kling element is a separate API resource that holds the frontal image + character description. Both are required for the full costume to render.

❌ Silent fallback in `resolveElementId()`. Generic-element fallback is convenient when the costume IS the everyday look (like clip 21 Papa walking-home in same costume across all of season 1), but is dangerous when a costume episode declares costumed elements. The silent path destroyed ep15.

# What ep15 cost us

- Inconsistent Papa across 5 clips (7, 10 = everyday; 17, 19, 20 = werewolf via group still)
- Inconsistent Isabel across 2 clips (13, 14)
- Inconsistent Leo across 1 clip (13)
- Estimated re-render cost to fix retroactively: ~70 cr (8 clips × ~9 cr) if we generate ep15_Papa/ep15_Isabel/ep15_Leo and resubmit affected clips.

# Linked memory

- `lesson_kling_costumed_elements_and_dialogue.md` — two-layer costume rule (frontal image + prompt locks)
- `lesson_kling_omni_api_schema.md` — element_list / image_list schema
- `lesson_kling_api_runbook.md` — createElementViaApi.mjs usage
- `strategy_deterministic_pipeline.md` — the orchestrator that this E5 plug-in protects
