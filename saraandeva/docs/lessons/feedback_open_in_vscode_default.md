---
name: Always open files in VS Code instead of showing inline diffs
description: User feedback 2026-05-07 mid-ep15 fix — "open in vscode always". When the agent is presenting a file (clip JSON, prompt edit diff, episode.json, lyric .md, generated PNG, etc.) for the user to review, run `open -a "Visual Studio Code" <path>` so the user can see it in their editor instead of scanning a long diff in chat. Inline diffs are still fine for tiny single-line changes; multi-section / long-prompt edits ALWAYS get opened in VS Code in parallel with the chat summary.
type: feedback
severity: hard-rule
appliedTo: every file the agent asks the user to review, every "here's what I'm proposing to change" moment
---

# The rule

When you present a file or proposed change for user review, open the file in VS Code:

```bash
open -a "Visual Studio Code" <path>
```

Do this even if you also paste a diff/summary in chat. The user reads the file in VS Code; the chat summary is a navigation aid, not the primary review surface.

# When to apply

- Any clip JSON before you propose to change it (`content/episodes/ep<NN>/<N>.json`)
- Any episode.json edit
- Any generated lyric `.md` you want approval on
- Any newly generated asset PNG (use `open <path>` for Preview, but VS Code is fine for PNGs too)
- Any auto-fix plan or audit JSON before the user decides to apply
- The plan file when in plan mode (already opened by Claude Code)

# When NOT to apply

- Read-only research where the file is just being inspected by the agent
- Tiny edits the user obviously won't review (typo fix, single-key registry edit)
- Files the user just told you to edit without discussion

# How to combine with chat summary

Open in VS Code FIRST, then in chat say "opened `<path>` in VS Code, summary of proposed changes below" + tight diff. The user can scroll the file in their editor while reading your one-paragraph summary.

# Anti-pattern to avoid

❌ Pasting a 60-line diff inline and saying "review please". The user has to scroll chat, lose their place, and they can't search the file. Open in VS Code instead.
❌ Multiple files: open ALL of them at once with multiple `open -a "Visual Studio Code"` invocations (or pass them all on one line: `open -a "Visual Studio Code" a.json b.json c.json`).
