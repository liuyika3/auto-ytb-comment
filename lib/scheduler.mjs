import { listPostsToRefresh } from './db.mjs';
import { refreshPostStats } from './comments.mjs';

/** 启动时扫一遍 3 天内、距上次抓取 ≥ 6 小时的已发评论。 */
export async function runStartupRefresh({ logger = console } = {}) {
  let due;
  try {
    due = listPostsToRefresh();
  } catch (e) {
    logger.warn('[scheduler] 读取待刷新列表失败:', e.message);
    return { scanned: 0, refreshed: 0, errors: 0 };
  }
  if (due.length === 0) {
    logger.log('[scheduler] 没有需要刷新的已发评论');
    return { scanned: 0, refreshed: 0, errors: 0 };
  }
  logger.log(`[scheduler] 待刷新 ${due.length} 条评论`);

  let refreshed = 0;
  let errors = 0;
  for (const row of due) {
    try {
      const r = await refreshPostStats(row.id);
      refreshed += 1;
      logger.log(`  · post#${row.id} ${row.comment_id} → 👍${r.likeCount} 💬${r.replyCount}`);
    } catch (e) {
      errors += 1;
      logger.warn(`  · post#${row.id} 刷新失败:`, e.message);
    }
    // 给点喘息，避免一口气打满 quota
    await new Promise((r) => setTimeout(r, 200));
  }
  return { scanned: due.length, refreshed, errors };
}
