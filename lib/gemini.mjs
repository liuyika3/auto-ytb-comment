import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { GoogleGenAI } from '@google/genai';
import '../paths.mjs';
import { getGeminiApiKey, getGeminiModel } from './runtime-config.mjs';

let _proxyApplied = false;
function ensureFetchProxy() {
  if (_proxyApplied) return;
  const proxy = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
  if (proxy) {
    setGlobalDispatcher(new ProxyAgent(proxy));
  }
  _proxyApplied = true;
}

let _ai = null;
let _aiKey = null;
function getClient() {
  ensureFetchProxy();
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('未配置 GEMINI_API_KEY。打开 http://127.0.0.1:8766/ 在向导里填上。');
  }
  if (_ai && _aiKey === apiKey) return _ai;
  _ai = new GoogleGenAI({ apiKey });
  _aiKey = apiKey;
  return _ai;
}

export const PROMPT_VERSION = 'kedaibiao-v1';

function buildPrompt({ title, channel, description, captionText }) {
  const trimDesc = (description || '').slice(0, 800);
  const trimCap = (captionText || '').slice(0, 4000);

  const captionBlock = trimCap
    ? `\n字幕节选（已截断，可能包含错别字）：\n${trimCap}\n`
    : `\n字幕：拿不到（视频所有者未公开下载权限）。请仅依据标题与描述合理推测要点，并在措辞中保持诚实（例如「看标题应该是…」）。\n`;

  return `你是一名 YouTube 评论区的「课代表」，给观众做长视频要点速览。

频道名：${channel || '(未知)'}
视频标题：${title || '(无标题)'}
视频描述（已截断到 800 字）：
${trimDesc}
${captionBlock}
请写一条中文 YouTube 评论，要求：
1. 100-180 字之间。
2. 主体用 3-5 条带阿拉伯数字标号的要点，每条 1 句话讲清一个具体观点（不要泛泛"很有启发"）。
3. 像真观众的口吻：不写"感谢博主分享/学到了/三连"这类客套，也别用"作为一个 AI"之类自我暴露。
4. 不要任何 URL、外链、账号 @ 或邀请关注。
5. 末尾用一行加一句你的真实感想或一个有具体细节的提问，制造对话钩子。
6. 全程使用中文，不要 Markdown 标题/粗体/分割线。

只输出评论正文。不要任何前置说明、引导语或 JSON 包装。`;
}

/**
 * 调用 Gemini 生成「课代表」评论。
 * @returns {Promise<{ text: string, model: string, promptVersion: string }>}
 */
export async function generateCourseRepComment({
  title,
  channel,
  description,
  captionText,
} = {}) {
  const ai = getClient();
  const model = getGeminiModel();
  const prompt = buildPrompt({ title, channel, description, captionText });

  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.85,
      maxOutputTokens: 600,
    },
  });

  const text = (res.text ?? '').trim();
  if (!text) throw new Error('Gemini 返回为空');
  return { text, model, promptVersion: PROMPT_VERSION };
}
