---
name: publish-shorts
description: 'Create YouTube Shorts from animated Kling clips. Concatenates clips into 60-second vertical videos (1080x1920) with story audio and title overlay. Use when user says "create shorts", "make shorts", "YouTube shorts", "short videos", or "create reels".'
argument-hint: '"Story Title" | --all [--clip-duration N] [--dry-run]'
---

# Create YouTube Shorts from Story Clips

Takes animated Kling clips from completed stories and creates vertical YouTube Shorts (~60 seconds, 1080x1920).

## Quick Start

```bash
# One story
python3 scripts/create-shorts.py "Cinderella"

# All stories with animated clips
python3 scripts/create-shorts.py --all

# Custom clip duration (default 3s)
python3 scripts/create-shorts.py "Cinderella" --clip-duration 4

# Preview only
python3 scripts/create-shorts.py --all --dry-run
```

## How It Works

1. Finds animated Kling clips in `exports/stories/<SafeTitle>/youtube/<SafeTitle>/illustrations/animated/`
2. Selects clips to fit within 59 seconds (YouTube Shorts max 60s)
3. Trims each clip to `clip-duration` seconds (default 3s)
4. Scales to vertical 1080x1920 (center crop)
5. Adds story title overlay for first 3 seconds
6. Adds audio from the story's podcast MP3
7. Outputs to `exports/shorts/<SafeTitle>_short.mp4`

## Output

- Format: MP4, H.264, AAC audio
- Resolution: 1080x1920 (9:16 vertical)
- Duration: ~60 seconds max
- Location: `exports/shorts/`

## Requirements

- Animated clips must exist (run Kling pipeline first)
- ffmpeg + ffprobe at `/usr/local/bin/`
- Python 3

## Searches Both Directories

The script searches both `exports/stories/` and `exports/stories/_published/` for story folders.

## After Creating Shorts

Upload to YouTube as a Short:
```bash
# Use the YouTube upload script or upload manually
# YouTube automatically detects vertical videos ≤60s as Shorts
```

Shorts are great for driving app installs — add a pinned comment with the app download link.
