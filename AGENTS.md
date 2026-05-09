# AGENTS.md — Setup guide for AI coding agents

This file is for **AI coding agents** (Claude Code, Codex, Cursor agents, etc.)
that are helping a human user deploy this project on their own machine.

## What this project is (one paragraph)

A Node.js Express server + SPA frontend that:
1. Searches YouTube via official Data API v3 with subscriber/duration filters
2. Generates a "course-rep style" comment with Gemini (no external links)
3. Lets the human review + post the comment **one at a time** to YouTube
4. Reads back like-count / reply-count, displays a carousel of posted comments

OAuth scope is `youtube.force-ssl` (read + post comments). The repo ships with
the OAuth client_id/secret pre-filled in `env.example`. Each end user must
still go through their own browser-based OAuth consent to get their own
`token.json`.

## Hard requirements before you start

- **Node.js ≥ 20** (`node --version`)
- **A modern browser** (Chrome/Edge/Firefox) — needed for OAuth consent
- **A Gmail address that has been added as a test user** in this project's GCP
  consent screen by the repo owner. Without this, OAuth will fail with
  "Access blocked: this app's access is restricted." The repo owner is
  liuyika3 — ask them to add the user's Gmail before you proceed.
- **A Gemini API key** — the user must have one ready, or know where to get
  it: https://aistudio.google.com/apikey (free tier is sufficient).
- **Network access to Google APIs.** If the user is in Mainland China, they
  need a working HTTP proxy (Clash / v2ray / Shadowsocks) on `127.0.0.1`.

## Setup script (execute in order)

### Step 1 — Clone

```bash
git clone git@github.com:liuyika3/auto-ytb-comment.git
cd auto-ytb-comment
```

If SSH is unavailable use HTTPS:
```bash
git clone https://github.com/liuyika3/auto-ytb-comment.git
```

### Step 2 — Install dependencies

```bash
npm install
```

Expected: ~80 MB of `node_modules`, no errors. If `node-sqlite3-wasm` fails,
ensure Node ≥ 20 (older versions don't have the required WASM APIs).

### Step 3 — Create `.env` from template

```bash
cp env.example .env
```

(Windows cmd: `copy env.example .env`. PowerShell: `Copy-Item env.example .env`.)

Then **edit `.env`** and set exactly one value:

```
GEMINI_API_KEY=<the user's Gemini key>
```

Do **not** edit `YOUTUBE_OAUTH_CLIENT_ID` or `YOUTUBE_OAUTH_CLIENT_SECRET` —
they are pre-filled and shared across users. If the user is in China and
network calls to Google fail, also uncomment and adjust `HTTPS_PROXY` /
`HTTP_PROXY` to match their local proxy port (commonly 7890 for Clash).

### Step 4 — Browser OAuth (REQUIRES HUMAN INTERACTION)

```bash
npm run oauth
```

What happens:
1. The script prints a Google consent URL and starts a local listener on
   `http://localhost:8765/oauth2callback`.
2. The script opens (or prints) the URL. **The human user** must:
   - Open the URL in a browser
   - Sign in with the Gmail that was added as a test user
   - On the consent screen, **check ALL requested scopes**, especially
     "Manage your YouTube account" (this is `youtube.force-ssl`)
   - Click "Continue"
3. The browser redirects to localhost; the script writes
   `credentials/token.json` and prints "授权成功".

**You (the agent) cannot do step 2 yourself.** Tell the user clearly that they
must click through the browser, then wait for them to confirm.

Common failures:
- `redirect_uri_mismatch` — GCP OAuth client must whitelist
  `http://localhost:8765/oauth2callback`. The repo owner manages this.
- `Access blocked: ... not verified / restricted` — the user's Gmail isn't on
  the test users list. Ask the repo owner to add it.
- `ETIMEDOUT` to googleapis.com — set `HTTPS_PROXY` and retry.

### Step 5 — Smoke test

```bash
npm run smoke
```

Expected: prints the user's YouTube channel info (id, title, subscriberCount).
Costs 1 quota unit. If this works, OAuth + scope are correct.

### Step 6 — Start the server

```bash
npm run start
```

Expected log:
```
youtube-auto-comment running → http://127.0.0.1:8766
[quota] 今日 (PT YYYY-MM-DD) 已用 0 / 9500（剩 9500）
```

Open `http://127.0.0.1:8766/` in the browser. The pill in the top-right should
say **"就绪 · 可发评"** (ready, can post). If it says "缺写权限" (missing
write permission) the OAuth scope didn't include `youtube.force-ssl` — go
back to step 4 and re-consent.

On Windows you can also double-click `run-server.bat`.

## How to verify everything works (end-to-end test)

1. Tab ① 搜索: type a keyword (e.g. "投资"), set sub_min=10000, dur_min=600s,
   click 开始筛. You should see video cards.
2. Tab ① click "生成「课代表」评论" on one card. Wait ~5–10 s for Gemini.
3. Tab ② 草稿: the draft appears with the generated text.
4. **DO NOT** click "发送" unless the user wants to post a real comment to
   YouTube. It is irreversible and consumes 50 quota units.
5. Tab ④ 配置: confirm the quota panel shows the units consumed by step 1
   (~102 units for one search) and step 2 (~50–250 for the draft).

## Quota cap (important — you cannot exceed this)

Default cap is **9500 units / day**, hard limit **10000** (Google's). When the
running total hits the cap, every YouTube API call returns HTTP 429 before
hitting Google. Reset is at midnight Pacific Time.

Per-call cost (committed in `lib/quota.mjs`):
| op | cost |
|---|---|
| `search.list` | 100 |
| `videos.list`, `channels.list` | 1 |
| `captions.list` | 50 |
| `captions.download` | 200 (rarely succeeds for other people's videos) |
| `commentThreads.insert` | 50 |
| `commentThreads.list` | 1 |

Rough budget: 1 search + 25 drafts + 25 posts ≈ 7600 units.

## Common errors during steps above

| Error | Cause | Fix |
|---|---|---|
| `database is locked` on startup | stale `data.db.lock/` from a crashed previous run | `rm -r data.db.lock/` (it's a directory, not a file) |
| `ETIMEDOUT` reaching Google | Node not using the OS proxy | set `HTTPS_PROXY` in `.env` |
| `invalid_grant` | OAuth client_secret rotated, or refresh_token revoked | re-run `npm run oauth` |
| `quotaExceeded` from Google directly | the local cap is set above 10000 or this user has been throttled | reset cap to ≤ 10000, wait until PT midnight |
| `Access blocked: app not verified` | Gmail isn't a test user in the GCP consent screen | ask the repo owner |

## Files you may need to inspect

- `server.mjs` — Express routes, error handling, shutdown hooks
- `lib/quota.mjs` — quota accounting (PT-day-keyed, SQLite-backed)
- `lib/db.mjs` — schema + DAL
- `lib/search.mjs`, `lib/captions.mjs`, `lib/comments.mjs` — API call sites
- `oauth-login.mjs` — OAuth flow (also defines the SCOPES list)
- `paths.mjs` — `.env` loader, OAuth credential resolution

## What you should NOT touch

- `credentials/token.json` — bound to the user's account; never commit, never
  share between machines without re-doing oauth
- `data.db` and `data.db.lock/` — runtime state; never commit
- `.env` — has the user's Gemini key; never commit, never log

## Repo conventions

- ES modules only (`"type": "module"` in `package.json`).
- No TypeScript, no build step. Direct `node` execution.
- New files go under `lib/` for backend, `public/` for frontend assets.
- The frontend is plain HTML + vanilla JS, no bundler. Edit
  `public/index.html`, `public/app.js`, `public/style.css` directly.
