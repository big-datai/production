# Claude Code session contract — goreadling-production

## HARD RULE: work on `main` directly, ignore the auto-worktree

Claude Desktop creates a fresh git worktree under
`/Volumes/Samsung500/goreadling-production/saraandeva/.claude/worktrees/<auto-name>/`
on every new session. This is a harness artifact — **NOT** the repository you should be editing.

**Operate on the main repo path in every command:**

| Use this path | NOT this path |
|---|---|
| `/Volumes/Samsung500/goreadling-production/` | `…/saraandeva/.claude/worktrees/<anything>/` |
| `/Volumes/Samsung500/goreadling-production/saraandeva/` | `…/saraandeva/.claude/worktrees/…/saraandeva/` |

Every `Bash` invocation MUST begin with `cd /Volumes/Samsung500/goreadling-production/saraandeva && …`
or pass absolute paths to every file argument.

## Why this matters

- The user explicitly forbade git branches/worktrees in this repo (memory: `feedback_no_branches.md`, 2026-05-01).
- Sessions that "forget context" usually find files where the previous session left them on `main`, not in the new worktree.
- Music files, episode outputs, content drops — all live on `main` at `/Volumes/Samsung500/goreadling-production/saraandeva/…`. Looking for them inside the worktree returns "not found" and feels like amnesia.

## Detection

`SessionStart` hook in `.claude/settings.json` fires at session start. When `$PWD`
matches `.claude/worktrees/`, it prints a one-line warning so you (and Claude) see
the situation immediately. Then keep working on `main`.

## Cleanup

If many old worktrees have accumulated under `saraandeva/.claude/worktrees/`,
they consume disk + clutter `git worktree list`. From the main repo:

```bash
cd /Volumes/Samsung500/goreadling-production
for w in $(git worktree list --porcelain | awk '/^worktree.*claude\/worktrees/ {print $2}'); do
  # Skip the currently-active session's worktree — find its name from your prompt's env block
  git worktree remove --force "$w" 2>/dev/null
done
git worktree prune
git branch -D $(git branch | grep "^  claude/" | tr -d ' ') 2>/dev/null
```

Only the currently-active session worktree should remain. Future Claude
sessions will create their own.

## Where things actually live

- Sara & Eva project root: `/Volumes/Samsung500/goreadling-production/saraandeva/`
- Sara & Eva pipeline: `…/saraandeva/.claude/skills/saraandeva-episode/scripts/pipeline/`
- Music: `…/saraandeva/assets/music/`
- Per-episode content: `…/saraandeva/content/episodes/ep<NN>/`
- Final renders: `…/saraandeva/season_01/episode_<NN>/`
- Memory: `~/.claude/projects/-Volumes-Samsung500-goreadling-production/memory/`
