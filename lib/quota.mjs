/**
 * YouTube Data API v3 配额账本（per pt-day）。
 *
 * 单价表照官方文档（2024 版）：
 *   https://developers.google.com/youtube/v3/determine_quota_cost
 *
 * 用法：
 *   const r = await withQuota('search.list', () => yt.search.list({...}));
 *
 * 帽子从 .env 读 YOUTUBE_DAILY_QUOTA_CAP（默认 9500，留 500 缓冲低于 Google 默认 10000）。
 * 超过帽子时调用前会抛 QuotaCapExceededError，server.mjs 转 HTTP 429。
 *
 * 计费时机：调用前**预扣**。如果实际 API 调用因网络/认证失败，仍计了费 —— 这是
 * 故意保守，宁可少一点没用上的余额，也不要绕过帽子真的把 Google 那边干超。
 */
import { getDb } from './db.mjs';

export const OP_COSTS = Object.freeze({
  'search.list': 100,
  'videos.list': 1,
  'channels.list': 1,
  'captions.list': 50,
  'captions.download': 200,
  'commentThreads.insert': 50,
  'commentThreads.list': 1,
  'comments.insert': 50,
  'comments.list': 1,
});

const DEFAULT_CAP = 9500;
const HARD_LIMIT = 10000;

export class QuotaCapExceededError extends Error {
  constructor({ op, cost, used, cap, date }) {
    super(`配额帽 ${cap} 不够：${op} 需要 ${cost}，今日已用 ${used} (PT ${date})`);
    this.name = 'QuotaCapExceededError';
    this.code = 'QUOTA_CAP_EXCEEDED';
    this.status = 429;
    this.op = op;
    this.cost = cost;
    this.used = used;
    this.cap = cap;
    this.date = date;
  }
}

function ptDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function getCap() {
  const v = Number(process.env.YOUTUBE_DAILY_QUOTA_CAP);
  if (Number.isFinite(v) && v > 0) return Math.min(v, HARD_LIMIT);
  return DEFAULT_CAP;
}

export function getDailyUsage() {
  const db = getDb();
  const date = ptDate();
  const rows = db.prepare(`
    SELECT op, units_used, call_count, last_at
    FROM quota_usage
    WHERE pt_date = ?
    ORDER BY units_used DESC
  `).all([date]);
  const used = rows.reduce((s, r) => s + (Number(r.units_used) || 0), 0);
  const cap = getCap();
  return {
    date_pt: date,
    cap,
    hard_limit: HARD_LIMIT,
    used,
    remaining: Math.max(0, cap - used),
    pct: cap > 0 ? Math.round((used / cap) * 1000) / 10 : 0,
    by_op: rows.map((r) => ({
      op: r.op,
      units_used: Number(r.units_used) || 0,
      call_count: Number(r.call_count) || 0,
      unit_cost: OP_COSTS[r.op] ?? null,
      last_at: Number(r.last_at) || 0,
    })),
    op_costs: OP_COSTS,
  };
}

export function reserveQuota(op, callCount = 1) {
  const unitCost = OP_COSTS[op];
  if (unitCost == null) {
    console.warn(`[quota] unknown op "${op}" — skipping accounting`);
    return { used: 0, cap: getCap() };
  }
  const cost = unitCost * callCount;
  const db = getDb();
  const date = ptDate();
  const cap = getCap();

  db.exec('BEGIN');
  try {
    const cur = db.prepare(
      `SELECT COALESCE(SUM(units_used), 0) AS used FROM quota_usage WHERE pt_date = ?`
    ).get([date]);
    const used = Number(cur?.used) || 0;
    if (used + cost > cap) {
      db.exec('ROLLBACK');
      throw new QuotaCapExceededError({ op, cost, used, cap, date });
    }
    db.prepare(`
      INSERT INTO quota_usage (pt_date, op, units_used, call_count, last_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(pt_date, op) DO UPDATE SET
        units_used = units_used + excluded.units_used,
        call_count = call_count + excluded.call_count,
        last_at    = excluded.last_at
    `).run([date, op, cost, callCount, Date.now()]);
    db.exec('COMMIT');
    return { used: used + cost, cap, op, cost };
  } catch (e) {
    if (e instanceof QuotaCapExceededError) throw e;
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

/** 调用前预扣，再跑回调；调用失败也已计费（保守）。*/
export async function withQuota(op, fn, callCount = 1) {
  reserveQuota(op, callCount);
  return fn();
}
