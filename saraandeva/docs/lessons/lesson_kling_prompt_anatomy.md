---
name: ep13 — Kling Omni prompt anatomy + binding rules (post-mortem)
description: Definitive prompting rules for Kling Omni mode after ep13 burned ~990 cr on iterations. Covers: when to use group stills vs canonical avatars, what goes in the prompt when stills are bound (motion-only), the matcher's prompt-similarity gotcha, submit idempotency. Replaces the 2-4 of "let's try this" rounds we hit on every ep11+ episode.
type: lesson
severity: hard-rule
appliedTo: validateClipCasting + saraandeva-episode-from-prompt SKILL.md
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---

# ep13 prompt-anatomy lessons (post-mortem)

ep13 cost ~3300 cr (1980 base + 990 iterations + 405 v2 + ...). Most overage came from misunderstanding how Kling Omni binds elements vs image-to-video. Here's the canonical pattern set.

## The 5 binding patterns (use → never)

### ✅ Pattern A — single canonical character (HIGH confidence)
Bind one `@CharName` from the Kling library. No scene needed if shot is close-up.

```json
"boundElements": [{ "tag": "Sara", "source": "library" }]
```

Use for: solo camera-asks, solo wonder-shots.

### ✅ Pattern B — 2 chars with DISTINCT visual differentiators (HIGH confidence)
Bind both characters + the scene. CRUCIAL: each character needs a unique visual anchor that the prompt explicitly mentions.

| Anchor type | Examples |
|---|---|
| Color-coded prop | pink-helmet vs teal-helmet, pink-scooter vs teal-scooter |
| Physical separation | one at left window, one at right window (frame separates them) |
| Distinct held object | one tossing ball, one catching |
| Distinct activity | one drawing in notebook, one peeking over shoulder |

```json
"boundElements": [
  { "tag": "Sara", "source": "library" },
  { "tag": "Eva", "source": "library" },
  { "tag": "playground-swings", "source": "library" }
]
```

Prompt MUST anchor each girl to her differentiator: *"@Sara on the LEFT swing wearing pink-helmet, @Eva on the RIGHT swing wearing teal-helmet"*.

### ❌ Pattern C — 2 sisters with similar pose (HIGH RISK — 50%+ dup rate)
Sara + Eva are both blonde girls. Without hard differentiation, Kling spawns 2 Evas instead of 1 Sara + 1 Eva.

❌ Bad: *"@Sara CENTER-LEFT both hands clasped at chest, @Eva CENTER-RIGHT both hands clasped at chest"*

✅ Fix: add a differentiator (Pattern B) OR pre-render the composition as a Nano Banana group still and use Pattern E.

### ❌ Pattern D — Group still + character avatars + scene + redescribe-composition (FIGHT MODE)
Worst possible pattern. The group still bakes in character likenesses + composition. Binding individual avatars on top tells Kling to ALSO render those characters from canonical avatars. Re-describing positions in the prompt tells Kling to render them in those positions ON TOP. Three sources of truth → composition fight → duplicates / wrong staging.

❌ Bad:
```json
"boundElements": [
  { "tag": "ep13-clip16-group", "source": "library" },  // has 3 girls baked in
  { "tag": "tennis-court", "source": "library" }         // adds scene
]
prompt: "Sara CENTER-LEFT (pink helmet, arms welcoming), Eva CENTER-RIGHT (teal helmet, hands cupped at mouth), Isabel FAR-RIGHT..."  // re-describes everything
```

ep13 v2.0 lost 360 cr to this on clips 16 + A. Lint rule 8f now blocks it.

### ✅ Pattern E — Group still ALONE + motion-only prompt (BEST for 3+ char compositions)
When the composition is complex (3+ chars, specific staging like kids-at-windows), pre-render it as a Nano Banana still, have the user manually upload to Kling library, bind ONLY the still, and write a motion-only prompt.

```json
"boundElements": [{ "tag": "ep13-clipA-group", "source": "library" }]
prompt: "Composition anchored by @ep13-clipA-group. Animate the still gently — only Papa's arm gestures and facial expression change. POSITION LOCK throughout. (BEAT 1 — 0-5s) Papa wiggles fingers. (BEAT 2 — 5-10s) Papa puffs cheeks. ..."
```

Trade-off: character likeness comes from the still, not from canonical avatars. If the still's Papa looks slightly off, the video's Papa will look slightly off. Mitigation: regenerate the Nano Banana still with `--n 3` and pick the cleanest match.

## The motion-only prompt template (Pattern E)

```
Composition anchored by @<group-still-tag>. Animate the still gently — [what specifically moves]. POSITION LOCK — every figure stays in their EXACT spot from the still throughout the entire {N}s. Exactly {COUNT} people in the entire frame, no extras, no additional spawns.

(BEAT 1, 0-5s) <action>. <Char>: "<dialogue>"
(BEAT 2, 5-10s) <action>. <Char>: "<dialogue>"
(BEAT 3, 10-15s) <action>. <Char>: "<dialogue>"

[NO position labels. NO character appearance details. NO scene description.]
```

## Multi-position-path trap (lesson #11 extension)

Even with "smooth continuous walk" disclaimer, describing one character at 3+ NAMED POSITIONS across beats spawns one instance per position.

❌ Bad: *"Papa starts at LEFT side, paces to BACK by sec 5, RIGHT by sec 10, FRONT by sec 15"*

✅ Fix: lock Papa to ONE position. Show beat changes via gesture/expression only. ep13 clip A v2.0 burned 135 cr on this; rule 8d (MULTI_POSITION_PATH_TRAP) now blocks it.

## Matcher prompt-similarity gotcha

`downloadOmniByPrompt` matches Kling renders to clip slots by prompt-text similarity. If two clips have near-identical prompt structures (e.g. both starting with "Composition anchored by @ep13-clip*-group"), the matcher can swap them — wolf render lands in `16.mp4` slot, tennis render gets corrupted.

Fix: each clip's prompt needs distinctive content (specific character names, dialogue, action verbs) beyond just the group-still tag.

## Submit idempotency (missing)

Each `submitOmniClip` call costs 90/135 cr. The script has no "already submitted this prompt in last 5 min?" guard. Accidentally firing twice (parallel scripts, retry loops, mistaken re-submits) burns credits silently.

Recommendation: add a hash-of-prompt cache file (`/tmp/submit-history.json`) that submitOmniClip checks before firing. Skip if same prompt-hash submitted in last 5 min.

## Workflow checklist (use this on every ep)

Per-clip decision tree:

```
1 character?
  → Pattern A. Done.

2 chars with distinct visual anchor?
  → Pattern B. Mention each anchor in prompt.

2+ chars without distinct anchor (sister-pair risk)?
  → Generate Nano Banana group still.
  → User uploads to Kling library.
  → Pattern E (group still + motion-only prompt).

3+ chars, complex staging?
  → Pattern E from the start.

Character moves through 3+ named positions?
  → REDESIGN. Lock to one position. Move via gestures only.
```

## Cost summary — what ep13 taught us

| Iteration | What | Cost | Outcome |
|---|---|---|---|
| v1 | 21 clips, all canonical avatars + scene + redescribe | 1980 cr | 4 dup-clips |
| v2.0 | 4 redo with group still + scene + redescribe | 360 cr | 2 clean (1, 12) + 2 worse (16, A) |
| v2.1 | 2 redo with group still alone + motion-only | 225 cr | A clean. 16 file-mismatched. |
| v2.2 | 1 redo clip 16 with canonical girls + scene | 90 cr | (in progress) |
| **Total ep13** | | **~2655 cr** | (vs 1980 ideal) |

35% overage from ignoring these rules. Apply Pattern E from the start on ep14+ for 3+ char clips.

## Action items locked in

- ✅ Lint rule 8d (MULTI_POSITION_PATH_TRAP) — HARD ERROR
- ✅ Lint rule 8e (SISTER_PAIR_SIMILAR_POSE_RISK) — WARNING + Nano Banana recommendation
- ✅ Lint rule 8f (PROMPT_OVERDESCRIBE_RISK) — HARD ERROR when group-still + 3+ position labels
- ⏳ TODO: lint rule 8g (MATCHER_SIMILARITY_RISK) — WARNING when 2+ clips have prompts starting with the same 50 chars
- ⏳ TODO: submitOmniClip submit-idempotency cache (5-min prompt-hash dedup)
- ⏳ TODO: bake Pattern E motion-only template into saraandeva-episode-from-prompt SKILL.md as default for 3+ char clips
