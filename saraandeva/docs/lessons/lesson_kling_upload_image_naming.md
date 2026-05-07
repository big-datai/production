---
name: Kling assigns @Image1, @Image2, @Image3... to uploaded elements (numbered, not named)
description: When a PNG is uploaded to Kling via the Image/Video → Image-Upload flow (memory rule #6), the bound element gets a SEQUENTIAL numbered tag — @Image1 for the first upload, @Image2 for the second, etc. NOT the semantic name from the spec ("dentist-waiting", "dental-coin").
type: feedback
originSessionId: ep08-session
---

**The actual Kling convention for uploads:**

When you upload a file via Image/Video → Image-Upload, Kling auto-binds it as a numbered element:
- 1st upload in this clip → `@Image1`
- 2nd upload → `@Image2`
- 3rd upload → `@Image3`

This is NOT configurable per upload. Library-named elements (Sara, Eva) keep their names; **upload-mode elements always become @Image<N>**.

**Implication for spec authoring:**

Bound elements with `source: "upload"` in the JSON spec must:
1. Reference `@Image1`, `@Image2`, etc. in the prompt — NOT the semantic tag (`@dentist-waiting`).
2. The upload ORDER matters — first listed `source: "upload"` element becomes Image1, second becomes Image2, etc.
3. Library-bound elements (`source: "library"`) can be intermixed in the boundElements list and keep their semantic @-names. They don't count toward the @ImageN numbering.

**Corrected spec template:**
```json
{
  "boundElements": [
    { "tag": "Eva",              "source": "library" },
    { "tag": "Image1",           "source": "upload",
      "asset": "dentist-waiting",
      "file": "/Volumes/.../dentist_waiting.png" },
    { "tag": "Image2",           "source": "upload",
      "asset": "dental-coin",
      "file": "/Volumes/.../dental_coin.png" }
  ],
  "prompt": "Wide shot in @Image1 — sea-mural waiting room. @Eva stands on the giant tooth chair holding @Image2 high. ..."
}
```

The `asset` field documents what the upload IS (for human readers + reuse tracking) while `tag` is what Kling actually calls it.

**Submit-script implication (submitOmniClip.mjs):**

For source:"upload" elements, the script should:
1. Upload via Image/Video → Image-Upload flow (memory rule #6 — filechooser + setFiles)
2. Track upload count and confirm the autocomplete dropdown will offer `@Image<N>`
3. Type the prompt with `@Image<N>` autocomplete chips at the right positions

**Originated:** ep08 — Render B kept failing because the script searched the library for `dentist-waiting`. The user pasted the actual Kling-formatted prompt showing `@Image1` and `@Image2` chips. From now on, ALL upload-mode elements use the numbered convention.
