---
name: Kling library tile names can have hidden whitespace
description: Library element names created in Kling's UI sometimes contain leading/trailing whitespace, breaking strict text matchers — always use whitespace-tolerant regex.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
When matching a Kling library tile by name (e.g. in `submitOmniClip.mjs`'s `addLibraryElement`), tiles created via the manual Kling UI flow (codegen-2026-05-02) can end up with **leading or trailing whitespace** in their `textContent`. This is invisible in the tile UI and in `innerText` (which trims), but it's there in the raw DOM.

Concrete case (ep08): the `dental-coin` element had `textContent = " dental-coin"` (12 chars, leading space, char code 32). The `text=/^dental-coin$/i` regex matched 0 tiles. `gas-mask`, `bathroom`, `front-fence-sidewalk` were all clean. Burned ~30 minutes debugging before the diagnostic revealed it.

**Why:** Always use whitespace-tolerant regex when matching library tile names by exact equivalence:
- Bad: `text=/^${escaped}$/i`
- Good: `text=/^\\s*${escaped}\\s*$/i`

**How to apply:** Any time you write a Kling library lookup, default to the `\\s*` flavor. The diagnostic at `_inspect_library_tiles.mjs` extracts raw `textContent` + character codes — use it if a tile is mysteriously not matching despite appearing in `allInnerTexts()`.
