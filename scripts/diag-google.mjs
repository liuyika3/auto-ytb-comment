/**
 * 探测 Google OAuth / API 连通性（不发送任何密钥）。
 * 会尊重 HTTPS_PROXY / HTTP_PROXY（与 googleapis/gaxios 一致）。
 * 运行：npm run diag
 */
import '../paths.mjs';
import https from 'node:https';
import net from 'node:net';
import { HttpsProxyAgent } from 'https-proxy-agent';

function proxyUrl() {
  return (
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim() ||
    ''
  );
}

/** 解析 http://host:port，用于 TCP 探测 */
function parseProxyTcp(proxy) {
  try {
    const u = new URL(proxy);
    return { host: u.hostname || '127.0.0.1', port: Number(u.port) || 80 };
  } catch {
    return null;
  }
}

function probeTcp(host, port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host, port, timeout: 4000 }, () => {
      s.end();
      resolve({ ok: true });
    });
    s.on('error', (e) => resolve({ ok: false, err: e.message, code: e.code }));
    s.on('timeout', () => {
      s.destroy();
      resolve({ ok: false, err: 'tcp connect timeout (4s)' });
    });
  });
}

function probeHttps(hostname, pathname = '/') {
  return new Promise((resolve) => {
    const p = proxyUrl();
    const opts = {
      hostname,
      port: 443,
      method: 'GET',
      path: pathname,
      timeout: 15000,
      servername: hostname,
    };
    if (p) {
      opts.agent = new HttpsProxyAgent(p);
    }
    const req = https.request(opts, (res) => {
      res.resume();
      resolve({ ok: true, status: res.statusCode, viaProxy: Boolean(p) });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, err: 'socket timeout (15s)', viaProxy: Boolean(p) });
    });
    req.on('error', (e) =>
      resolve({
        ok: false,
        err: e.message,
        code: e.code,
        viaProxy: Boolean(p),
      })
    );
    req.end();
  });
}

const p = proxyUrl();
console.log('当前 HTTPS_PROXY:', process.env.HTTPS_PROXY || '(未设置)');
console.log('当前 HTTP_PROXY :', process.env.HTTP_PROXY || '(未设置)');
console.log('');

if (p) {
  const tcp = parseProxyTcp(p);
  if (tcp) {
    const t = await probeTcp(tcp.host, tcp.port);
    console.log(
      `代理 TCP ${tcp.host}:${tcp.port} →`,
      t.ok ? 'OK（端口有进程在听）' : `FAIL (${t.err || t.code || '?'})`
    );
    if (!t.ok) {
      console.log(
        '→ 若此处 FAIL：9876 可能不是 HTTP 代理、VPN 未开，或地址不是 127.0.0.1。请到 VPN 里确认「HTTP 代理」主机与端口。\n'
      );
    }
  }
  console.log('');
}

let oauth2Ok = false;
for (const host of ['oauth2.googleapis.com', 'www.googleapis.com']) {
  const r = await probeHttps(host, '/');
  if (host === 'oauth2.googleapis.com' && r.ok) oauth2Ok = true;
  if (r.ok) {
    console.log(
      host,
      '→ OK, HTTP',
      r.status,
      r.viaProxy ? '(经 HTTPS_PROXY)' : '(直连，未走代理)'
    );
  } else {
    console.log(
      host,
      '→ FAIL',
      r.code || '',
      r.err,
      r.viaProxy ? '(已尝试走代理)' : '(直连)'
    );
  }
}

console.log('');
if (!p) {
  console.log(
    '未设置 HTTPS_PROXY：Node 直连 Google，易被墙/超时。在 .env 写：\n' +
      '  HTTPS_PROXY=http://127.0.0.1:你的HTTP代理端口\n' +
      '  HTTP_PROXY=http://127.0.0.1:你的HTTP代理端口'
  );
} else if (!oauth2Ok) {
  console.log(
    '若「代理 TCP」OK 但上面仍 FAIL：多为 HTTP 代理协议不对（例如端口实际是 SOCKS5）。\n' +
      '请在 VPN 中打开「HTTP 代理」或查看「Mixed / 系统代理」里真正的 HTTP 端口，再改 .env 与 .bat。'
  );
}
