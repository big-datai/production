# LinkedIn post — Ep 4 launch

## Variant A — Agentic AI thesis (long, ~280 words)

In the same week:
• **Meta acquired Limitless AI** — Dan Siroker's wearable AI memory pendant.
• **LinkedIn**: AI Engineer is the #1 fastest-growing US job (+143% YoY).
• **Anthropic's 2026 Agentic Coding Trends Report** — multi-agent teams, hours-long task horizons, "agent skills" as a new primitive.

The frame everyone's writing about: AI engineers go from writing code → orchestrating systems that write code.

I've been building proof of that frame in a deliberately personal context — a Pixar-style kids' show starring my two daughters and our two real-life dogs.

Episode 4 dropped today: https://youtu.be/cbJZAgm0HxY
Channel: https://www.youtube.com/@SaraAndEva

Under the hood it uses every primitive that's trending:

🧠 **Anthropic Agent Skill** (.claude/skills/saraandeva-episode/) — domain instructions + scripts that Claude loads on demand. Writes specs, validates, submits to Kling, downloads, concats, uploads. One agentic loop.

🛡 **Hard-failing validators** — every prompt lint-checks for the duplicate-character bug (~10% raw rate even with anchors), repeated tags, library naming, missing negatives. Catches problems before credits spent.

⏱ **Long task horizon** — submit-only queue with creation-time spacing, then scheduled-wakeup orchestration for the wait + download phase. Runs across hours, not seconds.

📊 **Per-episode math:** 18 clips, ~3 min finished story, ~$80 in render credits, ~25 min of submit wallclock.

The thesis: senior AI engineers can now individually ship the kind of polished, end-to-end product that used to need a 50-person studio. The skill-as-primitive + tool-as-composition pattern is the unlock.

Big tech is acquiring agents. Senior engineers are building agentic pipelines that ship real product on weekends. Both are very real.

---

## Variant B — Punchy build-focused (short, ~150 words)

Anthropic's 2026 Agentic Coding Trends Report is calling it: AI engineering is shifting from writing code → orchestrating systems that write code. Agent skills + multi-agent + long task horizons.

I built proof in the most personal way I could think of — a Pixar-style kids' show starring my two daughters and our two real-life dogs.

Ep 4 just dropped: https://youtu.be/cbJZAgm0HxY
Channel: https://www.youtube.com/@SaraAndEva

The pipeline is one Anthropic Agent Skill + a half-dozen scripts:
• Spec → lint → submit → render → bulk-download → concat → upload
• Hard-failing prompt validators (catch ~10% duplicate-character bug at intake)
• Submit-only queue with time-spaced creation order
• Scheduled-wakeup orchestration for hours-long task horizons

Per episode: 18 clips, ~3 min finished, ~$80 credits, ~25 min wallclock.

A 50-person studio used to be required. Now it's a senior engineer + a weekend + the right primitives.

---

## Suggested attachment

Use a frame from the helmet-reveal scene (around 2:05–2:15 in ep04). LinkedIn posts with media get ~3× engagement.

Extract via:
```bash
ffmpeg -ss 130 -i ep04_v1.mp4 -frames:v 1 -vf scale=1200:-1 ep04_thumbnail.png
```
