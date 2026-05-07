---
name: Kling chip-rendered prompt has space before possessive 's
description: When Kling renders an @-tag chip, the cached prompt becomes `Element1 's` (space before apostrophe-s) but specs write `@Eva's` tight. The download matcher must consume the optional possessive after both forms or the prefix score drops below MIN_SCORE.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
In `downloadOmniByPrompt.mjs`, when matching spec prompts against IndexedDB-cached task prompts, both regexes need to absorb an optional possessive `'s` after the bound-element token:

```js
.replace(/Element\d+(\s*'s)?/g, "X")             // cache form: "Element1 's"
.replace(/@[A-Za-z][A-Za-z0-9_-]*(\s*'s)?/g, "X") // spec form:  "@Eva's"
```

**Why it matters:** ep08 clips 7 ("@Eva's face — she's mid-laugh…") and 9 ("@Eva's face. Her eyes are still squeezed…") rendered fine on Kling but the matcher returned `no match` because the spec normalized to `…on x's face…` while the cache normalized to `…on x 's face…`. The longest-common-prefix score capped at ~25 chars — below MIN_SCORE=30 — so they were silently dropped. Cost ~30 min and a moment of "did the renders fail?" panic.

**How to apply:** any time you write a Kling-cache parser, account for chip rendering inserting whitespace around the chip boundary (before `'s`, between adjacent chips, etc.). Test with prompts that have `@Tag's` possessive form.
