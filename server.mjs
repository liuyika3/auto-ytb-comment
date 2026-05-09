/**
 * 自动评论流水线本地服务（半自动）：
 *   关键词 → 搜索过滤 → 候选评论（Gemini 课代表式）→ 你逐条点发送 → 回读点赞/回复 → 前端走马灯
 *
 * 启动：npm run start
 * 默认端口 8766（与 OAuth 回调 8765 错开），通过 COMMENT_PORT 覆盖。
 *
 * **重要**：发评要 OAuth scope youtube.force-ssl。如未升级，会在启动日志里警告，
 *           前端「发送」按钮也会拒绝调用并提示重新 oauth。
 */
import './paths.mjs';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runKeywordSearch } from './lib/search.mjs';
import { fetchCaptionTextOrNull } from './lib/captions.mjs';
import { generateCourseRepComment } from './lib/gemini.mjs';
import { postTopComment, refreshPostStats } from './lib/comments.mjs';
import { runStartupRefresh } from './lib/scheduler.mjs';
import {
  getDb,
  closeDb,
  listRecentSearches,
  listVideosForSearch,
  insertDraft,
  listDrafts,
  setDraftStatus,
  listPostsWithLatestStats,
  listPostsToRefresh,
  dbPath,
} from './lib/db.mjs';
import { getDailyUsage, QuotaCapExceededError } from './lib/quota.mjs';
import { tokenPath } from './paths.mjs';
import {
  getOAuthCreds,
  getGeminiApiKey,
  updateConfig,
  clearConfig,
  getSafeStatus,
  configPath,
} from './lib/runtime-config.mjs';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.COMMENT_PORT) || 8766;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── 工具：当前 token scope ───────────────────────────────────
function readTokenScope() {
  try {
    if (!fs.existsSync(tokenPath)) return { ok: false, reason: 'no-token', scope: '' };
    const t = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const scope = t.scope || '';
    const hasWrite = /youtube\.force-ssl/.test(scope);
    return {
      ok: hasWrite,
      reason: hasWrite ? 'ok' : 'readonly-only',
      scope,
    };
  } catch (e) {
    return { ok: false, reason: 'parse-error', scope: '', err: e.message };
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ─── 工具：本机 OAuth 重定向 URI（同 server 端口）─────────────
function getServerRedirectUri() {
  return `http://127.0.0.1:${PORT}/oauth2callback`;
}

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

function buildSetupStatus() {
  const cfg = getSafeStatus();
  const sc = readTokenScope();
  return {
    ...cfg,
    has_token: sc.ok,
    token_scope_ok: sc.ok,
    token_scope: sc.scope,
    redirect_uri: getServerRedirectUri(),
    needs_setup: !cfg.has_oauth_creds || !cfg.has_gemini || !sc.ok,
  };
}

// ─── 路由 ──────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    port: PORT,
    db: dbPath,
    config_path: configPath,
    scope: readTokenScope(),
    proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null,
    geminiKey: Boolean(getGeminiApiKey()),
    has_oauth_creds: Boolean(getOAuthCreds()),
    quota: getDailyUsage(),
  });
});

app.get('/api/quota', (req, res) => {
  res.json(getDailyUsage());
});

// ─── 设置向导 ────────────────────────────────────────────────
app.get('/api/setup/status', (req, res) => {
  res.json(buildSetupStatus());
});

app.post('/api/setup/save', (req, res) => {
  const { gemini_api_key, oauth_client_id, oauth_client_secret, gemini_model } = req.body || {};
  const patch = {};
  if (gemini_api_key   != null) patch.gemini_api_key   = gemini_api_key;
  if (gemini_model     != null) patch.gemini_model     = gemini_model;
  if (oauth_client_id  != null) patch.oauth_client_id  = oauth_client_id;
  if (oauth_client_secret != null) patch.oauth_client_secret = oauth_client_secret;
  updateConfig(patch);
  res.json({ ok: true, status: buildSetupStatus() });
});

app.post('/api/setup/oauth-start', (req, res) => {
  const creds = getOAuthCreds();
  if (!creds) {
    return res.status(412).json({
      error: 'OAuth client 未配置；先 POST /api/setup/save 填 client_id + secret',
    });
  }
  const oauth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    getServerRedirectUri()
  );
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: OAUTH_SCOPES,
  });
  res.json({ ok: true, auth_url: authUrl });
});

// Google 走 redirect 回这里。是 GET，不是 JSON API。
app.get('/oauth2callback', asyncHandler(async (req, res) => {
  const { code, error } = req.query || {};
  if (error) {
    return res.status(400).type('html').send(
      `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;background:#1a1a1a;color:#eee">
       <h2>授权被拒：${escapeHtmlSafe(String(error))}</h2>
       <p>常见原因：你的 Gmail 还没被加进 GCP 同意屏幕的「测试用户」。</p>
       <p><a href="/" style="color:#6ea7ff">← 回到设置页面</a></p></body>`
    );
  }
  if (!code || typeof code !== 'string') {
    return res.status(400).type('html').send('<p>缺少 code 参数</p>');
  }
  const creds = getOAuthCreds();
  if (!creds) {
    return res.status(412).type('html').send('<p>OAuth client 凭据丢失，请回到主页重填。</p>');
  }
  const oauth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    getServerRedirectUri()
  );
  try {
    const { tokens } = await oauth2Client.getToken(code);
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
    console.log('[oauth] token 已写入', tokenPath);
    return res.redirect('/?setup=ok');
  } catch (e) {
    console.error('[oauth] 换 token 失败', e);
    return res.status(500).type('html').send(
      `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;background:#1a1a1a;color:#eee">
       <h2>换 token 失败</h2><pre>${escapeHtmlSafe(String(e?.message || e))}</pre>
       <p><a href="/" style="color:#6ea7ff">← 回到设置页面</a></p></body>`
    );
  }
}));

app.post('/api/setup/logout', (req, res) => {
  if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
  res.json({ ok: true, status: buildSetupStatus() });
});

app.post('/api/setup/reset', (req, res) => {
  if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
  clearConfig();
  res.json({ ok: true, status: buildSetupStatus() });
});

function escapeHtmlSafe(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

app.get('/api/searches', (req, res) => {
  res.json({ items: listRecentSearches(50) });
});

app.post('/api/search', asyncHandler(async (req, res) => {
  const { query, sub_min, dur_min_sec, max_results, order } = req.body || {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query 必填' });
  }
  const subMin = Math.max(0, Number(sub_min) || 0);
  const durMinSec = Math.max(0, Number(dur_min_sec) || 0);
  const maxResults = Math.min(50, Math.max(1, Number(max_results) || 25));
  const ord = ['relevance', 'date', 'viewCount', 'rating'].includes(order) ? order : 'relevance';

  const r = await runKeywordSearch({
    query: query.trim(),
    subMin,
    durMinSec,
    maxResults,
    order: ord,
  });
  res.json({ search_id: Number(r.searchId), videos: r.videos, debug: r.debug });
}));

app.get('/api/searches/:id/videos', (req, res) => {
  const sid = Number(req.params.id);
  if (!Number.isFinite(sid)) return res.status(400).json({ error: 'id invalid' });
  res.json({ videos: listVideosForSearch(sid) });
});

app.post('/api/draft', asyncHandler(async (req, res) => {
  const { video_id } = req.body || {};
  if (!video_id) return res.status(400).json({ error: 'video_id 必填' });

  const row = getDb()
    .prepare('SELECT * FROM videos WHERE video_id = ?')
    .get(video_id);
  if (!row) return res.status(404).json({ error: 'video 未在缓存中（先跑搜索）' });

  let captionText = null;
  let captionStatus = 'absent';
  try {
    captionText = await fetchCaptionTextOrNull(video_id);
    captionStatus = captionText ? 'fetched' : 'forbidden_or_none';
  } catch (e) {
    captionStatus = 'error: ' + e.message;
  }

  const gen = await generateCourseRepComment({
    title: row.title,
    channel: row.channel_title,
    description: row.description,
    captionText,
  });

  const draftId = insertDraft({
    videoId: video_id,
    commentText: gen.text,
    model: gen.model,
    promptVersion: gen.promptVersion,
  });

  res.json({
    draft_id: Number(draftId),
    video_id,
    text: gen.text,
    model: gen.model,
    caption_status: captionStatus,
  });
}));

app.get('/api/drafts', (req, res) => {
  const status = (req.query.status || 'pending').toString();
  res.json({ items: listDrafts(status, 200) });
});

app.post('/api/drafts/:id/discard', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id invalid' });
  setDraftStatus(id, 'discarded');
  res.json({ ok: true });
});

app.post('/api/drafts/:id/post', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id invalid' });

  const sc = readTokenScope();
  if (!sc.ok) {
    return res.status(412).json({
      error: '当前 OAuth token 没有写权限（缺 youtube.force-ssl）',
      hint: '删除 credentials/token.json，然后重新 npm run oauth；GCP 同意屏幕也要勾上 youtube.force-ssl',
      scope: sc.scope,
    });
  }

  const draft = getDb().prepare('SELECT * FROM drafts WHERE id = ?').get(id);
  if (!draft) return res.status(404).json({ error: 'draft 不存在' });
  if (draft.status !== 'pending') {
    return res.status(409).json({ error: `draft 状态是 ${draft.status}，不能重复发送` });
  }

  const overrideText = (req.body?.text || '').toString();
  const text = overrideText.trim() || draft.comment_text;

  const r = await postTopComment({
    videoId: draft.video_id,
    text,
    draftId: id,
  });
  setDraftStatus(id, 'posted');
  res.json({ ok: true, post_id: Number(r.postId), comment_id: r.commentId });
}));

app.get('/api/posted', (req, res) => {
  res.json({ items: listPostsWithLatestStats(200) });
});

app.post('/api/posted/refresh', asyncHandler(async (req, res) => {
  const due = listPostsToRefresh();
  const results = [];
  for (const row of due) {
    try {
      const r = await refreshPostStats(row.id);
      results.push({ post_id: row.id, ...r });
    } catch (e) {
      results.push({ post_id: row.id, error: e.message });
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  res.json({ scanned: due.length, items: results });
}));

app.post('/api/posted/:id/refresh', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id invalid' });
  const r = await refreshPostStats(id);
  res.json({ post_id: id, ...r });
}));

// ─── 错误兜底 ──────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err instanceof QuotaCapExceededError) {
    console.warn('[quota-cap]', req.method, req.url, '→ 429', err.message);
    return res.status(429).json({
      error: err.message,
      code: err.code,
      op: err.op,
      cost: err.cost,
      used: err.used,
      cap: err.cap,
      date_pt: err.date,
      hint: '帽子是本地保护，YouTube 真实配额仍可能更紧。明天 PT 0 点重置；或临时把 .env 里 YOUTUBE_DAILY_QUOTA_CAP 调大（不能超过 10000）。',
    });
  }
  const status = err?.code === 'ENOENT' ? 500 : err?.response?.status || err?.status || 500;
  const msg = err?.response?.data?.error?.message || err?.message || String(err);
  console.error('[server]', req.method, req.url, '→', status, msg);
  res.status(status).json({ error: msg });
});

// ─── 启动 ──────────────────────────────────────────────────────
async function bootstrap() {
  // 触发一次 db init
  getDb();

  const status = buildSetupStatus();
  if (status.needs_setup) {
    console.log('\n[setup] 还没完成初始设置；打开 http://127.0.0.1:' + PORT + '/ 走向导：');
    if (!status.has_oauth_creds) console.log('  - 缺 OAuth client_id / client_secret');
    if (!status.has_gemini) console.log('  - 缺 GEMINI_API_KEY');
    if (!status.token_scope_ok) console.log('  - 缺 token 或 scope，需要走一次 OAuth 同意');
  }

  app.listen(PORT, () => {
    console.log(`\n youtube-auto-comment running → http://127.0.0.1:${PORT}\n`);
    const q = getDailyUsage();
    console.log(`[quota] 今日 (PT ${q.date_pt}) 已用 ${q.used} / ${q.cap}（剩 ${q.remaining}）`);
    if (status.token_scope_ok) {
      runStartupRefresh().catch((e) => console.warn('[scheduler]', e.message));
    } else {
      console.log('[scheduler] 跳过启动扫描（未授权或 scope 不够）');
    }
  });
}

// ─── 退出钩子：node-sqlite3-wasm 用 mkdir 当锁，崩溃/Ctrl-C 不会自动清。
//     这里显式 close()，rmdirSync(data.db.lock) 由 wasm 内部触发。
let _shuttingDown = false;
function shutdown(reason, exitCode = 0) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.log(`\n[shutdown] ${reason} → 关闭数据库`);
  closeDb();
  process.exit(exitCode);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP',  () => shutdown('SIGHUP'));
process.on('uncaughtException', (e) => {
  console.error('[uncaughtException]', e);
  shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e);
  shutdown('unhandledRejection', 1);
});

bootstrap();
