// ─── 设置向导 ────────────────────────────────────────
const setupOverlay = document.getElementById('setup-overlay');
const step1 = document.getElementById('setup-step1');
const step2 = document.getElementById('setup-step2');
const step1Status = document.getElementById('step1-status');
const step2Status = document.getElementById('step2-status');
const oauthBtn = document.getElementById('btn-oauth-go');
const oauthStatusEl = document.getElementById('setup-oauth-status');

async function fetchSetupStatus() {
  try {
    const r = await fetch('/api/setup/status');
    return await r.json();
  } catch (e) {
    console.error('setup-status', e);
    return null;
  }
}

function renderSetup(s) {
  if (!s) return;
  // step 1
  if (s.has_oauth_creds && s.has_gemini) {
    step1.classList.add('done');
    step1Status.textContent = '已保存';
    document.getElementById('setup-gemini').value = s.masked?.gemini_api_key || '';
    document.getElementById('setup-oauth-id').value = s.masked?.oauth_client_id || '';
    document.getElementById('setup-oauth-secret').value = s.masked?.oauth_client_secret || '';
  } else {
    step1.classList.remove('done');
    step1Status.textContent = '未填';
  }
  // step 2
  if (s.token_scope_ok) {
    step2.classList.add('done');
    step2Status.textContent = '已登录';
    oauthBtn.disabled = !s.has_oauth_creds;
  } else {
    step2.classList.remove('done');
    step2Status.textContent = s.has_oauth_creds ? '点按钮去登录' : '先完成 step 1';
    oauthBtn.disabled = !s.has_oauth_creds;
  }
  // overlay show/hide
  if (s.needs_setup) setupOverlay.classList.remove('hidden');
  else setupOverlay.classList.add('hidden');
  // ④ 配置 tab summary
  const sum = document.getElementById('config-summary');
  if (sum) {
    sum.innerHTML =
      `Gemini key: ${s.has_gemini ? '<span style="color:#5fce85">✓ ' + (s.masked?.gemini_api_key || '') + '</span>' : '<span style="color:#f07070">未配置</span>'}\n` +
      `OAuth client: ${s.has_oauth_creds ? '<span style="color:#5fce85">✓ ' + (s.masked?.oauth_client_id || '') + '</span>' : '<span style="color:#f07070">未配置</span>'}\n` +
      `YouTube 登录: ${s.token_scope_ok ? '<span style="color:#5fce85">✓ scope = ' + (s.token_scope || '') + '</span>' : '<span style="color:#f07070">未登录或 scope 不够</span>'}\n` +
      `重定向 URI: ${s.redirect_uri}`;
    sum.style.whiteSpace = 'pre-line';
  }
}

document.getElementById('btn-save-config').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-config');
  const st = document.getElementById('setup-save-status');
  const gemini = document.getElementById('setup-gemini').value.trim();
  const oid = document.getElementById('setup-oauth-id').value.trim();
  const osec = document.getElementById('setup-oauth-secret').value.trim();
  const body = {};
  // 已保存过的回显是脱敏字符串（含 …），跳过这种字段不要把脱敏值写回去
  if (gemini && !gemini.includes('…')) body.gemini_api_key = gemini;
  if (oid && !oid.includes('…'))     body.oauth_client_id = oid;
  if (osec && !osec.includes('…'))   body.oauth_client_secret = osec;
  if (Object.keys(body).length === 0) {
    st.textContent = '没有新值；如果要换号，先清空字段再填新值。';
    return;
  }
  btn.disabled = true; st.textContent = '保存中…';
  try {
    const r = await fetch('/api/setup/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    st.textContent = '✓ 已保存';
    renderSetup(j.status);
  } catch (e) {
    st.textContent = '失败：' + e.message;
  } finally {
    btn.disabled = false;
  }
});

oauthBtn.addEventListener('click', async () => {
  oauthBtn.disabled = true;
  oauthStatusEl.textContent = '准备授权 URL…';
  try {
    const r = await fetch('/api/setup/oauth-start', { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    oauthStatusEl.textContent = '跳转中…';
    window.location.href = j.auth_url;
  } catch (e) {
    oauthStatusEl.textContent = '失败：' + e.message;
    oauthBtn.disabled = false;
  }
});

const _btnShowWizard = document.getElementById('btn-show-wizard');
if (_btnShowWizard) _btnShowWizard.addEventListener('click', () => {
  // 清空脱敏回显，让用户重新输
  document.getElementById('setup-gemini').value = '';
  document.getElementById('setup-oauth-id').value = '';
  document.getElementById('setup-oauth-secret').value = '';
  step1.classList.remove('done');
  setupOverlay.classList.remove('hidden');
});

const _btnRelogin = document.getElementById('btn-relogin');
if (_btnRelogin) _btnRelogin.addEventListener('click', async () => {
  if (!confirm('清除当前 YouTube 登录态？只删本机 token.json。')) return;
  await fetch('/api/setup/logout', { method: 'POST' });
  setupOverlay.classList.remove('hidden');
  await refreshAllSetup();
});

const _btnResetAll = document.getElementById('btn-reset-all');
if (_btnResetAll) _btnResetAll.addEventListener('click', async () => {
  if (!confirm('清除所有凭据 + token.json？\n下次启动要重新走整个向导。')) return;
  await fetch('/api/setup/reset', { method: 'POST' });
  setupOverlay.classList.remove('hidden');
  await refreshAllSetup();
});

async function refreshAllSetup() {
  const s = await fetchSetupStatus();
  renderSetup(s);
}

// 启动时拉一次。OAuth 回跳的 ?setup=ok 也走同一份逻辑。
refreshAllSetup();
if (new URLSearchParams(location.search).has('setup')) {
  // 清掉 query 防止刷新二次解析
  history.replaceState({}, '', location.pathname);
}

// ─── tab 切换 ────────────────────────────────────────
const tabs = document.querySelectorAll('.tab');
const panels = {
  search: document.getElementById('tab-search'),
  drafts: document.getElementById('tab-drafts'),
  wall:   document.getElementById('tab-wall'),
  config: document.getElementById('tab-config'),
};
tabs.forEach((t) => {
  t.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    Object.values(panels).forEach((p) => p.classList.add('hidden'));
    panels[t.dataset.tab].classList.remove('hidden');
    if (t.dataset.tab === 'drafts') refreshDrafts();
    if (t.dataset.tab === 'wall')   refreshWall();
    if (t.dataset.tab === 'config') { refreshHealth(); refreshQuota(); }
  });
});
document.querySelector('.tab[data-tab="search"]').classList.add('active');

// ─── 工具 ────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  if (!res.ok) {
    const msg = json.error || json.hint || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

function fmtSubs(n) {
  if (!n) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`;
  return n.toLocaleString();
}
function fmtViews(n) {
  if (!n) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万次`;
  return `${n}次`;
}
function fmtDur(sec) {
  const s = Number(sec) || 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h${m % 60}m`;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { hour12: false });
}
function relTime(ts) {
  if (!ts) return '';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.floor(diff)}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}
function ytLink(videoId) { return `https://www.youtube.com/watch?v=${videoId}`; }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ─── 配额 ────────────────────────────────────────────
async function refreshQuota() {
  let q;
  try { q = await api('/api/quota'); }
  catch (e) {
    const pill = document.getElementById('quota-pill');
    pill.className = 'pill pill-bad';
    pill.textContent = '配额读取失败';
    return;
  }
  const pct = q.cap > 0 ? (q.used / q.cap) * 100 : 0;
  const pill = document.getElementById('quota-pill');
  pill.textContent = `配额 ${q.used} / ${q.cap}`;
  pill.title = `PT ${q.date_pt} · 余 ${q.remaining}（YouTube 默认 10000，明日 PT 0 点重置）`;
  pill.className = 'pill ' + (pct >= 90 ? 'pill-bad' : pct >= 70 ? 'pill-warn' : 'pill-ok');

  // detail panel (only if rendered)
  const usedEl = document.getElementById('quota-used');
  if (!usedEl) return;
  usedEl.textContent = `${q.used} / ${q.cap}`;
  document.getElementById('quota-pct').textContent =
    `${q.pct}% 用了 · 余 ${q.remaining}`;
  document.getElementById('quota-date').textContent =
    `PT ${q.date_pt} · 硬上限 ${q.hard_limit}`;
  const fill = document.getElementById('quota-bar-fill');
  fill.style.width = Math.min(100, pct) + '%';
  fill.classList.remove('warn', 'bad');
  if (pct >= 90) fill.classList.add('bad');
  else if (pct >= 70) fill.classList.add('warn');

  const opsBox = document.getElementById('quota-by-op');
  if (!q.by_op.length) {
    opsBox.innerHTML = '<div class="empty" style="padding:8px">今日还没花配额。</div>';
  } else {
    opsBox.innerHTML = q.by_op.map((r) => `
      <div class="op-row">
        <span class="op-name">${escapeHtml(r.op)} <span style="opacity:.6">×${r.call_count}</span></span>
        <span class="op-units">${r.units_used}u</span>
      </div>
    `).join('');
  }
}
refreshQuota();
setInterval(refreshQuota, 30000);
const btnRefreshQuota = document.getElementById('btn-refresh-quota');
if (btnRefreshQuota) btnRefreshQuota.addEventListener('click', refreshQuota);

// ─── 健康检查 ────────────────────────────────────────
async function refreshHealth() {
  try {
    const h = await api('/api/health');
    const pill = document.getElementById('health-pill');
    if (h.scope?.ok && h.geminiKey) {
      pill.className = 'pill pill-ok';
      pill.textContent = '就绪 · 可发评';
    } else if (h.scope?.ok) {
      pill.className = 'pill pill-warn';
      pill.textContent = '缺 GEMINI_API_KEY';
    } else {
      pill.className = 'pill pill-bad';
      pill.textContent = '缺写权限 · 不能发评';
    }
    document.getElementById('health-dump').textContent =
      JSON.stringify(h, null, 2);
  } catch (e) {
    document.getElementById('health-dump').textContent = '健康检查失败：' + e.message;
  }
}
refreshHealth();

// ─── ① 搜索 ──────────────────────────────────────────
const subSlider = document.getElementById('q-sub');
const durSlider = document.getElementById('q-dur');
const subDisplay = document.getElementById('q-sub-display');
const durDisplay = document.getElementById('q-dur-display');

function subSliderToCount(pos) { return Number(pos) * 1000; }     // 0 ~ 1,000,000
function durSliderToSec(pos)   { return Number(pos) * 60; }       // 0 ~ 3600s

function syncSliderDisplay() {
  subDisplay.textContent = fmtSubs(subSliderToCount(subSlider.value));
  durDisplay.textContent = `${durSlider.value} 分`;
}
subSlider.addEventListener('input', syncSliderDisplay);
durSlider.addEventListener('input', syncSliderDisplay);
syncSliderDisplay();

document.getElementById('btn-search').addEventListener('click', async () => {
  const query = document.getElementById('q-input').value.trim();
  if (!query) return alert('请输入关键词');
  const order = document.getElementById('q-order').value;
  const max_results = Number(document.getElementById('q-max').value) || 25;
  const subMin = subSliderToCount(subSlider.value);
  const durMinSec = durSliderToSec(durSlider.value);

  const meta = document.getElementById('search-meta');
  meta.textContent = '搜索中…（search.list 配额 100/次）';
  document.getElementById('search-results').innerHTML = '';
  try {
    const r = await api('/api/search', {
      method: 'POST',
      body: { query, sub_min: subMin, dur_min_sec: durMinSec, max_results, order },
    });
    meta.textContent = `命中 ${r.videos.length} 条（搜索原始 ${r.debug.rawHits} → 元数据 ${r.debug.afterMetadata} → 阈值过滤后 ${r.debug.afterFilter}）`;
    renderSearchResults(r.videos);
    refreshQuota();
  } catch (e) {
    meta.textContent = '搜索失败：' + e.message;
  }
});

function renderSearchResults(videos) {
  const grid = document.getElementById('search-results');
  if (!videos.length) {
    grid.innerHTML = '<div class="empty">没有命中。试着把粉丝/时长阈值调低。</div>';
    return;
  }
  grid.innerHTML = videos.map((v) => `
    <div class="video-card" data-vid="${v.video_id}">
      <a class="thumb" href="${ytLink(v.video_id)}" target="_blank" rel="noopener">
        ${v.thumbnail_url ? `<img src="${v.thumbnail_url}" alt="">` : ''}
      </a>
      <div class="body">
        <div class="title">${escapeHtml(v.title)}</div>
        <div class="channel">${escapeHtml(v.channel_title)} · ${fmtSubs(v.channel_subs)}粉</div>
        <div class="stats">
          <span>${fmtDur(v.duration_sec)}</span>
          <span>${fmtViews(v.view_count)}</span>
        </div>
      </div>
      <div class="actions">
        <button class="btn-primary btn-draft" data-vid="${v.video_id}">生成「课代表」评论</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.btn-draft').forEach((btn) => {
    btn.addEventListener('click', () => onGenerateDraft(btn));
  });
}

async function onGenerateDraft(btn) {
  const vid = btn.dataset.vid;
  btn.disabled = true;
  btn.textContent = '生成中…（Gemini）';
  try {
    const r = await api('/api/draft', { method: 'POST', body: { video_id: vid } });
    btn.textContent = `已生成（字幕：${r.caption_status}）— 去草稿 Tab`;
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-ghost');
    refreshQuota();
  } catch (e) {
    btn.textContent = '失败：' + e.message;
  } finally {
    setTimeout(() => { btn.disabled = false; }, 800);
  }
}

// ─── ② 草稿 ──────────────────────────────────────────
document.getElementById('btn-refresh-drafts').addEventListener('click', refreshDrafts);

async function refreshDrafts() {
  const list = document.getElementById('drafts-list');
  list.innerHTML = '<div class="empty">加载中…</div>';
  try {
    const r = await api('/api/drafts?status=pending');
    if (!r.items.length) {
      list.innerHTML = '<div class="empty">没有待发草稿。先去「① 搜索」生成几条。</div>';
      return;
    }
    list.innerHTML = r.items.map((d) => `
      <div class="draft-item" data-id="${d.id}">
        <a class="thumb" href="${ytLink(d.video_id)}" target="_blank" rel="noopener">
          ${d.thumbnail_url ? `<img src="${d.thumbnail_url}" alt="">` : ''}
        </a>
        <div>
          <div class="title-line">${escapeHtml(d.video_title)}</div>
          <div class="meta-line">${escapeHtml(d.channel_title)} · ${fmtDur(d.duration_sec)} · 模型 ${escapeHtml(d.model)} · ${relTime(d.created_at)}</div>
          <textarea data-id="${d.id}">${escapeHtml(d.comment_text)}</textarea>
          <div class="row">
            <button class="btn-send" data-id="${d.id}">发送到 YouTube</button>
            <button class="btn-danger" data-id="${d.id}" data-act="discard">丢弃</button>
            <span class="meta-line" data-id="${d.id}-status"></span>
          </div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.btn-send').forEach((b) => {
      b.addEventListener('click', () => sendDraft(b.dataset.id, b));
    });
    list.querySelectorAll('[data-act="discard"]').forEach((b) => {
      b.addEventListener('click', () => discardDraft(b.dataset.id));
    });
  } catch (e) {
    list.innerHTML = '<div class="empty">加载失败：' + escapeHtml(e.message) + '</div>';
  }
}

async function sendDraft(id, btn) {
  const ta = document.querySelector(`textarea[data-id="${id}"]`);
  const status = document.querySelector(`[data-id="${id}-status"]`);
  if (!confirm('确认把这条评论发到 YouTube？\n\n（这是真实写操作，会消耗 50 配额单位 + 留下账号痕迹）')) return;
  btn.disabled = true;
  status.textContent = '发送中…';
  try {
    const r = await api(`/api/drafts/${id}/post`, {
      method: 'POST',
      body: { text: ta.value },
    });
    status.textContent = `✓ 已发送，comment_id=${r.comment_id}`;
    btn.textContent = '已发送';
    refreshQuota();
  } catch (e) {
    status.textContent = '失败：' + e.message;
    btn.disabled = false;
  }
}

async function discardDraft(id) {
  if (!confirm('丢弃这条草稿？')) return;
  try {
    await api(`/api/drafts/${id}/discard`, { method: 'POST' });
    refreshDrafts();
  } catch (e) {
    alert('失败：' + e.message);
  }
}

// ─── ③ 成果墙 ────────────────────────────────────────
let carouselTimer = null;
let carouselPaused = false;

document.getElementById('btn-refresh-stats').addEventListener('click', async () => {
  const btn = document.getElementById('btn-refresh-stats');
  btn.disabled = true;
  btn.textContent = '刷新中…';
  try {
    const r = await api('/api/posted/refresh', { method: 'POST' });
    btn.textContent = `已刷新 ${r.scanned} 条`;
    await refreshWall();
  } catch (e) {
    btn.textContent = '失败：' + e.message;
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '手动刷新统计（<3 天）';
    }, 1500);
  }
});

document.getElementById('btn-toggle-carousel').addEventListener('click', () => {
  carouselPaused = !carouselPaused;
});

async function refreshWall() {
  const wrap = document.getElementById('carousel');
  wrap.innerHTML = '<div class="empty">加载中…</div>';
  try {
    const r = await api('/api/posted');
    if (!r.items.length) {
      wrap.innerHTML = '<div class="empty">还没发出去过评论。</div>';
      return;
    }
    wrap.innerHTML = r.items.map(renderPostedCard).join('');
    wrap.querySelectorAll('[data-act="export"]').forEach((b) => {
      b.addEventListener('click', () => exportCardPng(b));
    });
    wrap.querySelectorAll('[data-act="refresh-one"]').forEach((b) => {
      b.addEventListener('click', () => refreshOne(b.dataset.id, b));
    });
    startCarouselAuto();
  } catch (e) {
    wrap.innerHTML = '<div class="empty">加载失败：' + escapeHtml(e.message) + '</div>';
  }
}

function renderPostedCard(p) {
  return `
    <div class="posted-card" data-id="${p.id}">
      <div class="video-row">
        <a class="thumb" href="${ytLink(p.video_id)}" target="_blank" rel="noopener">
          ${p.thumbnail_url ? `<img src="${p.thumbnail_url}" alt="">` : ''}
        </a>
        <div class="info">
          <div class="vt">${escapeHtml(p.video_title)}</div>
          <div>${escapeHtml(p.channel_title)}</div>
          <div>发于 ${fmtTime(p.posted_at)}</div>
        </div>
      </div>
      <div class="text">${escapeHtml(p.text)}</div>
      <div class="stats-row">
        <span>👍 <span class="num">${p.like_count ?? '—'}</span></span>
        <span>💬 <span class="num">${p.reply_count ?? '—'}</span></span>
        <span style="color:#6c7585;font-size:11px">${p.stats_at ? '统计于 ' + relTime(p.stats_at) : '尚未抓取'}</span>
      </div>
      <div class="footer-row">
        <a href="${ytLink(p.video_id)}" target="_blank" rel="noopener">看原视频 ↗</a>
        <div class="acts">
          <button class="btn-ghost" data-act="refresh-one" data-id="${p.id}">↻ 单条</button>
          <button class="btn-ghost" data-act="export" data-id="${p.id}">另存为 PNG</button>
        </div>
      </div>
    </div>
  `;
}

async function refreshOne(id, btn) {
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = '…';
  try {
    await api(`/api/posted/${id}/refresh`, { method: 'POST' });
    await refreshWall();
  } catch (e) {
    alert('失败：' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function exportCardPng(btn) {
  if (typeof html2canvas !== 'function') {
    alert('html2canvas CDN 没加载到（可能被代理拦了）。请检查浏览器代理或本地 vendor。');
    return;
  }
  const id = btn.dataset.id;
  const card = document.querySelector(`.posted-card[data-id="${id}"]`);
  if (!card) return;
  btn.disabled = true;
  btn.textContent = '生成中…';
  try {
    const canvas = await html2canvas(card, {
      backgroundColor: '#0e1116',
      scale: 2,
      useCORS: true,
    });
    const link = document.createElement('a');
    link.download = `comment-${id}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    btn.textContent = '已下载';
  } catch (e) {
    btn.textContent = '失败';
    alert('html2canvas 失败：' + e.message);
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '另存为 PNG';
    }, 1200);
  }
}

function startCarouselAuto() {
  if (carouselTimer) clearInterval(carouselTimer);
  const wrap = document.getElementById('carousel');
  carouselTimer = setInterval(() => {
    if (carouselPaused) return;
    if (!wrap || wrap.children.length < 2) return;
    const nextLeft = wrap.scrollLeft + 1;
    if (nextLeft >= wrap.scrollWidth - wrap.clientWidth - 1) {
      wrap.scrollTo({ left: 0, behavior: 'auto' });
    } else {
      wrap.scrollBy({ left: 1 });
    }
  }, 30);
}
