#!/usr/bin/env bash
# Watch ep16 clips dir and auto-fire produceEpisode.mjs when all 22 mp4s land.
# Re-runs every 60s until complete, then runs production pipeline.
set -e

CLIPS=/Volumes/Samsung500/goreadling-production/saraandeva/season_01/episode_16/clips
PROJECT=/Volumes/Samsung500/goreadling-production/saraandeva

echo "👀 Watching $CLIPS for all 22 clips..."
while true; do
  count=$(ls "$CLIPS"/*.mp4 2>/dev/null | wc -l | tr -d ' ')
  echo "$(date '+%H:%M:%S')  $count/22 clips landed"
  if [ "$count" -ge 22 ]; then
    echo "✅ All 22 clips present — firing produceEpisode.mjs"
    break
  fi
  sleep 60
done

cd "$PROJECT"
node .claude/skills/saraandeva-episode/scripts/produceEpisode.mjs \
  --episode 16 \
  --title "The Tooth Fairy's Big Mistake! 🦷 Sara and Eva" \
  --privacy unlisted \
  --start-from 2 \
  --hero-clip 20 2>&1 | tee content/episodes/ep16/_produce_log.txt
