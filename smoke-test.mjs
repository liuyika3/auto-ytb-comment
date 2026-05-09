/**
 * 使用 credentials/token.json 调用 YouTube Data API v3（当前：列出「我的频道」）。
 * 运行：npm run smoke
 */
import { getYoutube } from './lib/youtube-auth.mjs';

let youtube;
try {
  youtube = await getYoutube();
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}

const res = await youtube.channels.list({
  part: ['snippet', 'contentDetails'],
  mine: true,
});

const items = res.data.items || [];
console.log('OK — 已调用 youtube.channels.list(mine: true)');
console.log('频道数量:', items.length);
for (const ch of items) {
  console.log('-', ch.snippet?.title, '| id:', ch.id);
}
