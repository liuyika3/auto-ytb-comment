/**
 * 运行期配置：用户通过网页向导填的 Gemini key + OAuth client_id/secret
 * 落到 config/local.json（git 忽略）。.env 仍然作为可选 fallback。
 *
 * 优先级（高 → 低）：
 *   1. config/local.json（向导写入）
 *   2. process.env（来自 .env 或外部环境）
 *   3. throw "未配置"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(ROOT, 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'local.json');

const KEYS = Object.freeze({
  GEMINI_API_KEY: 'gemini_api_key',
  GEMINI_MODEL: 'gemini_model',
  YOUTUBE_OAUTH_CLIENT_ID: 'oauth_client_id',
  YOUTUBE_OAUTH_CLIENT_SECRET: 'oauth_client_secret',
});

let _cache = null;

function load() {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      _cache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } else {
      _cache = {};
    }
  } catch (e) {
    console.warn('[runtime-config] 读 config/local.json 失败:', e.message);
    _cache = {};
  }
  return _cache;
}

function save(obj) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(obj, null, 2), 'utf8');
  _cache = obj;
}

/** Gemini API key — 先 runtime-config，其次 process.env.GEMINI_API_KEY */
export function getGeminiApiKey() {
  const c = load();
  return (c[KEYS.GEMINI_API_KEY] || process.env.GEMINI_API_KEY || '').trim();
}

export function getGeminiModel() {
  const c = load();
  return (c[KEYS.GEMINI_MODEL] || process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();
}

/** @returns {{ client_id: string, client_secret: string } | null} */
export function getOAuthCreds() {
  const c = load();
  const id = (c[KEYS.YOUTUBE_OAUTH_CLIENT_ID] || process.env.YOUTUBE_OAUTH_CLIENT_ID || '').trim();
  const secret = (c[KEYS.YOUTUBE_OAUTH_CLIENT_SECRET] || process.env.YOUTUBE_OAUTH_CLIENT_SECRET || '').trim();
  if (!id || !secret) return null;
  return { client_id: id, client_secret: secret };
}

/**
 * 一次性更新部分字段。只接受白名单 key，未传的字段保持不变。
 * @param {{ gemini_api_key?: string, gemini_model?: string, oauth_client_id?: string, oauth_client_secret?: string }} patch
 */
export function updateConfig(patch = {}) {
  const cur = { ...load() };
  for (const k of Object.values(KEYS)) {
    if (patch[k] != null) {
      const v = String(patch[k]).trim();
      if (v) cur[k] = v;
      else delete cur[k];
    }
  }
  save(cur);
  return cur;
}

export function clearConfig() {
  if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
  _cache = {};
}

/** 返回脱敏的当前配置（适合给前端 / 健康检查）*/
export function getSafeStatus() {
  const c = load();
  const mask = (s) => {
    if (!s) return '';
    const v = String(s);
    if (v.length <= 8) return '*'.repeat(v.length);
    return v.slice(0, 4) + '…' + v.slice(-4);
  };
  return {
    has_gemini: Boolean(getGeminiApiKey()),
    has_oauth_creds: Boolean(getOAuthCreds()),
    gemini_model: getGeminiModel(),
    masked: {
      gemini_api_key: mask(c[KEYS.GEMINI_API_KEY] || process.env.GEMINI_API_KEY || ''),
      oauth_client_id: mask(c[KEYS.YOUTUBE_OAUTH_CLIENT_ID] || process.env.YOUTUBE_OAUTH_CLIENT_ID || ''),
      oauth_client_secret: mask(c[KEYS.YOUTUBE_OAUTH_CLIENT_SECRET] || process.env.YOUTUBE_OAUTH_CLIENT_SECRET || ''),
    },
  };
}

export const configPath = CONFIG_PATH;
