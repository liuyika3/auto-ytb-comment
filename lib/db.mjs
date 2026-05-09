import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqliteWasm from 'node-sqlite3-wasm';

const { Database } = sqliteWasm;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data.db');

let _db = null;

export function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      video_id        TEXT PRIMARY KEY,
      channel_id      TEXT NOT NULL,
      channel_title   TEXT NOT NULL,
      title           TEXT NOT NULL,
      description     TEXT NOT NULL,
      duration_sec    INTEGER NOT NULL,
      view_count      INTEGER NOT NULL DEFAULT 0,
      channel_subs    INTEGER NOT NULL DEFAULT 0,
      thumbnail_url   TEXT,
      published_at    TEXT,
      fetched_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS searches (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      query         TEXT NOT NULL,
      sub_min       INTEGER NOT NULL,
      dur_min_sec   INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      hit_count     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS search_hits (
      search_id   INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
      video_id    TEXT NOT NULL REFERENCES videos(video_id),
      rank        INTEGER NOT NULL,
      PRIMARY KEY (search_id, video_id)
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id        TEXT NOT NULL REFERENCES videos(video_id),
      comment_text    TEXT NOT NULL,
      model           TEXT NOT NULL,
      prompt_version  TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      created_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_video ON drafts(video_id);
    CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

    CREATE TABLE IF NOT EXISTS posts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_id     INTEGER REFERENCES drafts(id),
      video_id     TEXT NOT NULL REFERENCES videos(video_id),
      comment_id   TEXT NOT NULL UNIQUE,
      text         TEXT NOT NULL,
      posted_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_posts_video ON posts(video_id);
    CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON posts(posted_at);

    CREATE TABLE IF NOT EXISTS post_stats (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id      INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      like_count   INTEGER NOT NULL,
      reply_count  INTEGER NOT NULL,
      fetched_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_post_stats_post ON post_stats(post_id, fetched_at DESC);

    CREATE TABLE IF NOT EXISTS quota_usage (
      pt_date     TEXT NOT NULL,
      op          TEXT NOT NULL,
      units_used  INTEGER NOT NULL DEFAULT 0,
      call_count  INTEGER NOT NULL DEFAULT 0,
      last_at     INTEGER NOT NULL,
      PRIMARY KEY (pt_date, op)
    );
    CREATE INDEX IF NOT EXISTS idx_quota_date ON quota_usage(pt_date);
  `);
}

export function upsertVideo(row) {
  const db = getDb();
  db.prepare(`
    INSERT INTO videos (video_id, channel_id, channel_title, title, description,
                        duration_sec, view_count, channel_subs, thumbnail_url, published_at, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(video_id) DO UPDATE SET
      channel_title = excluded.channel_title,
      title         = excluded.title,
      description   = excluded.description,
      duration_sec  = excluded.duration_sec,
      view_count    = excluded.view_count,
      channel_subs  = excluded.channel_subs,
      thumbnail_url = excluded.thumbnail_url,
      published_at  = excluded.published_at,
      fetched_at    = excluded.fetched_at
  `).run([
    row.video_id, row.channel_id, row.channel_title, row.title, row.description,
    row.duration_sec, row.view_count, row.channel_subs, row.thumbnail_url,
    row.published_at, row.fetched_at,
  ]);
}

export function recordSearch({ query, subMin, durMinSec, hitVideoIds }) {
  const db = getDb();
  const now = Date.now();
  const insertSearch = db.prepare(`
    INSERT INTO searches (query, sub_min, dur_min_sec, created_at, hit_count)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertHit = db.prepare(`
    INSERT OR IGNORE INTO search_hits (search_id, video_id, rank) VALUES (?, ?, ?)
  `);
  db.exec('BEGIN');
  try {
    const info = insertSearch.run([query, subMin, durMinSec, now, hitVideoIds.length]);
    const sid = info.lastInsertRowid;
    hitVideoIds.forEach((vid, i) => insertHit.run([sid, vid, i]));
    db.exec('COMMIT');
    return sid;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function listVideosForSearch(searchId) {
  return getDb().prepare(`
    SELECT v.* FROM videos v
    JOIN search_hits h ON h.video_id = v.video_id
    WHERE h.search_id = ?
    ORDER BY h.rank
  `).all([searchId]);
}

export function listRecentSearches(limit = 20) {
  return getDb().prepare(`
    SELECT * FROM searches ORDER BY created_at DESC LIMIT ?
  `).all([limit]);
}

export function insertDraft({ videoId, commentText, model, promptVersion }) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO drafts (video_id, comment_text, model, prompt_version, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run([videoId, commentText, model, promptVersion, Date.now()]);
  return info.lastInsertRowid;
}

export function listDrafts(status = 'pending', limit = 100) {
  return getDb().prepare(`
    SELECT d.*, v.title AS video_title, v.channel_title, v.thumbnail_url, v.duration_sec
    FROM drafts d
    JOIN videos v ON v.video_id = d.video_id
    WHERE d.status = ?
    ORDER BY d.created_at DESC
    LIMIT ?
  `).all([status, limit]);
}

export function setDraftStatus(draftId, status) {
  getDb().prepare(`UPDATE drafts SET status = ? WHERE id = ?`).run([status, draftId]);
}

export function insertPost({ draftId, videoId, commentId, text }) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO posts (draft_id, video_id, comment_id, text, posted_at)
    VALUES (?, ?, ?, ?, ?)
  `).run([draftId ?? null, videoId, commentId, text, Date.now()]);
  return info.lastInsertRowid;
}

export function insertPostStats({ postId, likeCount, replyCount }) {
  getDb().prepare(`
    INSERT INTO post_stats (post_id, like_count, reply_count, fetched_at)
    VALUES (?, ?, ?, ?)
  `).run([postId, likeCount, replyCount, Date.now()]);
}

export function listPostsWithLatestStats(limit = 200) {
  return getDb().prepare(`
    SELECT p.*,
           v.title AS video_title, v.channel_title, v.thumbnail_url,
           (SELECT s.like_count  FROM post_stats s WHERE s.post_id = p.id ORDER BY s.fetched_at DESC LIMIT 1) AS like_count,
           (SELECT s.reply_count FROM post_stats s WHERE s.post_id = p.id ORDER BY s.fetched_at DESC LIMIT 1) AS reply_count,
           (SELECT s.fetched_at  FROM post_stats s WHERE s.post_id = p.id ORDER BY s.fetched_at DESC LIMIT 1) AS stats_at
    FROM posts p
    JOIN videos v ON v.video_id = p.video_id
    ORDER BY p.posted_at DESC
    LIMIT ?
  `).all([limit]);
}

export function listPostsToRefresh({ maxAgeMs = 3 * 24 * 3600 * 1000, minStaleMs = 6 * 3600 * 1000 } = {}) {
  const now = Date.now();
  const rows = getDb().prepare(`
    SELECT p.id, p.comment_id, p.video_id, p.posted_at,
           (SELECT MAX(s.fetched_at) FROM post_stats s WHERE s.post_id = p.id) AS last_fetch
    FROM posts p
    WHERE (? - p.posted_at) <= ?
  `).all([now, maxAgeMs]);
  return rows.filter((r) => {
    const lastFetch = r.last_fetch ?? 0;
    return (now - lastFetch) >= minStaleMs;
  });
}

export function getPostById(id) {
  return getDb().prepare(`
    SELECT p.*, v.title AS video_title, v.channel_title, v.thumbnail_url
    FROM posts p
    JOIN videos v ON v.video_id = p.video_id
    WHERE p.id = ?
  `).get([id]);
}

export const dbPath = DB_PATH;

export function closeDb() {
  if (_db && _db.isOpen) {
    try { _db.close(); } catch (e) { console.warn('[db] close failed:', e.message); }
  }
  _db = null;
}
