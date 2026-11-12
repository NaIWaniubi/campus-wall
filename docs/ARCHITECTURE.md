# 校园墙 Campus Wall — 架构与机制详解

> 更新时间：2026-08-24（双端形态：Web SPA + 微信小程序）
> 技术栈基线：Vue 3.5 · Vite 8 (Rolldown) · TypeScript 5.9 · Express 5.2 · better-sqlite3 13

---

## 1. 总体架构

单仓库全栈项目（monorepo 形态的简化版）：`src/` Web 前端 SPA + `miniprogram/` 微信小程序 + `api/` 后端服务。后端一套代码支持**两种运行形态**，双端消费同一份 REST 契约（详见第 8 节小程序适配层）：

```
┌─────────────────────────── 浏览器 ───────────────────────────┐
│  Vue 3 SPA (dist/)                                           │
│  vue-router(history 模式) + Pinia(持久化) + axios            │
└──────────────┬───────────────────────────────┬───────────────┘
               │ /api/*  /uploads/*            │ 其余路径 → index.html
┌──────────────▼───────────────┐   ┌───────────▼───────────────┐
│ 形态 A：本地/VPS              │   │ 形态 B：Vercel             │
│ Express 5 (tsx 直跑 TS)       │   │ api/index.ts Serverless    │
│ :3001                        │   │ (同一份 app.ts)             │
│  ├ 静态托管 dist/ + SPA 回退  │   │  └ rewrites 全部进函数      │
│  ├ /uploads 受控文件服务      │   │                            │
└──────────────┬───────────────┘   └───────────┬───────────────┘
               └────────────┬──────────────────┘
                    ┌───────▼────────┐
                    │ SQLite (WAL)   │ api/data.db  ← 单文件嵌入式
                    │ 20 张表        │
                    └────────────────┘
```

**关键设计**：`api/app.ts` 导出纯 Express app，不绑定端口——本地由 `api/server.ts` listen，Serverless 由 `api/index.ts` 包装。一份业务代码，两种部署。

---

## 2. 目录结构

```
校园墙/
├─ src/                      # 前端（Vue 3 + <script setup lang="ts">）
│  ├─ main.ts / App.vue      # 入口：createPinia(+persistedstate) + router
│  ├─ router/index.ts        # 27 条路由 + 全局守卫（登录/管理员）
│  ├─ stores/
│  │  ├─ user.ts             # token/user + 权限 getter（信誉分门槛）
│  │  └─ app.ts              # 全局 UI 状态
│  ├─ utils/
│  │  ├─ request.ts          # axios 封装：拦截器 + 401/403 处理 + toast
│  │  ├─ api.ts              # 按模块组织的 API 调用层
│  │  └─ helpers.ts          # 格式化工具
│  ├─ components/            # PostCard、CreditBadge、ChatPanel、AiAssistant 等 8 个
│  └─ pages/                 # 用户端 16 页（含我的点赞）+ admin/ 管理端 9 页
├─ api/                      # 后端（Express 5，TS 由 tsx 直接运行）
│  ├─ server.ts              # 本地入口：listen 3001 + SIGTERM/SIGINT 优雅退出
│  ├─ index.ts               # Vercel Serverless 入口
│  ├─ app.ts                 # ★ 核心：中间件链 + 路由挂载 + 错误/404 兜底
│  ├─ db.ts                  # SQLite 初始化、建表、种子数据（20 张表）
│  ├─ middleware/auth.ts     # authRequired / authOptional / adminRequired / superAdminRequired
│  ├─ routes/                # 17 个路由模块（auth/posts/comments/users/messages/
│  │                         #   sections/upload/drafts/announcements/ai/adminAi/
│  │                         #   subscriptions/trades/feedback/conversations/follows/admin）
│  ├─ jobs/                  # dailyDigest 每日摘要 / backup SQLite 定时备份轮换
│  ├─ knowledge/             # AI 助手官方知识库（official.md，管理端可编辑）
│  └─ utils/                 # jwt / response / notification / sensitive / ai / match / cache
├─ public/uploads/           # 用户上传图片（受控访问）
├─ vite.config.ts            # 构建：vendor 分包 + hidden sourcemap + dev 代理
├─ eslint.config.js          # ESLint 9 扁平配置
├─ vercel.json               # Serverless 部署编排
└─ nodemon.json              # 开发热重启（watch api/）
```

---

## 3. 前端机制

### 3.1 启动流程 (`src/main.ts`)
`createApp(App)` → `createPinia()` → `pinia.use(createPersistedState())` → `router` → mount。图标库为 `@lucide/vue`（lucide-vue-next 的官方继任者）。

### 3.2 路由与守卫 (`src/router/index.ts`)
- **history 模式**（需服务端 SPA fallback，两端形态都已配置）
- meta 标记两级权限：
  - `requireAuth: true` → 未登录跳 `/login?redirect=...`
  - `requireAdmin: true` → 非管理员跳 `/403`（判断依据是 store 里 user.role）
- 守卫同时统一设置 `document.title`
- 兜底：`:pathMatch(.*)*` → 重定向 `/`

### 3.3 状态管理 (`stores/user.ts`)
Pinia Options 式 store，通过 `pinia-plugin-persistedstate` 持久化到 `localStorage`（key: `campus-wall-user`）。

**信誉分权限体系**（getter 实现，0–120 分分级）：

| getter | 门槛 | 说明 |
|---|---|---|
| canPost / canComment | ≥60 | 发帖、评论资格 |
| canAnonymous | ≥90 | 匿名发言资格 |
| postLimit | <60:0, <80:3, 其他:10 | 每日发帖数 |

角色三级：`user` / `section_admin`（板块管理员）/ `super_admin`（超级管理员）。

### 3.4 请求层 (`utils/request.ts`) — 前后端的契约枢纽
- **约定响应包**：`{ code, message, data }`，HTTP 状态多为 200，业务码在 body.code
- 请求拦截器：自动附加 `Authorization: Bearer <token>`
- 响应拦截器：
  - `code===200` → 直接返回 res
  - **401** → 清空登录态；按当前路径区分前台 `/login` 与后台 `/admin/login`，携带 redirect 回跳
  - 403/其他 → 统一 toast 提示并 reject
- 内置零依赖 Toast 系统：800ms 相同消息去重，防并发失败时提示风暴

### 3.5 性能相关
- 路由级代码分割仅用于 403 页，其余页面静态导入（首屏打包在一起，靠 vendor 分包控制缓存失效）
- 构建产物（Vite 8 / Rolldown）：
  - `vendor.js` ≈ 58KB gzip（vue/router/pinia/axios，业务迭代不影响其缓存）
  - `index.js` ≈ 44KB gzip（业务代码）
  - CSS 33KB / gzip 6.75KB；sourcemap 为 hidden 模式（生产可排查但不暴露链接）

---

## 4. 后端机制

### 4.1 中间件链 (`api/app.ts`，按序)

1. **隐藏指纹**：`app.disable('x-powered-by')`
2. **安全响应头**（轻量自实现，未引 helmet）：nosniff / X-Frame-Options=SAMEORIGIN / Referrer-Policy / X-XSS-Protection / Permissions-Policy
3. **CORS**：`cors()` 默认全放开
4. **Body 解析**：json + urlencoded，limit 10MB（为大图 base64 场景留量）
5. **受控上传访问** `/uploads/:file`：不用 express.static，改为白名单正则 `<userId>_<timestamp>.jpg|jpeg|png` 校验文件名，杜绝目录遍历与列举，再 sendFile
6. **请求日志**：一行式 method+path（跳过 health）
7. **API 路由挂载**：17 个模块，其中 comments、sections、trades、follows 挂在 `/api` 根下（路径内含资源前缀；follows 与 users 共用前缀但均为两段以上路径，不与 users.ts 的单段 `/:id` 冲突）
8. **健康检查** `/api/health`
9. **生产模式专属**：express.static(dist, maxAge 1d) + 正则 SPA fallback `/^(?!\/api|\/uploads).*$/`（Express 5 兼容写法，避开 path-to-regexp v8 通配符语法变更）
10. **错误处理中间件**：识别 MulterError 转 400 友好提示，其余 500
11. **404 兜底**：统一 JSON

### 4.2 认证体系（JWT）
- 签发：登录/注册成功 → `generateToken({id, studentId, role})`，默认 7 天过期
- 密钥策略（`utils/jwt.ts`）：
  - 生产（NODE_ENV=production 或 PRODUCTION=1）：无 `JWT_SECRET` **直接拒绝启动**（防止 token 可伪造）
  - 开发：回退内置 DEV_SECRET 并打印一次性警告
- 四个鉴权中间件按需挂载：

| 中间件 | 行为 |
|---|---|
| authRequired | 无有效 token → 401；用户不存在/封禁(banned) → 401/403 |
| authOptional | 有 token 解析，无效静默放行（游客浏览） |
| adminRequired | section_admin 或 super_admin |
| superAdminRequired | 仅 super_admin |

- 鉴权通过后把用户挂在 `req.currentUser`（通过 `declare global { namespace Express }` 类型扩展）

### 4.3 数据层（better-sqlite3）
- 同步 API、单连接，性能足够校园规模；**WAL 模式** + 外键开启
- **20 张业务表**（另有 `posts_fts*` 5 张 FTS5 索引表）：users、sections、posts、comments、likes、favorites、messages、reports、drafts、announcements、announcement_acks、settings、subscriptions（板块订阅）、trade_offers（意向出价）、trade_ratings（交易互评）、feedback（意见反馈）、conversations / chat_messages（私信会话）、follows（关注关系）、admin_logs（管理审计）、push_subscriptions（Web Push）
- 启动时幂等建表（CREATE TABLE IF NOT EXISTS）+ 种子数据
- DB 路径可用 `DB_PATH` 环境变量重定向（绝对/相对均支持），默认 `api/data.db`

### 4.4 上传安全（routes/upload.ts）— 三道校验
1. 扩展名白名单（jpg/jpeg/png）
2. MIME 与扩展名映射比对
3. **Magic number 文件头校验**（读前 4 字节比对 FFD8FF / 89504E47），不一致即删除文件拒绝入库 —— 防改后缀伪装
- 大小限制 5MB（超限走全局 MulterError 处理转 400）；文件名服务端生成，不可控

### 4.5 内容治理
- **敏感词检测**（utils/sensitive.ts）：发布时实时过滤
- **举报机制**：24h 频控，3 人举报自动提升优先级进入管理后台队列
- **通知系统**（utils/notification.ts）：评论/点赞/系统通知三类，落 messages 表，前端红点 + 已读

### 4.6 AI 模块（routes/ai.ts + utils/ai.ts + adminAi.ts + knowledge/）
站内 AI 助手：OpenRouter 驱动（`OPENROUTER_API_KEY`），结合官方知识库 `api/knowledge/official.md` 与帖子检索（title/content LIKE 加权打分）。管理端 `AdminAiPage` 维护知识库内容、模型与开关（GET/PUT /api/admin/ai/knowledge、/settings、/stats）。

### 4.7 本轮新增端点与语义（2026-08-24）

| 分组 | 端点 | 说明 |
|---|---|---|
| 私信会话 ×5 | `GET / POST /api/conversations`、`GET / POST /api/conversations/:id/messages`、`GET /api/conversations/unread-count` | 列表项 `{id, peer{id,nickname,avatar}, lastMessage, lastAt, unread}`；建会话传 `{peerId}`（双方 id 按 a<b 规范存储，防重复建会话）；**GET 消息即清零我侧未读**；消息升序分页 |
| 关注体系 ×4 | `POST /api/users/:id/follow`、`GET .../following`、`GET .../followers`、`GET .../follow-status` | follow 为 toggle 语义；列表含昵称+信誉分（供 CreditBadge 渲染）；status 供详情页按钮回显 |
| 我的点赞 | `GET /api/users/me/likes` | 返回 `{list,total,page,pageSize,hasMore}` 标准分页 |
| 意见反馈 ×2 | `POST /api/feedback`、`GET /api/admin/feedbacks` | 提交校验 content≤500 必填、contact≤100 选填；后台分页检索 |
| 微信登录 | `POST /api/auth/wx-login` | code 换 session（jscode2session，运行时读取 WX_APPID/WX_SECRET）→ 已绑定 openid 直接签发 JWT，未绑定创建占位账号；`WX_APPID`/`WX_SECRET` 未配置返回 **501**，小程序静默回退学号密码登录 |
| 失物方向过滤 | `GET /api/posts?sectionId=2&direction=lost\|found` | SQL 层 `json_extract(p.extra_fields,'$.direction')` 精确过滤，仅失物板块生效 |

**extraFields 浅合并编辑语义**（`PUT /api/posts/:id`）：请求携带的扩展键经白名单清洗（`sanitizeExtraFields`）后逐键覆盖库中现有值，未携带的键原样保留。

> 为何这样改：编辑表单只提交当前板块模板字段，整体替换会把 `direction` 等未随表单出现的扩展键抹掉——失物帖将从「丢失/拾获」筛选 tab 直接消失；浅合并让 Web 与小程序各自按需增量更新（posts.ts 白名单注释同源记录）。

---

## 5. 构建与部署

### 5.1 命令脚本

| 命令 | 实际执行 | 用途 |
|---|---|---|
| `npm run dev` | concurrently 同时跑 client:dev + server:dev | 前后端并行开发 |
| `client:dev` | vite | 前端 :5173，代理 /api、/uploads → :3001 |
| `server:dev` | nodemon → tsx api/server.ts | 改 api/ 自动重启（delay 1s） |
| `build` | vue-tsc -b && vite build | 类型检查不过则不构建（质量闸门） |
| `start` | cross-env NODE_ENV=production tsx api/server.ts | 本地/VPS 生产运行 |
| `check` / `lint` | vue-tsc -b / eslint . | CI 可用的两项检查 |
| `seed` | tsx api/seed-demo.ts | 全板块演示数据种子（幂等；`--force` 重种）；演示账号 2377xxx/demo1234，admin/admin123 |

### 5.2 Vercel 形态（vercel.json）
- buildCommand 构建 dist；`api/index.ts` 为 Serverless 函数（maxDuration 30s）
- rewrites 三条规则按序匹配：
  1. `/api/(.*)` → 函数
  2. `/uploads/(.*)` → 函数（走 app.ts 里的受控文件路由）
  3. `/(.*)` → `/index.html`（SPA fallback）
- 注意：Serverless 文件系统只读，SQLite 需外部持久卷或改用托管 DB（当前实现更适合本地/VPS 形态）

### 5.3 环境变量

| 变量 | 必需性 | 说明 |
|---|---|---|
| JWT_SECRET | 生产必需 | 缺失直接拒启；开发有默认值+警告 |
| JWT_EXPIRES_IN | 可选 | 默认 7d |
| PORT | 可选 | 默认 3001 |
| DB_PATH | 可选 | SQLite 文件位置 |
| PRODUCTION=1 | 可选 | 不改 NODE_ENV 时标记生产 |
| AI 相关 key | AI 功能需要 | 见 .env.example |

---

## 6. 质量工具链

- **类型检查**：vue-tsc 3（Vue SFC + TS 全覆盖），`strict: true` 严格模式
- **ESLint 9 扁平配置**（eslint.config.js）：
  - eslint-plugin-vue `flat/essential`（只保留错误级规则，避免对存量模板做风格重排）
  - typescript-eslint recommended；关闭 no-explicit-any（配合宽松 TS）
  - `_` 前缀参数/变量豁免 unused；关闭 no-namespace（Express 类型扩展的标准写法）
  - `.vue` 显式用 vue-eslint-parser + script 内嵌 TS parser
- 构建顺序保证「先类型后产物」，坏代码出不了 build

---

## 7. 三轮创新迭代新增机制（2026-08-23）

| 机制 | 位置 | 说明 |
|---|---|---|
| 失物招领智能匹配 | api/utils/match.ts + posts.ts | 发布时关键词 LIKE 打分（标题2/正文1，阈值≥2，30天窗），双向站内通知；GET /api/posts/:id/matches |
| 图片压缩管线 | api/routes/upload.ts | sharp：>1600px 重编码（jpeg q80/png）+ .thumb.webp 缩略图（q75）；**必须以 Buffer 为 sharp 输入**（路径输入会 mmap 持句柄致 Windows 覆盖写失败）；上传目录统一 `<root>/public/uploads` |
| 热度排序+冷启动 | posts.ts 列表 | sort=hot 默认：(赞×2+评×3)/(小时+2)^1.5，≤30min ×1.5；置顶优先保留 |
| 板块订阅+每日摘要 | routes/subscriptions.ts、jobs/dailyDigest.ts | toggle/list 接口；每日 DIGEST_HOUR（默认20点）汇总新帖数+最热帖，日期标记防重发，DIGEST_NOW=1 手动触发 |
| 二手交易互评 | routes/trades.ts、db.ts trade_ratings | 作者标记完成(extra_fields.soldAt)→双向1-5星互评→信誉分±（好评+2/差评-3，钳0-120）；GET /api/users/:id/trade-ratings |
| 风险评分分级审核 | utils/sensitive.ts assessRisk() | pass/warn/review 三级：review→pending_review 进管理员「人工审核」tab，warn 带 riskFlag 正常发布；编辑路由同步分级防绕过 |
| 信息流读缓存 | utils/cache.ts + posts.ts | Map 版 LRU(200)+TTL(60s)；只缓存 DB 原始行（用户态字段现算防串号）；17 处写路径前缀失效；X-Cache: HIT/MISS 头 |
| 定时备份轮换 | jobs/backup.ts | better-sqlite3 db.backup() 在线备份（WAL 安全）→ api/backups/，默认保留 7 份（BACKUP_KEEP），BACKUP_NOW=1 手动触发 |
| 信誉等级徽章 | CreditBadge.vue、helpers creditTitle | 四档：≥90信誉之星/≥80可靠达人/≥60诚信新人/<60待改进；个人页两处+帖子卡片（匿名不显示，posts 接口 authorCreditScore 匿名置 null） |
| 匿名帖可追溯曝光 | admin.ts REPORT_REVEAL_THRESHOLD=3 | 树洞平衡设计：普通侧永远完全匿名；同一匿名帖 pending 举报 ≥3 时，仅管理员举报列表出现 revealedAuthor（昵称+学号）+ 前端橙色警示条；低于阈值或举报处理后自动隐藏 |

### 已知边界与经验
- **多 Agent 并行写同一仓库**：调度交错会导致成员 attempt 频繁失效（需队长代为补登状态）；同文件任务用依赖链错开
- PowerShell 5.1 `Invoke-RestMethod` 发中文 JSON body 默认非 UTF-8 → 服务端敏感词静默失配，接口测试需 `[Text.Encoding]::UTF8.GetBytes()` 显式编码
- 缓存取舍：详情页 view_count 自增不打穿列表缓存，由 TTL 兜底（浏览量最多滞后 1 分钟）

## 8. 微信小程序端（miniprogram/）

原生微信小程序（WXML/WXSS/JS，无第三方框架），与 Web 共用同一 Express 后端与 `{code,message,data}` 响应契约。

### 8.1 结构

- `app.json`：**29 个页面**注册 + `custom-tab-bar` 五 Tab（首页 / 话题 / 发布 / 消息 / 我的）
- `pages/`：index · category（八板块分类页：trade/lost/confession/daily/help/activity/carshare/team）· publish · message（+ chat 私信）· mine（myPosts / myFavorites / myLikes / follows / profile / notification / feedback / settings）· search · detail · legal（协议）· admin/moderation（内容审核）
- `components/` 7 个：post-card、comment-item、conversation-item、user-row、subscribe-btn、empty-state、load-more
- `utils/`：api.js 适配层、constants.js 板块映射、auth / cache / optimistic / share 等

### 8.2 API 适配层设计（utils/api.js）

设计动机：页面按早期 mock 版的路径与字段名编写，后端切换为 Express+JWT 后**不改页面**，由适配层统一翻译：

- **出站改写**：`resolvePath` / `adaptQuery` / `adaptPayload` 把旧调用（如 `/posts?category=trade`、`/user/info`）翻译为新契约路径与字段（category → sectionId 等）
- **入站归一**：`adaptResponse` 按 URL 分派——`normalizePost` 为帖子补 time / extra / likes 等 camelCase 别名，`normalizeListPayload` 对齐 `data.list/total/page/pageSize/hasMore` 分页约定，页面渲染字段保持稳定
- **会话**：token 存 storage，请求统一带 `Authorization: Bearer`；401 清登录态跳登录；指定业务码（如 501）不弹错由调用方静默降级
- **降级策略演进史一句话**：早期 mock 数据兜底 → `unsupported()` 空数据优雅降级 + 控制台告警 → 后端能力落地后逐个摘除短路（如关注体系已接真实接口）

### 8.3 板块映射（utils/constants.js）

新后端 section id（1-8）与旧分类 key 的双向映射（`CATEGORY_TO_SECTION` / `SECTION_TO_CATEGORY`）：1 二手交易 trade · 2 失物招领 lost · 3 表白墙 confession · 4 吐槽树洞 daily · 5 互助问答 help · 6 校园活动 activity · 7 拼车 carshare · 8 组队 team。页面统一从常量取值，禁止散落硬编码。

### 8.4 登录双通道

学号密码表单 JWT（POST /api/auth/login）；wx.login 静默登录走 POST /api/auth/wx-login——服务端未配置 `WX_APPID`/`WX_SECRET` 返回 501 或请求失败时，静默回退表单登录，游客仍可浏览。

### 8.5 联调注意

- `project.config.json` 的 `urlCheck: false` 仅限联调期；上线前必须改回 `true` 并配置 HTTPS 合法域名
- 真机预览需把 `utils/api.js` 的 `DEFAULT_BASE_URL` 改为局域网 IP（或经 app.globalData.baseUrl 覆盖）

---

## 9. 升级后的已知边界 / 待办建议

1. `.env` 中的 `NODE_ENV=production` 会被 Vite 警告（不影响构建，建议移除该行）
2. 尾部 404 兜底与 CORS 全开放：公网部署前建议收紧 origin
3. Serverless + SQLite 组合不适合多实例写入，上 Vercel 建议换 Turso/D1/Postgres
4. 路由除 403 外未做页面级懒加载，页面继续增多时可逐步切 `() => import()`
