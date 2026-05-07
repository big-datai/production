---
name: No new git branches in this repo
description: Don't create branches/worktrees in goreadling-production — commit directly to main
type: feedback
originSessionId: 428cea9d-1fc6-4511-936c-3e5cde8f68c3
---
In `/Volumes/Samsung500/goreadling-production` and its subprojects (saraandeva/, stories/), do not create new git branches or worktrees. Commit directly to `main`.

**Why:** User accumulated 8+ stale `claude/<adjective>-<scientist>` worktree branches that all needed to be merged or deleted manually. Branching added cleanup work with zero benefit for solo development. User stated explicitly: "branching is not allowed" (2026-05-01).

**How to apply:**
- When asked to do work, do it on `main` directly. Don't suggest "let me create a branch" or "should I make a feature branch."
- Don't run `git checkout -b`, `git branch <new>`, or `git worktree add`.
- If the harness auto-spawns a `claude/*` worktree at session start, complete the task and have the user merge it back to main — but don't proliferate further.
- If a merge is needed, prefer fast-forward to main; for divergent work, merge with `-X ours` or `-X theirs` per user direction rather than creating intermediate branches.
