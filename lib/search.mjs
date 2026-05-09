import { getYoutube } from './youtube-auth.mjs';
import { upsertVideo, recordSearch, listVideosForSearch } from './db.mjs';
import { withQuota } from './quota.mjs';

/** ISO 8601 duration (PT#H#M#S) → seconds. */
export function parseIsoDuration(iso) {
  if (!iso || typeof iso !== 'string') return 0;
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, d, h, mi, s] = m;
  return (Number(d) || 0) * 86400 + (Number(h) || 0) * 3600 + (Number(mi) || 0) * 60 + (Number(s) || 0);
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Run keyword search end-to-end: search.list → videos.list → channels.list → filter.
 * Caches video rows + records the search in the SQLite db.
 *
 * @param {object} opts
 * @param {string} opts.query
 * @param {number} opts.subMin       — min subscriberCount
 * @param {number} opts.durMinSec    — min duration in seconds
 * @param {number} [opts.maxResults=25]
 * @param {'date'|'viewCount'|'rating'|'relevance'} [opts.order='relevance']
 * @returns {Promise<{ searchId: number|bigint, videos: object[], debug: object }>}
 */
export async function runKeywordSearch({
  query,
  subMin,
  durMinSec,
  maxResults = 25,
  order = 'relevance',
}) {
  const yt = getYoutube();

  const videoDurationHint =
    durMinSec >= 1200 ? 'long' : durMinSec >= 240 ? 'medium' : 'any';

  const searchRes = await withQuota('search.list', () => yt.search.list({
    part: ['id'],
    q: query,
    type: ['video'],
    maxResults: Math.min(50, Math.max(1, maxResults)),
    order,
    videoDuration: videoDurationHint,
    safeSearch: 'none',
  }));

  const videoIds = (searchRes.data.items || [])
    .map((it) => it.id?.videoId)
    .filter(Boolean);

  if (videoIds.length === 0) {
    const sid = recordSearch({ query, subMin, durMinSec, hitVideoIds: [] });
    return { searchId: sid, videos: [], debug: { rawHits: 0 } };
  }

  // videos.list 一次最多 50
  const vidsRaw = [];
  for (const ids of chunk(videoIds, 50)) {
    const r = await withQuota('videos.list', () => yt.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: ids,
      maxResults: 50,
    }));
    vidsRaw.push(...(r.data.items || []));
  }

  // channels.list 拿订阅数
  const channelIds = [...new Set(vidsRaw.map((v) => v.snippet?.channelId).filter(Boolean))];
  const subsByChannel = new Map();
  for (const ids of chunk(channelIds, 50)) {
    const r = await withQuota('channels.list', () => yt.channels.list({
      part: ['statistics'],
      id: ids,
      maxResults: 50,
    }));
    for (const ch of r.data.items || []) {
      subsByChannel.set(ch.id, Number(ch.statistics?.subscriberCount) || 0);
    }
  }

  const fetchedAt = Date.now();
  const videosNormalized = vidsRaw.map((v) => {
    const subs = subsByChannel.get(v.snippet?.channelId) ?? 0;
    const durationSec = parseIsoDuration(v.contentDetails?.duration);
    const thumbs = v.snippet?.thumbnails || {};
    const thumbnailUrl =
      thumbs.maxres?.url ||
      thumbs.high?.url ||
      thumbs.medium?.url ||
      thumbs.default?.url ||
      null;
    return {
      video_id: v.id,
      channel_id: v.snippet?.channelId,
      channel_title: v.snippet?.channelTitle ?? '',
      title: v.snippet?.title ?? '',
      description: v.snippet?.description ?? '',
      duration_sec: durationSec,
      view_count: Number(v.statistics?.viewCount) || 0,
      channel_subs: subs,
      thumbnail_url: thumbnailUrl,
      published_at: v.snippet?.publishedAt ?? null,
      fetched_at: fetchedAt,
    };
  });

  const filtered = videosNormalized.filter(
    (v) => v.channel_subs >= subMin && v.duration_sec >= durMinSec
  );

  for (const row of filtered) upsertVideo(row);

  const sid = recordSearch({
    query,
    subMin,
    durMinSec,
    hitVideoIds: filtered.map((v) => v.video_id),
  });

  return {
    searchId: sid,
    videos: listVideosForSearch(sid),
    debug: {
      rawHits: videoIds.length,
      afterMetadata: videosNormalized.length,
      afterFilter: filtered.length,
    },
  };
}
