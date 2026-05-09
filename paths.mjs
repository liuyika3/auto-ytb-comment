import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

(function loadDotEnv() {
  try {
    const envFile = path.join(__dirname, '.env');
    if (!fs.existsSync(envFile)) return;
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* ignore */
  }
})();

/** @returns {string} */
export function resolveClientSecretPath() {
  const fromEnv = process.env.YOUTUBE_CLIENT_SECRET_JSON?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const local = path.join(__dirname, 'credentials', 'client_secret.json');
  if (fs.existsSync(local)) return local;
  throw new Error(
    '找不到 OAuth 客户端 JSON。请设置环境变量 YOUTUBE_CLIENT_SECRET_JSON 指向 client_secret_*.json，' +
      '或将该文件复制为 credentials/client_secret.json'
  );
}

/**
 * OAuth 客户端凭据：优先 runtime-config（向导写入），再 .env，最后 client_secret JSON。
 * 每次调用都重读，向导保存后立即生效，无需重启 server。
 * @returns {{ client_id: string, client_secret: string }}
 */
export async function getOAuthClientCredentials() {
  const { getOAuthCreds } = await import('./lib/runtime-config.mjs');
  const fromRuntime = getOAuthCreds();
  if (fromRuntime) return fromRuntime;

  const id = process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim();
  const secret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim();
  if (id && secret) {
    return { client_id: id, client_secret: secret };
  }

  let p = null;
  const fromJson = process.env.YOUTUBE_CLIENT_SECRET_JSON?.trim();
  const local = path.join(__dirname, 'credentials', 'client_secret.json');
  if (fromJson && fs.existsSync(fromJson)) p = fromJson;
  else if (fs.existsSync(local)) p = local;
  if (!p) {
    throw new Error(
      '未配置 OAuth 凭据。打开 http://127.0.0.1:8766/ 在向导里填，或把 client_id/secret 写到 .env。'
    );
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const block = raw.installed ?? raw.web;
  if (!block?.client_id || !block?.client_secret) {
    throw new Error('client_secret JSON 需包含 web 或 installed，且含 client_id / client_secret');
  }
  return { client_id: block.client_id, client_secret: block.client_secret };
}

export const tokenPath = path.join(__dirname, 'credentials', 'token.json');

/** 与 Google 控制台「已获授权的重定向 URI」、以及 oauth-login 监听地址必须一致 */
export function getOAuthRedirectUri() {
  const u = process.env.YOUTUBE_OAUTH_REDIRECT_URI?.trim();
  if (u) return u;
  return 'http://localhost:8765/oauth2callback';
}
