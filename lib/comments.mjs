import { getYoutube } from './youtube-auth.mjs';
import { insertPost, insertPostStats, getPostById } from './db.mjs';
import { withQuota } from './quota.mjs';

/**
 * 发顶级评论。需要 OAuth scope: youtube.force-ssl
 * @returns {Promise<{ postId: number|bigint, commentId: string }>}
 */
export async function postTopComment({ videoId, text, draftId = null }) {
  const yt = getYoutube();
  const res = await withQuota('commentThreads.insert', () => yt.commentThreads.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        videoId,
        topLevelComment: {
          snippet: { textOriginal: text },
        },
      },
    },
  }));
  const thread = res.data;
  const commentId = thread.id;
  const top = thread.snippet?.topLevelComment?.snippet || {};

  const postId = insertPost({ draftId, videoId, commentId, text });

  insertPostStats({
    postId,
    likeCount: Number(top.likeCount) || 0,
    replyCount: Number(thread.snippet?.totalReplyCount) || 0,
  });

  return { postId, commentId };
}

/**
 * 抓某条已发评论的最新点赞/回复数，写入 post_stats。
 * @param {number|bigint} postId
 * @returns {Promise<{ likeCount: number, replyCount: number }>}
 */
export async function refreshPostStats(postId) {
  const post = getPostById(postId);
  if (!post) throw new Error(`post id=${postId} 不存在`);
  const yt = getYoutube();
  const res = await withQuota('commentThreads.list', () => yt.commentThreads.list({
    part: ['snippet'],
    id: [post.comment_id],
    maxResults: 1,
  }));
  const thread = (res.data.items || [])[0];
  if (!thread) {
    insertPostStats({ postId, likeCount: 0, replyCount: 0 });
    return { likeCount: 0, replyCount: 0, missing: true };
  }
  const top = thread.snippet?.topLevelComment?.snippet || {};
  const likeCount = Number(top.likeCount) || 0;
  const replyCount = Number(thread.snippet?.totalReplyCount) || 0;
  insertPostStats({ postId, likeCount, replyCount });
  return { likeCount, replyCount };
}
