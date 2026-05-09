import { getYoutube } from './youtube-auth.mjs';
import { withQuota, QuotaCapExceededError } from './quota.mjs';

/** 优先级：用户语言匹配 > 非自动生成 > 任意 */
function pickCaptionTrack(items, preferLangs = ['zh', 'zh-Hans', 'zh-CN', 'en']) {
  if (!Array.isArray(items) || items.length === 0) return null;
  for (const lang of preferLangs) {
    const hit = items.find((c) => (c.snippet?.language || '').toLowerCase().startsWith(lang.toLowerCase()));
    if (hit) return hit;
  }
  const nonAuto = items.find((c) => c.snippet?.trackKind && c.snippet.trackKind !== 'asr');
  return nonAuto || items[0];
}

/** 简单 SRT/SBV/VTT → 纯文本（去时间戳与索引行） */
function transcriptToText(raw) {
  if (!raw) return '';
  return raw
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^\d+$/.test(t)) return false;
      if (/-->/g.test(t)) return false;
      if (/^WEBVTT/i.test(t)) return false;
      return true;
    })
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 拉取视频字幕。**官方 API 几乎只允许视频所有者下载**，对他人视频通常返回 403/forbidden。
 * 我们捕获权限错误并返回 null（让上游回退到「标题+描述」生成评论）。
 *
 * @returns {Promise<string|null>} 纯文本字幕，或 null
 */
export async function fetchCaptionTextOrNull(videoId) {
  const yt = getYoutube();

  let track = null;
  try {
    const list = await withQuota('captions.list', () =>
      yt.captions.list({ part: ['snippet'], videoId })
    );
    track = pickCaptionTrack(list.data.items || []);
  } catch (e) {
    if (e instanceof QuotaCapExceededError) throw e;
    if (isPermissionDenied(e)) return null;
    throw e;
  }
  if (!track) return null;

  try {
    const dl = await withQuota('captions.download', () =>
      yt.captions.download({ id: track.id, tfmt: 'srt' }, { responseType: 'text' })
    );
    const raw = typeof dl.data === 'string' ? dl.data : String(dl.data ?? '');
    const text = transcriptToText(raw);
    return text || null;
  } catch (e) {
    if (e instanceof QuotaCapExceededError) throw e;
    if (isPermissionDenied(e)) return null;
    throw e;
  }
}

function isPermissionDenied(e) {
  const code = e?.code ?? e?.response?.status ?? e?.status;
  if (code === 403 || code === 401) return true;
  const reason = e?.errors?.[0]?.reason || e?.response?.data?.error?.errors?.[0]?.reason || '';
  return /forbidden|insufficientPermissions|captionNotAvailable|captionsNotEnabled/i.test(reason);
}
