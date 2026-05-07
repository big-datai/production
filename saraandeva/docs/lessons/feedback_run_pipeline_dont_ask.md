---
name: When user says "run the pipeline" / "work independently" / "finish it" — don't pause between steps
description: For multi-step Sara & Eva episode pipelines (gen scenes → upload library → submit clips → wait for renders → download → audit → assemble → upload), don't ask for confirmation between every phase. Execute end-to-end and report progress.
type: feedback
originSessionId: 1c83c57f-9f62-40be-ba04-994976f63dde
---
User pushed back on 2026-05-03 mid-ep09: I'd asked "Want me to kick off the Nano Banana generations now?" right after they said "work independently to finish it" the prior turn. They responded: *"yes, why do you ask each step i asked you to run whole pipeline?"*

**Rule:** when the user says any of "run the pipeline", "work independently", "finish it", "kick it off", or similar end-to-end phrases for an established pipeline (where the steps are well-known), execute the whole thing without asking for confirmation between steps. Report progress and any genuine blockers (errors, rate limits, ambiguous decisions), but don't ask permission for the next phase if it's the obvious next step.

**Why:** the 90-day sprint requires episode work to flow without manual gating. Asking between every phase kills velocity AND signals the user has to babysit. (See `project_270_episode_sprint.md`.)

**How to apply:**
- After spec generation, just run scene/prop gen → library upload → clip submission → download → audit → assemble → upload, all in one go.
- Only stop and ask when something genuinely ambiguous happens (e.g. a render fails for an unclear reason, or the user has to make a creative-direction call mid-flow).
- For long-running phases (Kling render queue, Suno song generation), run in background with progress logs. Report status periodically rather than asking "should I continue?"
- Cost approval was already given when the user approved the budget envelope; don't re-confirm at every spend step within the approved range.
