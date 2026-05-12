# clip 28 — Nano first/last-frame A/B test

ep14 clip 28 is a known-difficult 4-character "Mama returns home, family yells SURPRISE!" beat.
Originally split into 28.1 + 28.2 to mitigate Kling identity-drift on 4-char shots.

This sandbox tests if **Nano-Banana first/last-frame** can deliver it in ONE 5-sec clip.

## Result: ✅ WINNER — Pair A (over-shoulder camera arc)

Final render: `audits/render3_camera_arc_WINNER_2026-05-11/source.mp4`

**Why it works:**
- Mama physically steps FORWARD past the doorway in beats 1-2, so by the
  reveal the door is out of frame — eliminates the door-color drift that
  plagued Pair B's static composition.
- Camera arc over Mama's shoulder naturally cuts to the family reveal.
- All identity + continuity locks held: bun, cream-tan bag, pink top,
  Papa bald+beard+glasses, Eva blonde curly, Sara brown hair, warm
  afternoon daylight throughout.

**Lesson:** for first/last-frame composition continuity issues, prefer
camera moves where the inconsistent element walks out of frame over
trying to lock it pixel-stable across both frames.

## Folder structure

- `pair_A_over_shoulder/` — ✅ WINNING set (start + end + action.txt)
- `pair_B_zoom_out/`      — Pair B set (door drift + body proportion issues)
- `candidates/`           — all Nano candidates explored along the way
- `audits/`               — frame-by-frame audits of rendered Kling outputs
  - `render1_camera_arc_2026-05-11/`       — first Pair A render
  - `render2_camera_pullback_2026-05-11/`  — Pair B render (door/bag/time issues)
  - `render3_camera_arc_WINNER_2026-05-11/` — ✅ final winner

## How to submit either pair to Kling

1. Open Kling Studio → New video → image-to-video first/last-frame mode
2. First frame: `pair_X/start.png`
3. Last frame:  `pair_X/end.png`
4. Prompt:      paste `pair_X/action.txt`
5. Duration: 5 sec, Audio: ON, Quality: 720p
6. After render, save mp4 into `audits/render_<timestamp>/source.mp4` for posterity
