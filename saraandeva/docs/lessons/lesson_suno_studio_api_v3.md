---
name: Suno song download via studio-api-prod feed v3 — UI click flow is unreliable
description: Suno's More-options menu click is reliably blocked by a base-ui-inert modal overlay (`<div data-base-ui-portal id="_r_dl_">`) — Playwright retries fail. Authoritative path is the studio-api-prod.suno.com/api/feed/v3 POST endpoint, called from inside the logged-in suno.com tab using Clerk session JWT. CDN URLs (cdn1.suno.ai/<id>.mp3) are public — fetch from Node, NOT page.evaluate (CORS blocks it). Suno still auto-titles songs from the chorus phrase (lyric file's `# heading` is ignored).
type: lesson
severity: hard-rule
appliedTo: sunoDownloadLatest.mjs + any Suno automation
originSessionId: b923ac34-5ab5-423b-b230-8d3dc1dc3937
---
# Endpoint

```
POST https://studio-api-prod.suno.com/api/feed/v3
Authorization: Bearer <Clerk JWT>
Content-Type: application/json

{
  "cursor": null,
  "limit": 50,
  "filters": {
    "disliked": "False",
    "trashed": "False",
    "fromStudioProject": { "presence": "False" },
    "stem": { "presence": "False" },
    "workspace": { "presence": "True", "workspaceId": "default" }
  }
}
```

JWT comes from `await window.Clerk?.session?.getToken({ template: "studio-api" })` (fallback to `getToken()`) inside the suno.com tab.

Response shape: `{ clips: [{ id, title, status, audio_url, created_at, ... }, ...] }`. Filter on `status` (complete/streamed/sent_to_chat) and `audio_url`.

# Critical: download from Node, not the page

The CDN URL (`https://cdn1.suno.ai/<id>.mp3`) is publicly accessible WITHOUT auth — fetch directly from Node:

```js
const r = await fetch(audio_url);          // Node-side
const buf = Buffer.from(await r.arrayBuffer());
fs.writeFileSync(outPath, buf);
```

Doing this from `page.evaluate` fails with `TypeError: Failed to fetch` due to CORS — the suno.com origin can't fetch cdn1.suno.ai with credentials.

# Why the UI dance is broken

The "More options" → "Download" → "MP3 Audio" sequence triggers a `<div data-open data-base-ui-inert>` modal overlay (id `_r_dl_`) that intercepts pointer events. Playwright retries dozens of times then times out. Don't try to fix the click selectors — use the API.

# Other gotchas

- Suno **auto-titles songs from the chorus**, not from the lyric file's `# heading`. So a file named `Hold On Ginger.md` with a chorus "HOLD ON, GINGER... by the stripes on the blue!" comes back titled `Stripes Blue`. Match by chorus phrase or just take top-of-list.
- Two variants per `Create song` click — feed returns both. First is usually fine.
- The new lyric `.md` format (`# LYRICS` then `# GENRE`) → `sunoSongs.mjs` parses both, fills both Suno boxes (genre placeholder is the textbox with `shimmering synths, afrobeats` placeholder text per Suno codegen).

# Working scripts

- `.claude/skills/saraandeva-episode/scripts/sunoDownloadLatest.mjs` — list / download by title-substring match
- `.claude/skills/saraandeva-episode/scripts/sunoSongs.mjs` — submit new lyric file (paste-side selectors fixed; download-side still uses unreliable UI dance — prefer composing `sunoSongs.mjs` for submit + `sunoDownloadLatest.mjs` for download)
