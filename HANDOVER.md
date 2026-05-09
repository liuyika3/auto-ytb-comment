# YouTube Data API v3 本地工程 — 交接文档

本文档面向 **后续接手开发的同学（含本人）**：说明当前仓库里 `youtube-official-api` 子项目已具备的能力、配置方式、扩展点与注意事项。  
**业务用途、是否遵守 YouTube 服务条款与社区准则、配额与风控，由实现方自行负责。**

---

## 1. 项目定位

- **技术目标**：在 Windows 本机用 **Node.js + 官方 `googleapis`** 调用 **YouTube Data API v3**，通过 **OAuth 2.0（网页应用客户端）** 获取用户授权，将 `refresh_token` 落在本地，供脚本长期刷新 `access_token`。
- **当前 OAuth Scope**：`https://www.googleapis.com/auth/youtube.readonly`（见 `oauth-login.mjs` 内 `SCOPES`）。  
  - 适用于：`channels.list`、`search.list`、`videos.list` 等**读接口**（具体仍受 API 与数据权限约束）。  
  - **写操作**（上传、改元数据、`commentThreads.insert`、`comments.insert` 等）需 **单独申请 scope、在 GCP 中配置 OAuth 权限范围、并让用户重新走一遍授权**。
- **网络环境**：本机 **Node 默认不走 Windows 系统代理**。若直连 Google 超时，需通过环境变量 **`HTTPS_PROXY` / `HTTP_PROXY`** 指向本机 HTTP 代理（当前工程示例端口为 **9876**，以实际 VPN/Clash 为准）。

---

## 2. 目录与文件说明

```
youtube-official-api/
├── package.json           # 依赖：googleapis、https-proxy-agent；脚本 npm run oauth|smoke|diag
├── paths.mjs              # 加载 .env；解析 OAuth 凭据路径；getOAuthRedirectUri()
├── oauth-login.mjs        # 一次性浏览器授权 → 写入 credentials/token.json
├── smoke-test.mjs         # 连通性：channels.list({ mine: true })
├── lib/
│   └── youtube-auth.mjs   # 复用入口：getOAuth2Client()、getYoutube()
├── scripts/
│   └── diag-google.mjs    # 诊断：代理 TCP + 经代理访问 oauth2 / www.googleapis.com
├── credentials/
│   ├── .gitkeep
│   └── token.json         # 授权后生成（勿提交 git，见 .gitignore）
├── .env                   # 本地私密配置（勿提交 git）
├── env.example            # 环境变量模板（可复制为 .env）
├── run-oauth.bat          # 设置代理后执行 npm run oauth
├── run-smoke.bat          # 设置代理后执行 npm run smoke
├── .gitignore
└── HANDOVER.md            # 本交接文档
```

---

## 3. 环境变量（`.env`）

| 变量 | 说明 |
|------|------|
| `YOUTUBE_OAUTH_CLIENT_ID` | OAuth 客户端 ID（与 GCP「网页应用」一致） |
| `YOUTUBE_OAUTH_CLIENT_SECRET` | OAuth 客户端密钥 |
| `YOUTUBE_CLIENT_SECRET_JSON` | （可选）若不用 ID+Secret 两行，可改为指向下载的 `client_secret_*.json` 绝对路径 |
| `YOUTUBE_OAUTH_REDIRECT_URI` | （可选）默认 `http://localhost:8765/oauth2callback`，须与 GCP 控制台「已获授权的重定向 URI」**完全一致** |
| `HTTPS_PROXY` / `HTTP_PROXY` | （按需）例：`http://127.0.0.1:9876`，供 Node / gaxios 访问 Google |

**凭据优先级**（`paths.mjs` → `getOAuthClientCredentials()`）：  
若 **同时** 配置了 `YOUTUBE_OAUTH_CLIENT_ID` 与 `YOUTUBE_OAUTH_CLIENT_SECRET`，则优先用这两项；否则读 `YOUTUBE_CLIENT_SECRET_JSON` 或 `credentials/client_secret.json` 内的 `web` / `installed` 块。

---

## 4. 常用命令

```bash
cd youtube-official-api
npm install

# 网络诊断（会读 .env 里的 HTTPS_PROXY；脚本内用 HttpsProxyAgent，与 googleapis 行为一致）
npm run diag

# 首次或 token 失效后：浏览器授权
npm run oauth

# 验证 API：列出「我的频道」
npm run smoke
```

Windows 可直接双击 **`run-oauth.bat` / `run-smoke.bat`**（内部已 `set HTTPS_PROXY` / `HTTP_PROXY`，端口与 `.env` 保持一致即可）。

---

## 5. Google Cloud 侧配置清单（交接检查）

1. 项目已启用 **YouTube Data API v3**。  
2. **OAuth 同意屏幕**：用户类型、测试用户/发布状态按业务需要配置。  
3. **OAuth 2.0 客户端 ID（网页应用）**：  
   - **已获授权的 JavaScript 来源**：`http://localhost:8765`（与当前默认一致）  
   - **已获授权的重定向 URI**：`http://localhost:8765/oauth2callback`  
4. 若修改端口或路径：**必须**同时改 `paths.mjs` 默认值或 `.env` 的 `YOUTUBE_OAUTH_REDIRECT_URI`，以及 GCP 控制台与 `oauth-login.mjs` 监听端口逻辑（`oauth-login.mjs` 从 `getOAuthRedirectUri()` 解析 `PORT` 与 path）。

官方参考（建议以英文站为准，与实现同步）：  
[YouTube Data API Overview](https://developers.google.com/youtube/v3/getting-started)  
[OAuth 2.0 for Web Server Apps](https://developers.google.com/identity/protocols/oauth2/web-server)

---

## 6. 在新脚本中调用 API

```javascript
import { getYoutube } from './lib/youtube-auth.mjs';

const yt = getYoutube();
const res = await yt.search.list({
  part: ['snippet'],
  q: '关键词',
  type: ['video'],
  maxResults: 10,
});
```

- 任何 **`import './paths.mjs'` 或 `import { getYoutube } from './lib/youtube-auth.mjs'`** 前，确保 **先加载** `paths.mjs`（`youtube-auth.mjs` 已内部 import `paths`），以便 `.env` 与代理生效。  
- **`access_token` 过期**时，`google-auth-library` 会用 `refresh_token` 自动刷新；若刷新失败，需重新执行 `npm run oauth`。  
- **字幕**：`captions.list` / `captions.download` 对他人视频常受限；若业务需要字幕，需单独评估 **数据归属、版权与 API 权限**，可能需 **视频所有者授权** 或改用平台允许的公开数据源。

---

## 7. 扩展 OAuth Scope（接手人自行评估合规性）

1. 在 `oauth-login.mjs` 的 `SCOPES` 数组中追加官方文档要求的 scope 字符串。  
2. 在 GCP **OAuth 同意屏幕** 中同步添加对应权限范围。  
3. **删除** 本地 `credentials/token.json`（或仅清 credentials），重新执行 `npm run oauth`，确保用户对新 scope 重新同意。  
4. 写接口注意 **幂等、重试、错误码与配额**（429 / `quotaExceeded` 等）。

---

## 8. 已知问题与排障

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `ETIMEDOUT` 连 `oauth2.googleapis.com` | Node 未走代理 / 网络不可达 Google | 配置 `HTTPS_PROXY`；`npm run diag` 确认「经代理」为 OK |
| `diag` 曾误报失败 | 旧版 diag 用原生 `https` 未走代理 | 使用当前 `scripts/diag-google.mjs`（HttpsProxyAgent） |
| `redirect_uri_mismatch` | 重定向 URI 与 GCP 不一致 | 对齐 `YOUTUBE_OAUTH_REDIRECT_URI` 与控制台 |
| `invalid_grant` | `refresh_token` 被撤销或客户端密钥已轮换 | 更新 Secret，重新 `npm run oauth` |

---

## 9. 安全与仓库

- **切勿**将 `.env`、`credentials/token.json`、`credentials/client_secret*.json` 提交到远程仓库（已在 `.gitignore`）。  
- **client_secret 若曾泄露**（例如出现在聊天、截图），应在 GCP **重置客户端密钥** 并更新本地配置。  
- `token.json` 等价于账号对该应用的长期授权，**备份与权限**按公司安全规范管理。

---

## 10. 后续开发建议（架构层面，非业务指令）

若需 **Web 前端 + 本机/服务器后端**：

- **方案 A**：前端仅调你自己的后端；后端 Node 使用本目录同一套 `lib/youtube-auth.mjs`，**密钥与 token 永不进浏览器**。  
- **方案 B**：纯静态前端 + 用户自带 token 不推荐（易泄露）。

工程化可选：`pnpm`/`npm workspaces`、将 `youtube-official-api` 提升为 monorepo 子包、增加 `eslint`/`prettier`、对 YouTube 调用封装薄层并统一重试与日志。

---

## 11. 交接确认清单

- [ ] 本机 `npm run diag` 在代理开启下 **oauth2 / www.googleapis.com 经代理 OK**  
- [ ] `npm run smoke` 能列出频道  
- [ ] `.env` 与 `run-*.bat` 中 **代理端口一致**  
- [ ] GCP 重定向 URI 与代码 **一致**  
- [ ] 接手人已阅读 [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service) 与 [Community Guidelines](https://support.google.com/youtube/answer/2801973)  

---

## 附录 A：对话中记录的产品设想与目标工作流（需求备忘）

本节 **仅整理需求方在对话里口述的目标**，方便接手人理解「除了当前 OAuth 脚手架外，原本还想做什么」；**不代表本仓库已实现**，也 **不代表** 接手后应原样实现。是否合法合规、是否通过产品/法务评审、是否违反 [YouTube API 服务条款](https://developers.google.com/youtube/terms/api-services-terms-of-service) 与 [社区准则](https://support.google.com/youtube/answer/2801973)，**由实现方自行判断与承担**。

### A.1 目标业务描述（原话意图整理）

1. **搜索阶段**：按可配置关键词（希望有 **前端**，让用户选择「搜哪些方面」）去筛 **大博主的长视频**（需在技术方案里定义：例如用 `search.list` + `order`/`videoDuration`/`relevance`，再结合 `channels`/`videos` 的统计数据近似「大博主」「长视频」——具体规则自定）。  
2. **内容获取**：对命中视频拉 **视频信息**（元数据、时长、标题描述等）及 **字幕/讲稿**（技术上常涉及 `captions.list` / `captions.download`；**对他人视频的字幕拉取受 API 与版权限制**，未必总能拿到，需单独方案或仅限自有内容）。  
3. **生成文案**：基于字幕/信息用模型生成 **「课代表」式长评论总结**（属应用层逻辑，非 YouTube 内置能力）。  
4. **发布评论**：将上述内容 **作为评论发到目标视频下**；口述中还包含 **引流**（在他人评论区导流到站外/私域等）诉求。  
5. **回读与展示**：评论发出后 **再抓取该条评论**，做成 **缩略图**，在前端 **点开查看详情**（缩略图生成属自建能力，可用 canvas/图片服务；拉评论可用 `comments.list` / `commentThreads.list` 等读接口）。

### A.2 与 YouTube Data API v3 的大致对应（技术对照表）

| 需求环节 | 可能用到的 API / 能力 | 备注 |
|----------|----------------------|------|
| 关键词搜索 | `search.list`（`q`、`type`、`videoDuration`、`order`、`maxResults` 等） | 注意 **search 配额消耗高**；结果需再 `videos.list` 补全字段 |
| 「大博主」近似 | `channels.list`（`id` 或 `forUsername`）、`videos.list`（`chart` 不适用他人）、或第三方数据 | 官方 API 无直接「按粉丝筛 search」的单调用法，多需组合与缓存 |
| 视频详情 | `videos.list`（`part: snippet,contentDetails,statistics` 等） | `contentDetails.duration` 用于长视频过滤 |
| 字幕 | `captions.list`、`captions.download` | **多数情况下仅视频所有者可下载**；公开机器字幕不一定通过 API 可得，需合规替代源 |
| 发顶级评论 | `commentThreads.insert` | **写操作**；需 OAuth scope **高于** 当前 `youtube.readonly`（如 `https://www.googleapis.com/auth/youtube.force-ssl` 等，以官方文档为准），并重新授权 |
| 回复已有评论 | `comments.insert` | 同上 |
| 读评论 / 线程 | `commentThreads.list`、`comments.list` | 读接口；仍受 `mine`/视频可见性限制 |
| 前端配置关键词 | 自建后端 + 前端 UI | OAuth **client_secret / token 不得下发浏览器** |

### A.3 当前仓库实际落地范围（避免误会）

- **v1.0（仓库初版）**：OAuth 网页客户端登录、`token.json` 持久化、`youtube.readonly` 下 `channels.list(mine: true)` 冒烟测试、代理诊断、`getYoutube()` 封装。  
- **v1.1（已落地，见第 12 节）**：搜索 → 字幕（仅官方）→ Gemini「课代表」总结 → 半自动发评 → 回读点赞/回复 → 前端走马灯。  
  - **写评论：实现，但 OAuth scope 升级为 `youtube.force-ssl`，必须重新 `npm run oauth`。**
  - **「引流/带链接」：未实现，按需求方决定不带任何外部链接。**

### A.4 接手开发时的额外提醒（与附录 A 强相关）

- 任何新增 scope：务必同步更新 `oauth-login.mjs`、`GCP 同意屏幕`、并 **作废旧 `token.json` 后重新 oauth**。

---

**文档版本**：与仓库内 `youtube-official-api` 当前结构同步；若移动目录或重命名脚本，请同步更新本节路径描述。

---

## 12. 自动评论流水线 v1.1（半自动）

> **重点**：本节描述一个**半自动**评论生成器：管道生成候选评论，由人在前端逐条点「发送」才会真正调用 `commentThreads.insert`。即便如此，**自动化生成 + 批量发评在他人视频下仍可能违反 YouTube ToS 的「自动化/反垃圾」条款**，账号有被自动隐藏评论 / 限速 / 永久封禁的可能。是否使用、用多大量级，由实现方自行评估并承担。

### 12.1 新增依赖与文件

| 文件 | 作用 |
|------|------|
| `server.mjs` | Express，端口默认 8766，挂静态页 + API |
| `lib/db.mjs` | SQLite（`data.db`）：videos / searches / search_hits / drafts / posts / post_stats |
| `lib/search.mjs` | `search.list` + `videos.list` + `channels.list` 拼装并按粉丝/时长过滤 |
| `lib/captions.mjs` | `captions.list` + `captions.download`，**对他人视频几乎都返回 null（403）**，上层回退到「标题+描述」 |
| `lib/gemini.mjs` | `@google/genai` SDK 调 Gemini，prompt = 「课代表」式中文评论模板（无外链） |
| `lib/comments.mjs` | `commentThreads.insert`（发）+ `commentThreads.list`（回读统计） |
| `lib/scheduler.mjs` | 启动时扫一遍 < 3 天且距上次抓取 ≥ 6 小时的已发评论，刷新 `post_stats` |
| `public/index.html` `app.js` `style.css` | 4 Tab 单页前端：搜索 / 草稿 / 成果墙 / 配置 |
| `run-server.bat` | 设置代理后 `npm run start` |

`package.json` 加上：`express`、`better-sqlite3`、`@google/genai`、`undici`。

### 12.2 OAuth scope 升级（必须！）

`oauth-login.mjs` 的 `SCOPES` 已加入：

```
https://www.googleapis.com/auth/youtube.force-ssl
```

接手步骤：

1. **GCP OAuth 同意屏幕** → 编辑 → 数据访问 → 添加 `.../auth/youtube.force-ssl`。  
   - 同意屏幕处于「测试中」+ 你是测试用户：直接生效，不需要 Google 审核。  
   - 同意屏幕已「发布」：force-ssl 是 sensitive scope，可能触发 Google 审核流程（提交隐私政策、用途说明，可能等几天～几周）。
2. 删除 `credentials/token.json`。
3. `npm run oauth`，浏览器同意页里会比之前多出「管理你的 YouTube 账号」一项。
4. 启动服务器：`npm run start` 或双击 `run-server.bat`。打开 `http://127.0.0.1:8766/`。

### 12.3 `.env` 新增项

```
GEMINI_API_KEY=...   # https://aistudio.google.com/apikey 申请
# GEMINI_MODEL=gemini-2.0-flash
# COMMENT_PORT=8766
```

### 12.4 数据流（顶层）

```
[关键词+阈值] → search.list(100u) → videos.list(1u) + channels.list(1u)
            → SQLite videos/search_hits（缓存命中视频）
            → 前端「① 搜索」展示

[选定视频] → captions.list/download（多数 403 → null）
        → gemini.generateContent(标题+描述+可选字幕)
        → SQLite drafts（pending）
        → 前端「② 草稿」可编辑

[逐条「发送」] → commentThreads.insert(50u) → SQLite posts + post_stats(初始)
            → drafts.status = posted

[启动 / 手动刷新] → 扫描 posts where age<3d AND last_fetch >= 6h
              → commentThreads.list(1u) 拿 likeCount/totalReplyCount
              → SQLite post_stats（追加历史）
              → 前端「③ 成果墙」走马灯 + html2canvas 另存 PNG
```

### 12.5 配额成本（YouTube Data API 默认 10000/天）

| 操作 | 配额 | v1 频次 |
|------|------|---------|
| `search.list` | **100** | 每次「开始筛」一次 |
| `videos.list` / `channels.list` | 1 / 次 | 搜索后跟一次 |
| `commentThreads.insert` | **50** | 每次「发送」一次 |
| `commentThreads.list` | 1 / 次 | 每次回读 |
| `captions.list` | 50 | 每次生成草稿一次 |
| `captions.download` | **200** | 每次生成草稿一次（**几乎都失败但仍计算配额**） |

→ 单次 search + 25 个视频生成草稿 ≈ `100 + 1 + 1 + 25 × (50+200) = 6352` 配额。**一天内打两次满阈值搜索基本就用光，请控制节奏。**

### 12.6 已知限制（v1）

- `search.list` 单次最多 50 条，本工具上限固定 50。需要更多结果可加分页（`pageToken`），未实现。
- 字幕只走官方 API。如果你想看用 yt-dlp / timedtext 做 fallback，自评合规后可加 `lib/captions-fallback.mjs`。
- `commentThreads.insert` 出错时（API quota / 评论关闭 / 反垃圾自动隐藏）只把 draft 留在 pending，不重试。
- 没有任何对「同一视频不要重复发评」的去重检查 —— 这是 v1 留给前端使用者的责任（数据库里 `posts` 表可以查）。

### 12.7 启动确认清单

- [ ] `.env` 里 `GEMINI_API_KEY` 已填
- [ ] `oauth-login.mjs` 的 SCOPES 含 `youtube.force-ssl`，且已删旧 token + 重跑 oauth
- [ ] GCP 同意屏幕的 scope 列表里有 `.../auth/youtube.force-ssl`
- [ ] `npm install` 装上 `better-sqlite3`（Windows 上若编译失败要装 VS Build Tools，多数情况 prebuilt 直接下）
- [ ] `npm run start` → 浏览器开 `http://127.0.0.1:8766/` → 配置 Tab 看到 `就绪 · 可发评`
