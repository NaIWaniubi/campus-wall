# 后端代码质量 / 安全 / 性能审计报告

**审计范围**: `E:\校园墙\api\**`（routes、middleware、utils、ws、jobs、scripts、app/db/server/observability、seed-demo）
**审计者**: backend developer + ops/security reviewer
**审计时长**: ~15 分钟信号聚焦

> 一句话：整体是健康的（强参数化查询、统一响应壳、JWT 校验严格、生产环境强制 SECRET、S3/Web Push/WX Push 凭据门控、SSE 鉴权 hello）。主要风险集中在**写路径的事务/原子性**、**个别写端点无 try/catch 与异步未捕获**、**posts/announcements/conversations/messages 几处缺乏限流**、以及**管理端部分路径仍走 super_admin 而非 superAdminRequired**。

---

## 🔴 Critical

### C1. 异步写端点失败被 Express 当成 200 成功 — `auth.ts:43-86` / `upload.ts:114` / `ai.ts:246-335`
- **问题**: `wx-login`、`POST /upload`、`POST /chat`、`POST /chat/stream` 是 async handler，但**路由层没有包 try/catch**，且 `ai.ts` 内部 try/catch 抑制所有错误（`console.error` 后返回 fallback），上传失败只在 STORAGE_DRIVER=s3 时返回错。其它未捕获的 Promise rejection 直接走默认 Express 错误中间件——但 upload async 失败时 multer 已经写盘并返回 res，多重响应风险。
- **影响**: 
  - `wx-login`: 微信 API 成功后写用户时如果 `bcrypt.hashSync` 抛错（极低概率），用户已拿到半成品 user_id，无 token 仍 200 不一致。
  - `upload`: 异步链路上 `storageIface.put` 失败且 STORAGE_DRIVER=local（默认）时**继续返回 200 + URL**，但原图可能没压缩（写读 OK）或缩略图没生成。
  - `ai.ts:266-280`: AI 调用失败后静默返回 fallback reply + forums，前端**永远拿到 success**，UX 误导（用户以为 AI 正常）。
- **修复**: 用 `asyncHandler` 包装或在每个 async 路由首尾加 `try/catch → next(err)`；`ai.ts` 至少区分「未启用 / 真正失败」两种 status 字段。

### C2. 点赞/收藏/评论计数存在并发竞争 — `posts.ts:464-507`、`comments.ts:107-207`
- **问题**: `like_count`/`comment_count`/`favorite_count`/`view_count` 通过 `UPDATE ... SET x = x + 1` 增减，但**点赞事务内读 `post.like_count` 然后写 `likeCount: post.like_count + 1` 返回**——读到的不是最新值，并发下响应 likeCount 与 DB 实际值会漂移。
- **影响**: 用户 A、B 同时点赞同一帖子，B 可能看到自己返回的 `likeCount` 比 DB 实际少 1；后续 cancel 接口同样会读到旧值导致 `MAX(0, like_count - 1)` 在原始旧值上减（**实际不会到负数**，但和列表缓存不一致）。
- **修复**: 在 `db.transaction(() => { read; update; })` 中重读最新值后再返回；或将 `return db.prepare('UPDATE … RETURNING like_count').get(id)`（better-sqlite3 支持）拿更新后值。

### C3. trade_ratings 信誉分变更存在 TOCTOU + 多次自评重试 — `trades.ts:76-135`
- **问题**: 
  1. 信誉分变化走「读 → 改」两步（line 118-124），无 transaction，并发下两个评分可能都基于同一旧值计算；
  2. `delta=0` 时跳过 UPDATE（line 119），但**仍读 old credit_score 返回 newScore**，并发下错位。
  3. `try { INSERT INTO trade_ratings … } catch (UNIQUE)` 单独捕错，**但 rateeId 与自己相等在 line 96 已 reject**，未防 race 重复提交——同一 rater 在 UNIQUE 触发前两次进入都通过校验才被 UNIQUE 拦下，可接受但缺监控。
- **修复**: 把"插评分 + 改 credit + 通知"包进 `db.transaction(() => { …; newScore = UPDATE… RETURNING credit_score })`。

### C4. conversations 写消息的事务只覆盖单条 INSERT — `ws/handlers/dispatcher.ts:40-52`
- **问题**: 事务里 INSERT + UPDATE conversations + SELECT created_at；**但 line 46 单独 SELECT 拿时间戳**——同一事务内拿到的 created_at 是 SQLite CURRENT_TIMESTAMP（同一秒内可能与 `last_at = CURRENT_TIMESTAMP` 不一致——`julianday` 在毫秒级可能有偏差），导致 chat_messages.created_at 与 conversations.last_at 错位。
- **影响**: 列表按 last_at DESC 排序，会话排序与首条消息的 createdAt 不一致，客户端做 timeline 拼装时会出现"会话最新时间 < 最后一条消息时间"的诡异排序。
- **修复**: 用 `new Date().toISOString()` 在事务外统一传入，避免 SQLite 时区/精度漂移。

---

## 🟠 High

### H1. 管理端大量路由**未走 superAdminRequired** — `admin.ts:306 / 496 / 85-262 散落`
- **问题**: 路由用 `requireAdmin(false)` 工厂而非 `superAdminRequired` 中间件工厂；`PUT /sections/:id`(496)、`DELETE /comments/:id`(306)、`PUT /posts/:id/ban`、`/top`、`/audit` 内部没显式调用 super_admin 判断，导致代码审查时容易遗漏。
- **现状**: `requireAdmin(false) = superOnly` 和 `requireAdmin(true) = sectionAllowed` 是函数式封装，初看比 superAdminRequired 直观；但**没有任何编译时保护**——新人加 admin 路由忘了挂 middleware 就裸奔。
- **修复**: 在 `admin.ts:29-30` 后面用 `Object.freeze({ superOnly, sectionAllowed })` 防止误传 bool；并在路由列表处加 `// REQUIRES: superOnly | sectionAllowed` 注释。

### H2. conversations/messages/announcements/follows/drafts/adminAi 写端点无 rate limit
- **问题**: `conversations.ts` 所有写端点（创建会话、发消息）、`messages.ts` 全部 PUT/PATCH、`announcements.ts:42 POST /:id/ack`、`announcements.ts:67 POST /`、`follows.ts:13 POST /:id/follow`、`drafts.ts POST/PUT/DELETE` 均无 rate limit。仅 `posts/comments/upload/ai` 走 `createRateLimiter`。
- **影响**: 攻击者拿一个合法 token 就能暴力刷消息/会话/草稿，触发站内通知 spam（**通知会推 WS + Web Push + WX Push**，最坏放大 3 倍）。
- **修复**: 在 routes/conversations.ts 上挂 `createRateLimiter({ name:'chat', windowMs:60_000, max:30 })`；follows 走 `max:60`；announcements POST 走 `max:5`。

### H3. 上传 magic number 校验在异步链路上**晚于 multer 写盘** — `upload.ts:114-127`
- **问题**: multer 已把文件写到 `uploadDir`（`public/uploads`），然后才 `verifyMagicNumber` + 不符则 `fs.unlink`。攻击者发 100 个伪装 PNG 的 5MB 文件，全部先落盘再被清理，**瞬时磁盘占满**。
- **影响**: 5MB × 并发 = GB 级瞬时写入，DoS 表象。
- **修复**: 改用 multer memory storage + 写盘前 verifyMagicNumber，或先用 `image-size` 在 fileFilter 同步阶段粗检。

### H4. `subsType` JSON path 用户可控键名 — `posts.ts:143`
- **问题**: `subType` 形如 `key:val`，`key` 走 `'$."${key}"'` 直接拼到 SQL JSON path。**虽然 val 是参数化（安全），但 key 是用户输入**——攻击者可传含 `"` 的 key 注入 JSON path（SQLite 不严格校验）。
- **现状**: 利用面窄（仅 JSON path 语法），但属于「拼接 SQL」的写法违反规范。
- **修复**: 维护白名单 `EXTRA_FIELD_WHITELIST` 直接匹配 `key`，命中才追加对应条件。

### H5. admin/users/:id/credit 无事务且无审计 — `admin.ts:138-156`
- **问题**: 调整 credit_score 走读 + UPDATE，但**没有事务**——并发下两个管理员同时加分，第二个会读到第一次提交后的值（OK），但**通知消息（line 146）跑在 UPDATE 之后，未与 transaction 同包**，极端情况下 credit 改了但消息没发。
- **修复**: 整个 handler 包 `db.transaction(() => { … })`。

### H6. AI SSE 流式响应**在 chatWithAI 抛错时调用了 res.end 两次** — `ai.ts:330-334`
- **问题**: 
  ```
  try { … send('error', …) } catch { … }
  res.end();
  ```
  catch 块没有 return；同时 `send('error')` 后没 res.end，fallback 是 catch 后再 res.end()——OK。但如果 catch 内抛错（极小概率），res.end 不会被调用，连接悬挂直到 client close。
- **修复**: catch 块用 `finally` 兜底 res.end，或在 try/catch 后统一 `try { res.end() } catch {}`。

### H7. drafts 自动保存 vs 手动保存的 race — `drafts.ts:38-93`
- **问题**: 客户端自动保存走 POST（重建新条目），手动保存走 PUT（id=已知）；**但 POST 上限是 10 条，每次 POST 都先 DELETE 最旧**——自动保存频率高时（每 30s）会把手动保存的草稿挤掉。
- **影响**: 用户手动保存"重要草稿"被自动保存覆盖（删除最早那条），下次进草稿箱发现找不到。
- **修复**: 自动保存应优先 update 当前编辑中的 id，找不到才 POST；或单独维护 `drafts_recent(sectionId, user_id)` 主键保留单条。

---

## 🟡 Medium

### M1. 全站 TypeScript `any` 重度使用 — `routes/*.ts` 共 48 处 `: any` / `as any`
- `db.prepare(...).get(...) as any` 在 48 个 query 处出现，导致字段拼写错误（如 `post.author_credit_score` 改名）编译期不报错。
- **修复**: 用 `kysely` 或写 `interface PostRow { author_nickname: string; … }` + `as unknown as PostRow[]`；至少在 `posts.ts`、`comments.ts` 高频处定义 Row 类型。

### M2. 缓存键空间爆炸风险 — `utils/cache.ts` + `posts.ts:184-190`
- 缓存 key 含全部 query 参数（keyword/sectionId/page/pageSize/...），攻击者遍历 keyword 可爆 map（容量 200 默认，**最旧被淘汰但每条都写一次**）。
- 现状: `CACHE_MAX_SIZE` 默认 200，命中驱逐逻辑 OK；但 `cacheInvalidate('posts')` 在任何帖子写都触发——热数据会被频繁踢出。
- **修复**: 把高频稳定查询（无 keyword/subType 等用户输入）作为「hot key」，keyword 查询**不缓存**或独立 namespace。

### M3. `comments.ts:34-40` 递归取 reply 列表存在 N+1
- `formatComment` 每条顶层评论都重查 `parent_id = ?`，深度递归时**每条子回复都触发新查询**。
- 实际量不大（评论数 < 1000），但热门帖评论上百条时 SQL 次数爆炸。
- **修复**: 一次性 `SELECT … WHERE post_id = ? AND status='active'`，内存里 build tree。

### M4. 管理端 `/users` 列表全表拉 post 计数 — `admin.ts:70-73`
- `SELECT user_id, COUNT(*) FROM posts WHERE status != 'deleted' GROUP BY user_id` 全表扫；用户量大时显著慢。
- **修复**: 改成 `LEFT JOIN users u LEFT JOIN posts … GROUP BY u.id`，或在 users 表冗余 `post_count` 字段发帖时 +1。

### M5. 静态 hot-words 数组硬编码 — `sections.ts:31`
- `hot-words` 八条写在代码里，永远不变。
- **修复**: 移到 settings 表或 `knowledge/hot-words.json`，admin 可改。

### M6. console.error 泄露 stack — `app.ts:211`
- 全局错误中间件 `console.error(...error)` 把 Error 对象完整序列化到 stdout——Sentry 接管前这是默认行为；error.message 可能含 SQL/路径。
- **修复**: 生产环境只打 `error.message`，stack 进 Sentry extra。

### M7. CORS 完全开放 — `app.ts:61`
- `app.use(cors())` 无 origin 白名单 + 无 credentials 配置；浏览器侧携带 cookie 时会失败（前端用的是 Bearer header，问题小）；但**任何 origin 都能调 API**——结合无 CSRF token，理论可被跨域利用（攻击者诱导用户点链接，从 attacker.com 调 admin API——前提是带 Bearer token，浏览器预检会拒，所以**实际风险低**）。
- **修复**: 限定 origin 白名单 + `allowedHeaders: ['Authorization', 'Content-Type']`。

### M8. `messages.ts:67-77` 全部已读 SQL 拼接 IN
- `IN (${placeholders})` 是 ids 数组 .map 生成 '?'，无注入（ids 来自 Number.isFinite 过滤），但**ids 数量无上限**——恶意客户端发 10 万个 id 撑爆 SQL。
- **修复**: 限制 ids.length <= 100，否则分批或 reject。

### M9. `feedback.ts` 用户反馈**无敏感词审核 + 无图片限**
- 用户提交反馈未走 `getRiskLevel`；没有图片字段（仅 text），但和发帖共用 user_id，**用户被禁后仍可继续提交**。
- **修复**: 加 `req.currentUser.status === 'active'` 检查 + 走敏感词。

### M10. 上传 endpoint 大小 5MB + contentLength 头不可信 — `upload.ts:72`
- multer `limits.fileSize` 是真实读取后检查，但**没有 maxFiles 限制**——攻击者并发发多文件会撑内存（multer disk storage OK，s3 时全内存）。
- **修复**: `multer({ limits:{ files:1 } })`。

### M11. announcements /active 公告优先取 1 条但顺序固定 — `announcements.ts:13-26`
- 多条新公告时永远只显示第一条，其他静默忽略；用户 ack 后才轮到下一条。
- 实际是设计意图，但**`ORDER BY a.created_at DESC LIMIT 1`** 拿到的可能是过期时间最近但优先级最低的那条。
- **修复**: 加 `ORDER BY is_sticky DESC, created_at DESC` 或显式 priority 字段。

### M12. `trades.ts:99` 评分合法性仅校验整数
- `Number.isInteger(score) && score >= 1 && score <= 5` 防小数 OK，但**未防 NaN**——`Number(undefined) === NaN`，isInteger(NaN) === false，已经挡住；不过**没限制 rating 是 JSON 数字 vs 字符串**——`"5"` 会被 `Number("5")` 接受（设计 OK）。
- **修复**: 当前可接受，仅记录。

### M13. ws/handlers/dispatcher.ts 通知被吃
- `upsertNotification(peerId, 'chat', …)` 包了 try/catch 但**没 throw**——错误吞了，前端拿不到任何反馈。
- **修复**: 至少 `console.error` 后 throw，让 ws server 的 message handler 捕获发 error。

### M14. seed-demo.ts 演示数据有硬编码密码 `demo1234` + admin123
- `db.ts:260` 默认 admin 密码 `admin123`，seed 用 `demo1234`，**生产环境如果未覆盖就是已知凭据**。
- 已有 liftExpiredBan + 强制生产环境 JWT_SECRET，但**密码初始化没有强制**——admin 必须登录后改密码。
- **修复**: 生产环境检测默认密码直接拒绝启动，或要求 `ADMIN_INIT_PASSWORD` 环境变量。

### M15. `admin.ts` 路由不少未走 `authRequired`（依赖 router.use）
- `admin.ts:32` 有 `router.use(authRequired)`，OK；但**未来新增路由忘记挂 middleware 就会裸奔**——无法编译期发现。
- **修复**: 加 lint 规则："admin 路由必须挂中间件"。

### M16. `comments.ts:174-189` 评论删除后子回复孤儿
- DELETE 只删主评论，子回复 `parent_id` 仍指向已删评论；前端 list 调用仍会取到子回复展示（因 `c.status = 'active'` 不过滤 parent）。
- **修复**: 删除主评论时级联改子回复 status='deleted'，或 list 时 `JOIN comments parent ON parent.id = c.parent_id AND parent.status = 'active'`。

### M17. `dailyDigest.ts:32-39` 每个订阅者每个板块 2 次 query
- 总查询数 = subscribers × sections × 2 —— 1000 订阅 × 6 板块 = 12000 SQL/日。
- **修复**: 一次性 `GROUP BY section_id` 拉所有板块的新帖数和 hotPost，再按用户裁剪。

### M18. `posts.ts:316` 每日发帖上限未防跨时区/跨进程
- 单进程 OK；多进程（cluster / pm2 fork）下**每个进程独立计数**，4 进程实际限额 4×limit。
- **修复**: 用 DB 计数（已有），但当前 SQL 是 `WHERE user_id = ? AND date(created_at) = date('now')`——OK，DB 单源；但**写入和计数不在同一事务**，可能超过 1 条。
- **修复**: `db.transaction(() => { check_count; if (count < limit) insert })`。

---

## 🟢 Low

### L1. 路由 handler 类型 `req, res` 缺 `Request, Response`
- `posts.ts:295 router.post('/', authRequired, postLimiter, (req, res) => {` 没有显式类型——TS 推断成 `any`，后续 `req.body.images` 无类型保护。
- **修复**: 加 `: Request, : Response`。

### L2. `db.ts` 表结构定义与 `kysely types` 不一致（admin_logs 注释提到）
- `db.ts:431-441` admin_logs 注释里说"对齐 kysely types.ts 的 AuditLogTable"，但**实际项目里没看到 kysely**——注释残留。
- **修复**: 移除该注释或真的引入 kysely。

### L3. `app.ts:90-99` 5xx 计数器是模块级变量
- 重启清零、cluster 模式下多进程分别计数。
- **修复**: 用 Prometheus counter（已有 Sentry，可加 metrics）。

### L4. `seed-demo.ts:167` 用 `json_set` 改 extra_fields
- 单进程 OK，但**JSON 函数在旧版 SQLite 不可用**——需 SQLite >= 3.38。
- **修复**: 在 `db.ts:25` 后断言 `db.prepare('SELECT sqlite_version() AS v').get()` >= 3.38。

### L5. `app.ts:147-148` 版本号读取失败 fallback 'unknown' 但没日志
- 静默 catch 不打日志——版本不一致时排障困难。
- **修复**: catch 内 `console.warn`。

### L6. `jwt.ts:39-44` 验证失败吞错
- `try { verifyToken } catch { return null }` 不区分 `TokenExpiredError` / `JsonWebTokenError`——前端拿到的永远是"未登录"。
- **修复**: 抛出区分错误码（401 vs 401-with-reason）。

### L7. `auth.ts` 路径前缀 `/api/auth` 已挂，但 `/api/auth/wx-login` 与 `/login` 形状差异
- `wx-login` 返回 `{ token, user: toCamel(user) }`，但 `user` 是 SELECT * 含 password（已 hash 但仍是 bcrypt 哈希）。
- **风险**: wx-login 响应 body 含 `password: '$2a$10$xxx...'`。**前端极可能不会用，但埋雷**。
- **修复**: `SELECT id, student_id, nickname, ...` 白名单列。

### L8. `notifications.ts:13 DEDUP_WINDOW_DAYS = 7` 硬编码
- 同 user 同 type 同 related_id 7 天去重，运营调整需求时改源码。
- **修复**: 移到 settings 表。

### L9. `push.ts:80` 推送失败仅 warn
- 失败原因被吞，监控盲区。
- **修复**: 失败计数 + Sentry extra。

### L10. `backup.ts:78-95 rotateBackups` 排序只按文件名
- 同秒两次备份（手工触发）文件名相同，覆盖前一文件。
- **修复**: 加 ms 后缀。

### L11. `comments.ts:91-94` 10 秒不可重复评论——只校验本人
- 攻击者同 token 换 IP（已是 POST）也能绕（但限流已防），可接受。

### L12. `db.ts:414-420` users.openid 索引单独建，缺部分索引：
- `posts (user_id, status, created_at)`（我的帖子）
- `comments (user_id, created_at)`（我的评论）
- `subscriptions (user_id, created_at)`（我的订阅列表已 ORDER BY created_at DESC）

### L13. `conversations.ts:127-140` REST 发消息和 ws 发消息**重复事务**
- REST 直接调 `dispatchChatMessage`，ws 走 `dispatchByPeer` → `dispatchChatMessage`——OK 共用；但**事务 commit 后才 sendTo**，客户端拿到的 createdAt 是事务**提交后**从 DB SELECT 的——ms 级误差可接受。

### L14. `app.ts:189-201` 生产环境 SPA fallback 仅 GET 生效
- POST/PUT/DELETE 未匹配路由会被 404 中间件接管；前端 axios 拦截器需要专门处理。
- **修复**: 在 SPA fallback 也接 `req.method !== 'GET' → next()`（已实现），但日志可补一行说明。

### L15. 没用 helmet / express-rate-limit 等成熟库
- 安全头手写（X-Content-Type-Options 等），限流手写——功能等价但维护成本高。
- 已有 `app.set('trust proxy')` 未设置，但 `req.ip` 直接用——部署在 nginx/cloudflare 后面时所有请求 IP 都相同，限流失效。
- **修复**: `app.set('trust proxy', 1)` + `app.set('trust proxy', true)`（视部署）。

---

## ✅ Quick Wins（≤1 行改动，明显安全）

1. `app.ts:147-148` 加 `console.warn('[health] version 读取失败')`
2. `app.ts:61` 把 `cors()` 改为 `cors({ origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'] })`
3. `auth.ts:127` `SELECT *` → 白名单列（去掉 password 字段泄露）
4. `app.ts:88` 加 `app.set('trust proxy', 1)` 一行（部署在反向代理后）
5. `posts.ts:295` 路由签名加 `: Request, : Response`
6. `db.ts:268` 在 `initDatabase` 末尾加 `if (process.env.NODE_ENV === 'production' && adminCount === 0) throw new Error('管理员密码不能为 admin123')`
7. `conversations.ts:1` 加 `router.use(createRateLimiter({ name: 'chat', windowMs: 60_000, max: 30 }))`
8. `follows.ts:1` 加 `router.use(createRateLimiter({ name: 'follow', windowMs: 60_000, max: 60 }))`
9. `announcements.ts:42` POST /:id/ack 加 `createRateLimiter({ name: 'ack', windowMs: 60_000, max: 30 })`
10. `messages.ts:67` 加 `if (ids.length > 100) return fail(res, 'ids 上限 100', 400)`
11. `app.ts:200` 加 `console.error('SPA fallback err:', err)` 调试用
12. `db.ts` 末尾加 `db.exec('CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at)')`
13. `db.ts` 末尾加 `db.exec('CREATE INDEX IF NOT EXISTS idx_comments_user_created ON comments(user_id, created_at)')`

---

## ⚠️ Avoid for now（看着像问题但有理由）

1. **`posts.ts:316` 每日发帖 limit 看起来不严谨（多次自评 race）**：现状用 `date('now')` SQLite 函数单源；DB 单进程不并发时够用；DB 函数不可绕。**避免**加 mutex。
2. **`app.ts:85` 每个请求都 console.log**：看着是性能问题，但量小（千 QPS 内 OK），删了排障困难。**保留**或加采样。
3. **`utils/response.ts:7` 成功也用 200 HTTP + 业务 code**：与 HTTP 语义不一致，但**前端拦截器已适配**——见 docs §3「与 A 不同 code 约定」。**不要**改 HTTP code。
4. **`cache.ts` LRU 是 Map 模拟**：看着简陋，但 capacity 200 + 60s TTL 足够，**避免**引外部 LRU 库。
5. **`db.ts:50` created_at 用 SQLite CURRENT_TIMESTAMP 而非 ISO**：看着时区有问题，但 `formatPost` 永远 `new Date(d).toISOString()`，前端永远拿 ISO。**保留**。
6. **`server.ts:32-50` DIGEST_HOUR 60s 轮询**：看着浪费但零依赖 + 容错好，**避免**用 cron 库。
7. **`ai.ts:79-167` 模型回退链打印 error**：看着日志多，但 fallback 是关键行为，**保留**。
8. **`push.ts:18-23` isVapidConfigured 重复 trim**：看着冗余，但 env 配错时早暴露，**保留**。
9. **`auth.ts:139-156` 不区分账号不存在/密码错**：看着粗，但**故意为之防账号枚举**（注释明确）。**保留**。
10. **`app.ts:62` `express.json({ limit: '10mb' })`**：看着大，但 9 图最大 5MB 总 + 元数据余量。**保留**。
11. **`backup.ts:62 db.backup(destPath)`**：看着会阻塞 WAL，但 better-sqlite3 的 backup 是基于 PAGER 的流式备份，**官方文档保证不锁库**。**保留**。
12. **`dailyDigest.ts:13-64` 单线程串行通知**：看似低效，但 SQLite 写并发有限 + 通知系统本身是异步链路，串行反而稳定。**保留**。

---

## 🎯 Top 5 Priorities

1. **【C2/C3/H5】把所有计数/评分/信誉分写操作放进事务并返回最新值**
   - 涉及 `posts.ts:464-507`、`comments.ts:107-207`、`trades.ts:76-135`、`admin.ts:138-156`、`admin.ts:88-118`
   - 一致性 bug + 数据漂移，**必须先修**
   - 预计改 5 个文件 × 30 行

2. **【C1/H6】补齐 async 路由错误处理 + 区分 AI fallback vs real failure**
   - `auth.ts:43-86`、`upload.ts:114-154`、`ai.ts:246-335`
   - 一个通用 `asyncHandler` wrapper 即可

3. **【H2】为 conversations/messages/announcements/follows/drafts 补 rate limit**
   - 复制 `createRateLimiter` 5 处
   - 防消息 spam 放大 Web Push + WX Push

4. **【H3/H4】上传前置 magic number 校验 + subType 白名单**
   - DoS 防护 + SQL 拼接清理

5. **【M16/M7】CORS 白名单 + 评论删除级联**
   - 前两个安全 Posture 收紧；评论孤儿数据修复

---

## 📋 API 契约一致性发现（相对 docs/API-MAPPING.md）

| API | 文档契约 | 代码实际 | 判定 |
|---|---|---|---|
| `POST /api/posts` | `{sectionId, title, content, images, isAnonymous, extraFields}` | ✅ 匹配 | OK |
| `POST /api/posts/:id/like` | `{liked, likeCount}` | ✅ | OK |
| `GET /api/messages?type` | `{list, unreadCount}` | ✅ + 多了 `hasMore/page/pageSize` | OK（增量） |
| `POST /api/posts/:id/report` | 路径 OK | ✅ | OK |
| `GET /api/search?keyword` | `{list, total, page, pageSize, hasMore}` | ✅ | OK |
| `GET /api/admin/reports` | 列表 | ✅ + `revealedAuthor` 匿名揭示 | OK（增强） |
| `GET /api/auth/wx-login` | 文档说 B 缺失 | 已实现，OK | OK（增量） |
| `POST /api/feedback` | 文档说 B 缺失 | 已实现，OK | OK（增量） |
| `GET /api/users/me/likes` | 文档说 B 缺失 | 已实现，OK | OK（增量） |
| `POST /api/users/:id/follow` | 文档说 B 缺失 | 已实现，OK | OK（增量） |
| `GET /api/conversations` | 文档说 B 缺失 | 已实现，但**形状与 docs §6 #19 不同**：返回 `{id, peer, lastMessage, lastAt, unread}` 对象数组，文档要 `[{id,...,last_time,unread_count}]`（snake_case） | ⚠️ **文档需更新** |
| `GET /api/posts` | 文档说 B 无 `feed='follow'`、无 `campus` | 代码确认：sort 仅 `hot/new/price_asc/price_desc`，无 `feed` 参数；`campus` 不在 users 列 | ✅ 与文档一致 |
| `POST /api/auth/wx-login` 响应 | 文档未覆盖 | 实际响应 `{token, user: toCamel(user)}`，**user 含 password 字段**（见 L7） | ⚠️ 需修复 |
| `POST /api/posts/:id/complete` | 文档未列 | trades.ts:28 已实现 | OK |
| `POST /api/posts/:id/rate` | 文档未列 | trades.ts:76 已实现 | OK |

**结论**: 文档 vs 代码差异集中在 conversations（snake_case vs camelCase）和 wx-login（password 泄露）。前者**应更新 docs**；后者**应修复代码**。

---

## 📎 相关文件路径速查

| 类别 | 文件 |
|---|---|
| 入口 | `E:\校园墙\api\app.ts`, `E:\校园墙\api\server.ts`, `E:\校园墙\api\db.ts`, `E:\校园墙\api\observability.ts` |
| 中间件 | `E:\校园墙\api\middleware\auth.ts`, `E:\校园墙\api\middleware\rateLimit.ts` |
| 路由 | `E:\校园墙\api\routes\*.ts` (19 个) |
| 工具 | `E:\校园墙\api\utils\jwt.ts`, `E:\校园墙\api\utils\response.ts`, `E:\校园墙\api\utils\sensitive.ts`, `E:\校园墙\api\utils\cache.ts`, `E:\校园墙\api\utils\notification.ts`, `E:\校园墙\api\utils\match.ts`, `E:\校园墙\api\utils\extra-fields.ts`, `E:\校园墙\api\utils\direction-filter.ts`, `E:\校园墙\api\utils\push.ts`, `E:\校园墙\api\utils\wx-push.ts`, `E:\校园墙\api\utils\auth-helpers.ts`, `E:\校园墙\api\utils\ai.ts` |
| WebSocket | `E:\校园墙\api\ws\server.ts`, `E:\校园墙\api\ws\hub.ts`, `E:\校园墙\api\ws\protocol.ts`, `E:\校园墙\api\ws\auth.ts`, `E:\校园墙\api\ws\handlers\dispatcher.ts`, `E:\校园墙\api\ws\handlers\message.ts` |
| 定时任务 | `E:\校园墙\api\jobs\backup.ts`, `E:\校园墙\api\jobs\dailyDigest.ts` |
| 脚本 | `E:\校园墙\api\seed-demo.ts`, `E:\校园墙\api\scripts\decrypt-backup.mjs`, `E:\校园墙\api\scripts\migrate.ts` |
| 文档对照 | `E:\校园墙\docs\API-MAPPING.md`, `E:\校园墙\docs\ARCHITECTURE.md` |