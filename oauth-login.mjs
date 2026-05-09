/**
 * 桌面应用 OAuth：浏览器登录一次，写入 credentials/token.json（含 refresh_token）。
 *
 * 说明：创建「桌面应用」OAuth 时，向导里经常**不会**让你填重定向 URI，这是正常的。
 * 需要的话：凭据 → 点进该客户端 → **修改** → 翻到 **「已获授权的重定向 URI」** → 添加与下面 REDIRECT 完全一致的一行。
 * 默认与 Google 下发的 JSON 里常见的 http://localhost 一致：
 *   http://localhost:8765/oauth2callback
 * 若你已在控制台填的是 127.0.0.1，可在 .env 里设：YOUTUBE_OAUTH_REDIRECT_URI=http://127.0.0.1:8765/oauth2callback
 *
 * 运行：npm run oauth
 *
 * 若换 token 时报 ETIMEDOUT：本机访问 Google API 不通。在 .env 设置 HTTPS_PROXY（见 env.example），
 * 或开启系统/ TUN 代理后重试。诊断：npm run diag
 */
import { tokenPath, getOAuthRedirectUri, getOAuthClientCredentials } from './paths.mjs';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { google } from 'googleapis';

const REDIRECT = getOAuthRedirectUri();
const redirectUrl = new URL(REDIRECT);
const PORT = Number(redirectUrl.port) || 80;
const CALLBACK_PATH = redirectUrl.pathname || '/oauth2callback';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  // 发评/回复评论需要写 scope。GCP 同意屏幕也要同步勾上这一项。
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

function saveToken(tokens) {
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
  console.log('已写入:', tokenPath);
}

const creds = await getOAuthClientCredentials();
const oauth2Client = new google.auth.OAuth2(creds.client_id, creds.client_secret, REDIRECT);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('\n请在浏览器打开以下地址完成授权（登录你的 Google 账号）：\n');
console.log(authUrl);
console.log('\n等待回调 ', REDIRECT, ' …\n');

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const pathname = new URL(req.url || '/', `http://${host}`).pathname;
  if (pathname !== CALLBACK_PATH) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const url = new URL(req.url || '/', `http://${host}`);
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<p>缺少 code 参数</p>');
      return;
    }
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    saveToken(tokens);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<p>授权成功，可关闭此页，回到终端继续。</p>');
    server.close();
    console.log('授权成功。');
    process.exit(0);
  } catch (e) {
    const code = e?.code ?? e?.cause?.code;
    const msg = String(e?.message ?? e);
    if (code === 'ETIMEDOUT' || msg.includes('ETIMEDOUT')) {
      console.error(
        '\n[网络] 连接 oauth2.googleapis.com 超时：Node 直连 Google 失败（常见于需代理/国际线路）。\n' +
          '在 youtube-official-api\\.env 里增加（端口改成你本机 Clash / v2ray 的 HTTP 代理端口）：\n' +
          '  HTTPS_PROXY=http://127.0.0.1:9876\n' +
          '  HTTP_PROXY=http://127.0.0.1:9876\n' +
          '保存后重新运行 npm run oauth。可先运行 npm run diag 做连通性检查。\n'
      );
    }
    console.error(e);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<p>换 token 失败，请看终端错误信息。</p>');
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('监听中:', `http://localhost:${PORT}${CALLBACK_PATH}`);
  console.log('使用的 redirect_uri（须与控制台一致）:', REDIRECT);
});

server.on('error', (err) => {
  console.error('无法启动本地回调服务（端口占用？）', err.message);
  process.exit(1);
});
