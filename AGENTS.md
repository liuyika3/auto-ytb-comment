# AGENTS.md — Setup guide for AI coding agents

This file is for **AI coding agents** (Claude Code, Codex, Cursor agents, etc.)
helping a human user deploy this project on their own machine. The repo
ships with **no secrets** — the user brings their own GCP OAuth client and
Gemini key, and pastes them into a web wizard at first launch.

## What this project does

A local Node.js + Express + SPA frontend that:
1. Searches YouTube via Data API v3 (subscriber / duration filters)
2. Generates a "course-rep" Chinese comment with Gemini (no external links)
3. Lets the human review + post each comment one at a time
4. Reads back like-count / reply-count, displays in a carousel

OAuth scopes used: `youtube.readonly` + `youtube.force-ssl`.

## Hard requirements

- **Node.js ≥ 20** (`node --version`)
- **A modern browser** for the in-server wizard + Google consent
- **The user's own GCP project** with YouTube Data API v3 + their own Desktop
  OAuth client (see § "Google Cloud setup" below — walk the user through it)
- **A Gemini API key** (free at https://aistudio.google.com/apikey)
- **Network access to Google APIs.** China users typically need an HTTP
  proxy on `127.0.0.1` (Clash 7890 / v2rayN 10809 / etc.)

## Setup script (execute in order)

### Step 1 — Clone & install

```bash
git clone git@github.com:liuyika3/auto-ytb-comment.git
# HTTPS fallback: git clone https://github.com/liuyika3/auto-ytb-comment.git
cd auto-ytb-comment
npm install
```

Expect ~80 MB of `node_modules`. If `node-sqlite3-wasm` fails, confirm Node
≥ 20.

### Step 2 — Google Cloud setup (HUMAN, ~5 min)

Walk the user through this. They need a Gmail account with YouTube channel access.

1. Open https://console.cloud.google.com → top-bar project dropdown →
   **New project** → name e.g. `auto-ytb-comment` → Create → switch to it.

2. **Enable the API.** Left menu → APIs & Services → Library → search
   "YouTube Data API v3" → click → **Enable**.

3. **OAuth consent screen.** Left menu → APIs & Services → OAuth consent
   screen.
   - User type: **External**
   - App name: anything (e.g. `auto-ytb-comment`)
   - User support email + Developer contact: the user's Gmail
   - **Scopes step**: click "Add or remove scopes" → search `youtube` →
     check `https://www.googleapis.com/auth/youtube.force-ssl` → Update
   - **Test users**: add the user's own Gmail (and any teammate emails).
   - Save and continue.

4. **Create the OAuth client.** Left menu → APIs & Services → Credentials →
   **+ Create credentials** → **OAuth client ID**.
   - Application type: ⚠️ **Desktop app** (not Web — Desktop allows loopback
     redirects without registration).
   - Name: anything.
   - Click Create. A modal shows **Client ID** and **Client secret** — copy
     both. (Also downloadable as JSON.)

5. **Get a Gemini key** at https://aistudio.google.com/apikey → "Create API
   key" → copy.

The user should now have 3 strings: gemini_key, oauth_client_id,
oauth_client_secret.

### Step 3 — Start the server

```bash
npm run start
# or on Windows: double-click run-server.bat
```

Expected log:
```
[setup] 还没完成初始设置；打开 http://127.0.0.1:8766/ 走向导
youtube-auto-comment running → http://127.0.0.1:8766
[quota] 今日 (PT YYYY-MM-DD) 已用 0 / 9500（剩 9500）
```

### Step 4 — In-browser wizard (HUMAN INTERACTION)

The user opens **http://127.0.0.1:8766/**. The setup overlay shows.

**Step 1 of the overlay**: paste the 3 values from § Step 2, click "保存凭据".

**Step 2 of the overlay**: click "跳转 Google 登录". The browser navigates
to Google's consent page. The user must:
- Sign in with the Gmail they added as a test user
- See "Google hasn't verified this app" warning → click Advanced → Continue
- Check **all** requested scopes (especially "Manage your YouTube account"
  — this is `youtube.force-ssl`)
- Click Continue

The browser auto-redirects back to `http://127.0.0.1:8766/oauth2callback?...`,
which is handled by **the same server**, exchanges the code for a token,
saves it to `credentials/token.json`, and redirects to `/?setup=ok`. The
overlay disappears, the main UI shows.

**You (the agent) cannot click through that browser flow.** Pause and tell
the user to do it, then wait for them to say "done" or for the overlay to
disappear.

Common failures here:
| Symptom | Cause | Fix |
|---|---|---|
| "Access blocked: app not verified" / "Access blocked: this app is restricted" | user's Gmail isn't a test user | go back to Step 2.3, add the email |
| `redirect_uri_mismatch` | OAuth client type was set to **Web app** instead of **Desktop app** in Step 2.4 | recreate as Desktop app |
| `ETIMEDOUT` to oauth2.googleapis.com | Node can't reach Google directly | set `HTTPS_PROXY=http://127.0.0.1:<proxy_port>` in `.env` and restart |
| Wizard's "保存凭据" returns 500 | `config/local.json` directory not writable | check permissions on `config/` |
| Wizard already shows "已保存" but you want to change values | click "改 Gemini key / OAuth 凭据" in ④配置 tab to reset |

### Step 5 — Verify it works

1. Tab ① 搜索 → type a keyword (e.g. "投资"), set sub_min=10000,
   dur_min=600 → click 开始筛 → video cards should appear.
2. Tab ① click "生成「课代表」评论" on a card → wait ~5–10 s → success.
3. Tab ② 草稿 → the draft is here, editable.
4. Tab ④ 配置 → quota panel should show ~352 units used (100 search +
   1 videos + 1 channels + 250 captions+download).
5. **DO NOT** click 发送 unless the user wants to post a real comment.
   It's irreversible (you can delete from YouTube manually, but reputation
   risk + 50 quota burn already happened).

## Files the agent should care about

- `lib/runtime-config.mjs` — read/write `config/local.json` (the wizard's data)
- `paths.mjs` — OAuth credential resolution chain: runtime-config → env →
  client_secret JSON
- `lib/youtube-auth.mjs` — async `getYoutube()` returns a freshly-built client
  every call, so wizard updates take effect without restart
- `lib/quota.mjs` — daily cap, PT-day-keyed, default 9500
- `server.mjs` — routes including `/api/setup/*` and `/oauth2callback`
- `public/app.js` — wizard logic; renders based on `/api/setup/status`

## Quota cap (cannot exceed)

Default 9500 units/day, hard limit 10000. When over, every YouTube API
call returns HTTP 429 before hitting Google. Reset midnight Pacific Time.

| op | cost |
|---|---|
| `search.list` | 100 |
| `videos.list`, `channels.list` | 1 |
| `captions.list` | 50 |
| `captions.download` | 200 (rarely succeeds for other people's videos) |
| `commentThreads.insert` | 50 |
| `commentThreads.list` | 1 |

Budget rule of thumb: 1 search + 25 drafts + 25 posts ≈ 7600.

## Things you should NOT do as an agent

- Do **not** commit `.env`, `credentials/token.json`, `config/local.json`,
  `data.db`. All are in `.gitignore` already.
- Do **not** copy a token.json from one machine to another. It's bound to
  one Google account; sharing = giving someone else write access to that
  YouTube account.
- Do **not** click "发送" on a draft on behalf of the user without explicit
  confirmation. It's a real, public, irreversible YouTube comment.
- Do **not** raise `YOUTUBE_DAILY_QUOTA_CAP` above 10000. Google's hard
  limit is 10000; setting higher just means you'll hit Google's quota
  errors instead of our soft cap.

## Repo conventions

- ES modules only (`"type": "module"`). No build step.
- Backend in `server.mjs` + `lib/*.mjs`.
- Frontend in `public/` — plain HTML + vanilla JS, no bundler.
- New routes: add to `server.mjs` (express router style).
- New library helpers: drop in `lib/`.
