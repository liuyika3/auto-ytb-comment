# auto-ytb-comment

YouTube 半自动评论流水线（本机运行）：

```
关键词 → search.list 筛选 → 视频/频道详情
       → Gemini 生成「课代表」式中文长评（无外链）
       → 你逐条点「发送」→ commentThreads.insert
       → 回读点赞/回复 → 走马灯前端 + html2canvas 出图
```

**重点**：发评是**半自动**的——管道生成候选评论，必须**人手**逐条点
「发送」才会真的调 YouTube API 写到目标视频底下。即便如此，**自动化生成 +
批量发评在他人视频下仍可能违反 YouTube ToS 的「自动化/反垃圾」条款**，
账号有被自动隐藏评论 / 限速 / 永久封禁的可能。是否使用、用多大量级，
由使用者自评估并承担。

---

## 快速开始（≤ 10 分钟）

> **配套了 [`AGENTS.md`](./AGENTS.md)**：把它喂给 Claude Code / Codex
> 让 AI 代理一步步带你做（包括去 GCP 拿凭据那一段）。

3 步：

```bash
git clone git@github.com:liuyika3/auto-ytb-comment.git
cd auto-ytb-comment
npm install                 # ~80MB，要 Node ≥ 20
npm run start               # 启动服务器
```

打开 **http://127.0.0.1:8766/** ——第一次进会看到一个**初始设置向导**，
3 个输入框：

```
1. Gemini API Key           ← https://aistudio.google.com/apikey
2. YouTube OAuth Client ID  ← 自建 GCP 项目得到（看 AGENTS.md 第 ① 节）
3. YouTube OAuth Client Secret
```

填完点「保存凭据」→ 再点「跳转 Google 登录」→ 浏览器去 Google 授权 →
自动跳回主界面。完。

凭据存到本机 `config/local.json`（git 忽略）和 `credentials/token.json`，
**不会**进仓也不会发给任何人。

---

## 没法上网 / 想走 CLI 流程

```bash
cp env.example .env
# 编辑 .env，填 YOUTUBE_OAUTH_CLIENT_ID / SECRET / GEMINI_API_KEY
npm run oauth               # 一次性浏览器授权（端口 :8765）
npm run smoke               # 验证：列出我的频道
npm run start
```

Windows 双击 `run-oauth.bat` / `run-smoke.bat` / `run-server.bat`
（里面已经替你设了 HTTP 代理为 127.0.0.1:9876，按需改）。

---

## 你需要知道的几件事

### 配额（YouTube Data API v3）

| 操作 | 单价 | 备注 |
|---|---|---|
| `search.list` | **100** | 一次搜索 |
| `videos.list` / `channels.list` | 1 | 每次调用 |
| `captions.list` | **50** | 列字幕轨 |
| `captions.download` | **200** | 下载字幕（他人视频通常 403） |
| `commentThreads.insert` | **50** | 发评 |
| `commentThreads.list` | 1 | 回读 |

**Google 默认日限 10000 / 天，PT 0 点重置**。本工具内置帽子默认 9500，
超了直接 HTTP 429，根本不打到 Google。`.env` 里
`YOUTUBE_DAILY_QUOTA_CAP=` 可调（不能 > 10000）。

典型预算：1 次搜索 + 25 条草稿 + 25 次发评 ≈ 7600 配额。一天搞两轮就见底。

### 字幕基本拿不到

`captions.download` 对**他人视频**绝大多数返回 403（YouTube 限制：仅视频
所有者能下载）。代码会自动 fallback 到「标题 + 描述」给 Gemini，正常。
**这条调用即便 403 也照样消耗 200 配额**——这是最大的配额黑洞，
要省钱就改 `lib/captions.mjs` 里 `pickCaptionTrack` 早返回。

### 数据库

`data.db` 是 SQLite，存搜索历史、视频缓存、草稿、已发评论、点赞统计、
配额账本。可以用 [DB Browser for SQLite](https://sqlitebrowser.org/) 打开看。

`node-sqlite3-wasm` 用 `mkdir data.db.lock` 当锁。**正常 Ctrl-C 退出会自动清**
（v1.2 加了退出钩子）。如果你是任务管理器强杀的，下次启动会报
`database is locked`，手动删掉 `data.db.lock` **目录**即可。

---

## 项目布局

```
.
├── AGENTS.md            # 给 AI 编程代理的逐步指南
├── README.md            # 本文件
├── HANDOVER.md          # 工程师交接文档（架构、扩展点、合规说明）
├── package.json
├── env.example          # 复制为 .env，填 GEMINI_API_KEY
├── server.mjs           # Express 入口
├── oauth-login.mjs      # 一次性浏览器授权
├── smoke-test.mjs       # 冒烟：列出我的频道
├── paths.mjs            # .env 加载 + OAuth 凭据解析
├── lib/
│   ├── db.mjs           # SQLite schema + DAL
│   ├── quota.mjs        # 配额账本（PT 日历键）
│   ├── search.mjs       # search.list + videos/channels.list
│   ├── captions.mjs     # 字幕拉取（他人视频通常拿不到）
│   ├── gemini.mjs       # Gemini API 调用 + 提示词
│   ├── comments.mjs     # commentThreads.insert / list
│   ├── scheduler.mjs    # 启动时回读最近 3 天评论
│   └── youtube-auth.mjs # OAuth client + Youtube SDK 包装
├── scripts/
│   └── diag-google.mjs  # 网络诊断
├── public/              # 前端 SPA：4 Tab，纯 HTML + vanilla JS
├── credentials/         # token.json 落这里（不进仓）
├── run-oauth.bat        # Windows 一键脚本
├── run-server.bat
└── run-smoke.bat
```

更深的工程细节看 [`HANDOVER.md`](./HANDOVER.md)。

---

## 合规

- YouTube API 使用须遵守
  [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- YouTube 平台行为须遵守
  [Community Guidelines](https://support.google.com/youtube/answer/2801973)
- 自动化评论（即使 LLM 生成 + 人工点发）撞 YouTube 反垃圾条款。
  使用者自负风险。

## License

私有项目（package.json `private: true`）。未授权不得商用。
