---
name: Kling library upload UI breaks weekly — don't automate, do it manually
description: The "create new bound element" flow on Kling (subject-panel → Add Image → Uploads → Confirm → Name → Generate) changes selectors fast. Roles flip between menuitem/text/button, classes get renamed (.image-item-mask → .image-item-source), visibility toggles. Spent hours on May 3 trying to keep up; never got past 1/7 elements. The PROVEN automation paths (submitOmniClip, downloadOmniByPrompt) use different selectors that have stayed stable.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
**Don't try to automate Kling library element creation. Confirmed twice (ep09 and re-confirmed in the same day after a recipe update).** Spent hours on 2026-05-03 chasing selector changes between yesterday's codegen and today's UI:
- `.image-item-mask` → `.image-item-source` (renamed)
- `History` button → gone, replaced by `@`-mention → "Add from Element Library"
- `Add Image` → flipped between role=`menuitem` and role=`text` and visibility:hidden depending on dropdown state
- `Daily Free Use 3/3Add` text trigger for secondary upload (count varies)
- New `Image/Video` LINK + `Image-Upload` text entry path

The user got frustrated and asked me to stop. They were right.

**Reliable path:** the user uploads + creates each new bound element manually in Kling's UI. ~30 sec per element via drag-drop. Same one-time cost per episode but it actually works.

**Why automate elsewhere then?** `submitOmniClip.mjs` and `downloadOmniByPrompt.mjs` use different selectors (`#design-view-container textbox`, `.subject-item` for picking, `getByRole('contentinfo').getByRole('button', { name: 'Generate' })`) that have stayed stable across the May 2026 redesign. They've been used for 70+ submissions across ep03–ep08 reliably. Keep automating those.

**How to apply going forward:**
1. The `saraandeva-episode-from-prompt` skill should keep listing new bound elements clearly (it does).
2. The skill's hand-off report should list the 5–7 elements with paths so the user can `open` them and drag-drop into Kling. Skip step 4 (uploadElements.mjs) of the orchestrator — call it "MANUAL: drag-drop these N PNGs into Kling library" instead.
3. After manual upload, run `submitEpisode --episode=NN --skip-prereq --only=...` to skip the prereq phase.
4. If automation is genuinely needed long-term, use a Chrome extension or screen-coordinate macOS UI automation rather than Playwright DOM selectors — Kling's element-create UI is too volatile.

**What's the time cost actually being saved?** ~3–5 min/episode for 7 elements. At 1 ep/day × 90 days = ~5 hours total. That's less than a single bad debugging session like 2026-05-03 (4+ hours, zero successful uploads). Manual is the correct trade-off until Kling stabilizes the create-element UI or exposes an API.
