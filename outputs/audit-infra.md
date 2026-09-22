# 校园墙 Campus Wall — 基础设施 / 部署 / 可观测性 / DevEx 审计

> 审计日期：2026-09-03
> 审计角色：DevOps + 安全运维 + 项目维护者
> 仓库：E:\校园墙
> 范围：CI/CD、构建产物、可观测性、安全合规、可维护性、性能预算

## 总体评估

校园墙工程化基线较好：CI 三段式（lint/typecheck/test + build）、E2E + LHCI、PM2 + Vercel 双形态部署、Sentry 预埋、健康检查三路探测、加密备份、JWT 生产强校验、敏感词分级审核、受控上传、限流等已就位。距"可上生产"差距集中在 **TS 严格度 / CSP / 限流 IP 取值 / 慢路径与指标 / CI 缓存与并发 / 日志脱敏 / 文档与实现一致性** 等。下文按严重度排列。

---

## 🔴 Critical（必须修，否则上生产就有事故风险）

### C-1 健康检查 `/api/health` 在 storage/db 异常时仍返回 HTTP 200
- 文件：`E:\校园墙\api\app.ts:144-182`
- 问题：探测失败时 `status` 置 `'degraded'` 但 HTTP 状态仍是 200（`res.status(200)`）。负载均衡/Uptime 监控按 HTTP 状态判断存活，会把数据库失联当成"正常节点"继续打流量，引发雪崩。
- 修复：探测失败时返回 503（Service Unavailable），保留 body 细节供排障：`res.status(degraded ? 503 : 200).json(...)`。考虑对 db 失败单独 503、storage 失败 200（DB 失联才是真正不可用）。

### C-2 限流 IP 取值无 `trust proxy`，nginx/CDN 部署后所有用户共享同一个桶
- 文件：`E:\校园墙\api\middleware\rateLimit.ts:12-14, 64-69`
- 问题：`req.ip` 在 Express 默认 `trust proxy=false` 下恒等于 `req.socket.remoteAddress`，反向代理后所有请求都是同一个 IP，整个 IP 维度限流形同虚设；学号/UA 维度仍有效，但恶意脚本可任意换 UA 绕过。
- 修复：
  - 在 `api/app.ts` 最前面按部署形态加 `app.set('trust proxy', process.env.TRUST_PROXY ?? 1)`（数字或 `'loopback'`）；如使用 Vercel/Nginx 都需明确写明。
  - `.env.example` 增加 `TRUST_PROXY` 注释。
  - 增加生产环境未配置 `TRUST_PROXY` 时的告警日志（公网部署且未设则记录 warning）。

### C-3 未捕获异常 / Promise 拒绝无兜底，进程可能在定时任务中崩溃
- 文件：`E:\校园墙\api\server.ts:38-85`
- 问题：`setInterval(runDailyDigest...)` 的 `try/catch` 只盖住 `runDailyDigest()` 自身，但同进程内的未捕获异步错误（路由 handler、未 awaited 微任务、JSON 解析错外的其他 Express 异常路径）会触发 `uncaughtException` / `unhandledRejection` 直接杀进程。`process.on('SIGTERM'/'SIGINT')` 也未调用 `runBackup()` 等待收尾。
- 修复：
  - `server.ts` 顶部加 `process.on('uncaughtException', err => { console.error(...); captureError(err); })` 和 `process.on('unhandledRejection', ...)`，并显式让 Sentry flush（`Sentry.flush(2000)`）。
  - SIGTERM 优雅关停时同步触发最后一次 `runBackup()`（失败也不阻断退出）。

### C-4 备份密文落地但密钥仅靠 `BACKUP_ENCRYPTION_KEY` 一个环境变量，运维误删/未配置 = 历史备份永远解不开
- 文件：`E:\校园墙\api\jobs\backup.ts:29-37, 55-73`
- 问题：一旦运维忘记把 `.env` 里的 `BACKUP_ENCRYPTION_KEY` 持久化（重启容器、迁移、换机），所有 `.db.enc` 永久无法恢复，且 `decrypt-backup.mjs` 也没有 key 校验外的任何提示（无 key 元数据）。
- 修复：
  - 加密头部追加 4 字节 `keyFingerprint`（如 SHA-256(key) 前 4 字节），`decrypt-backup.mjs` 校验失败时报"key 与文件不匹配"，并打印目标指纹的前 4 字节供排查。
  - `BACKUP_ENCRYPTION_KEY` 缺失但 `BACKUP_KEY_FINGERPRINT` 已记录（只读校验）→ 不写入但启动期 warning。
  - 文档明确：密钥需随部署备份副本同步存到密钥管理/Vault，并周期演练解密。

### C-5 Vercel 部署形态下 SQLite + 本地文件存储不可用，README/ARCHITECTURE 含糊带过
- 文件：`E:\校园墙\vercel.json:1-25`、`docs\ARCHITECTURE.md:201-207`、`README.md:213-215`
- 问题：`/api/index.ts` 把整个 Express 应用塞进 30s Serverless 函数，但 better-sqlite3 写入本地文件 + 备份 + 上传到 `public/uploads/` 在 Vercel 只读 FS 下每次冷启都会丢失；现在的 README "仅适合演示" 警告不够强，`vercel.json` 也没禁用危险能力。
- 修复（任选一）：
  - **禁用 Vercel 形态**：删 `api/index.ts`，`vercel.json` 不再把 `/api/*` 重写到函数，`docs` 删 Vercel 章节，避免误部署上线丢数据。
  - 或：**真接 Serverless DB**：把 SQLite 替换为 Turso/libSQL 或 Neon Postgres（已装 `pg`），上传改 S3（`STORAGE_DRIVER=s3` 已预埋），并把 `BACKUP_*` 任务禁用或改为远程快照。
  - 当前建议至少：`.env.example` 顶部加醒目注释"**生产请勿部署到 Vercel Serverless**"。

---

## 🟠 Major（重要缺陷，建议两周内修）

### M-1 CORS 默认 `cors()` 全放开，与"校园"内网定位不符
- 文件：`E:\校园墙\api\app.ts:61`
- 问题：`app.use(cors())` 等同 `Access-Control-Allow-Origin: *` + 任何方法头都放行。配合"Authorization: Bearer"模式，CSRF/跨源凭据窃取风险。
- 修复：维护 `ALLOWED_ORIGINS` 环境变量（CSV），`cors({ origin, credentials: false, methods: ['GET','POST','PUT','PATCH','DELETE'] })`；`.env.example` 注释默认值 `http://localhost:5173` + 生产域名。

### M-2 无 CSP / HSTS，且 Vite 代理与 nginx 反代配置文档缺失
- 文件：`E:\校园墙\api\app.ts:51-59`、`README.md:200-205`
- 问题：响应头只设了 nosniff / X-Frame-Options / Referrer-Policy / X-XSS-Protection（旧）/ Permissions-Policy，**没有 Content-Security-Policy**；Vue SPA 注入了 `<script type="module" src="/src/main.ts">`，没有 nonce/hash 策略会被 XSS 放大。
- 修复：
  - 在 `app.use(securityHeaders)` 中追加：
    ```
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'")
    ```
    （上线时按真实域名调整，允许 swagger CDN）。
  - 后端 `app.get('/api/docs')` 当前发的是 `swaggerHtml()`，确认其引用的 CDN 在 CSP 白名单里，否则可能渲不出。
  - 增加 `Strict-Transport-Security: max-age=63072000; includeSubDomains`（仅在 HTTPS 时）。
- README 提供完整 nginx 反代模板（带 `proxy_set_header X-Forwarded-For` 配合 `trust proxy`，CSP 不双重下发）。

### M-3 CI 三段串行 jobs 各自重新 `npm ci` + 装 Playwright + 构建，预算紧、单点慢
- 文件：`E:\校园墙\.github\workflows\ci.yml:1-75`
- 问题：3 个 job 独立 `actions/checkout` + `npm ci` + 各自 cache；e2e 还要装 chromium（~150MB）。无 artifact 上传（Playwright 失败只能重跑），无失败 trace，无 LHCI 报告归档。
- 修复（按 ROI）：
  - 拆 `actions/setup-node` 用 `cache: 'npm'` 加 `cache-dependency-path: package-lock.json`（已有），确认启用 lockfile v3 命中。
  - 加 `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`，避免 PR 重提时旧 run 排队。
  - 给 `e2e` job 装 `upload-artifact@v4`：`if: failure()` 上传 `test-results/` 和 `playwright-report/`。
  - 给 `lighthouse` 同样上传 `dist/.lighthouseci/` 报告；可顺带把 assertion 收紧（见 M-7）。
  - 考虑用 `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` 让 `e2e`/`lighthouse` 只在主干跑（PR 触发 `lint/build/test` 快车道）。

### M-4 日志为非结构化 `console.log`，PII（学号、手机号、token）散落在 stdout
- 文件：`E:\校园墙\api\app.ts:83-88`、`api\app.ts:211`、`api\jobs\backup.ts:65, 71, 91`、`api\server.ts:18-101`
- 问题：
  - 请求日志只记 `method + path`，**没有 status / latency / reqId / ip / userId**——排障基本靠猜。
  - 错误中间件把完整 `error.stack` 直接打到 stdout，且生产环境 `console.log` 同步阻塞会拖慢请求。
  - `req.path` 在敏感场景含 ID；异常堆栈可能含 SQL/路径/用户输入。
  - 没有 redaction：学号（users.student_id）、手机号、Token 都有可能进入 stack。
- 修复：
  - 引入零依赖 `pino` 或自写 mini logger：JSON 一行，含 `ts, level, reqId, method, path, status, latencyMs, userId, ip`。
  - 中间件：给每个请求 `req.id = crypto.randomUUID()`，响应头 `X-Request-Id` 回传便于对账。
  - 增加 redaction 列表：`['password', 'token', 'authorization', 'studentId', 'student_id', 'phone', 'idCard']`。
  - 生产改 stderr 异步落盘，配合 logrotate（`/var/log/campus-wall/*.log`）。
  - 在 `api/observability.ts` 把 console 也送进 Sentry breadcrumbs（可选）。

### M-5 LHCI 性能预算"非阻塞"长期放任，性能回归不会被发现
- 文件：`E:\校园墙\.lighthouserc.json:1-17`、`api\jobs` 旁
- 问题：`continue-on-error: true` + 没有 LCP/CLS/TBT 阈值，只有 `categories:performance≥0.6`、`script:size≤900KB`。注释也承认"先观察基线再收紧/移除 continue-on-error"——但现在还没有观察到具体基线。
- 修复：
  - 跑一次拿到数字后补：
    ```
    "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
    "cumulative-layout-shift":   ["error", { "maxNumericValue": 0.1 }],
    "total-blocking-time":       ["warn",  { "maxNumericValue": 200 }],
    "first-contentful-paint":    ["warn",  { "maxNumericValue": 1800 }],
    "color-contrast":            ["error", { "minScore": 0.9 }]
    ```
  - 首次跑出真实数字后**取消** `continue-on-error: true`（先收紧阈值、跑 1-2 周看波动，再决定）。
  - LHCI 跑 3 次（`numberOfRuns: 3`）耗时较长，可改 1 次或拆到定时任务（cron）每天跑一次 baseline。

### M-6 限流内存桶 + 限流键缺失 auth 后用户维度，多实例部署失效
- 文件：`E:\校园墙\api\middleware\rateLimit.ts:10-46, 73-98`
- 问题：`buckets = new Map()` 是进程内；多进程（PM2 cluster）/多实例部署时每个进程独立计数，N 倍放行；进程重启清零。
- 修复（短期/中期）：
  - 短期：保持现状但加 `process.env.NODE_ENV==='production'` 启动日志，提醒"单实例建议 < N"。
  - 中期：把限流抽到 Redis（`ioredis`/`redis`）用 Lua 做滑动窗口；可只把 `authRateLimit` 与 `postLimiter` 上 Redis（这两个最关键）。
  - 至少增加单元测试覆盖"窗口边界、清理过期桶、key 计算含 studentId/UA"（见 `rate-limit.test.ts`，补 coverage gap）。

### M-7 缓存 LRU 200 / TTL 60s 但无 metrics、无命中率埋点
- 文件：`E:\校园墙\api\utils\cache.ts:10-49`、`api\routes\posts.ts:196,200`
- 问题：只有 `X-Cache: HIT/MISS` 响应头，没有任何指标聚合。运营无法判断 200/60s 是否够用；缓存被穿透/雪崩没有信号。
- 修复：
  - `cache.ts` 内部维护 `hits / misses / evictions / size`，暴露 `cacheStats()` 函数。
  - `/api/health.data.cache` 增加 `{ size, max, hits, misses, hitRate, evictions }`（保留后向兼容）。
  - 顺便修一个小问题：`cacheSet` 内的 `if (store.has(key)) store.delete(key); store.set(key,...)` 是无意义的删除-重置（之后 LRU touch 由 `cacheGet` 完成），不影响功能但浪费一次 Map 操作。
  - 容量是否够：建议挂个环境变量 `CACHE_MAX_SIZE=2000 CACHE_TTL_MS=60000` 默认保留，按实际命中率调（先 200 跑一周看 evict 频率）。

### M-8 OpenAPI 仅覆盖 auth/posts/conversations/drafts 四域，与"zod 为唯一契约源"声称不符
- 文件：`E:\校园墙\api\openapi\document.ts:10-15`
- 问题：README 与 ARCHITECTURE 都强调 zod 单源；实际只剩 4 域，admin/users/comments/upload/announcements/ai 等高频域缺失，前端 / 联调只能继续读代码。
- 修复：
  - 把 `schemas.ts` 拆到各路由文件（`routes/*/schemas.ts`），由 `document.ts` 自动收集。
  - 在 CI 加一个浅校验："所有 `routes/*.ts` 文件中 `Router.{get,post,put,patch,delete}` 调用必须有 schema 注解"（用 ESLint rule 或 scripts/openapi-coverage.mjs）。
  - docs/API-MAPPING.md 中明确标"已契约化 / 未契约化"两组，列出待补。

### M-9 定时备份 & 每日摘要未跟踪运行状态，失败静默
- 文件：`E:\校园墙\api\server.ts:73-85`、`api\jobs\backup.ts:55-96`、`api\jobs\dailyDigest.ts:14-65`
- 问题：`setInterval(...).catch(err => console.error(...))`——如果连续失败 7 天，运维看不到任何告警。`runBackup()` 失败但加密配置错误（`BACKUP_ENCRYPTION_KEY` 非法 hex）会让每次备份**明文**落地而不报警。
- 修复：
  - 增加 `lastBackupAt / lastDigestAt / lastBackupError` 字段写入内存并挂到 `/api/health`。
  - 加密 key 格式校验失败时**硬退出**（而不是允许明文落地），或至少把"未加密备份"写入 `Sentry.captureMessage('warn')`。
  - `runBackup()` 失败累计 3 次自动 `captureError`。

---

## 🟡 Minor（应修，多为可观测性 / DX / 长期一致性）

### m-1 TS 严格度全开 + 仍写 `any`
- 文件：`E:\校园墙\tsconfig.json:1-26`、`api\app.ts:147`（`(JSON.parse(...) as any).version`）、`api\app.ts:161`（`(storage as any).root`）
- 问题：`strict: false`、`noUnusedLocals: false`、`noUnusedParameters: false`、`noFallthroughCasesInSwitch: false`，且 `noUncheckedIndexedAccess` 未开；ESLint 关了 `no-explicit-any`。
- 修复（渐进）：
  - 第 1 阶段：保留 `strict:false`，但开 `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true`。
  - 第 2 阶段：把 `strict: true` 仅对 `api/**/*.ts`（写 `tsconfig.api.json`），前端维持宽松。
  - `as any` 替换：`JSON.parse(...) as { version?: string }`；`storage.root` 在 `storage/types.ts` 加 `root?: string`。

### m-2 `engines.node: ">=18.0.0"` 但 CI 与依赖都按 Node 20 跑，存在版本漂移
- 文件：`E:\校园墙\package.json:25-27`、`api\jobs\backup.ts`（依赖 Node ≥18 crypto）
- 问题：CI 固定 `node-version: 20`，本地文档/README 也写 `>= 18`，better-sqlite3 13 的预编译产物对 Node 18/20/22 ABI 不同，Node 18 装机偶有 native rebuild；生产事故回滚时版本不一致易复现。
- 修复：`engines.node: ">=20.0.0"`，CI 加 `.nvmrc`（`20`）让 `setup-node` 引用；本地安装脚本检查 Node 版本不达标时 fail-fast。

### m-3 Vue SPA 全静态导入，没有路由级懒加载（除 403）
- 文件：`docs\ARCHITECTURE.md:109-112`
- 问题：构建产物全量打在一起（vendor 58KB / index 44KB / CSS 33KB 都是 gzip 后），首屏其实只需 `Login`+`Home`；其余 16 页+9 管理页白付下载成本。
- 修复：除 403 外逐步切 `() => import('./pages/...vue')`；管理端按角色拆 `admin` 子 chunk；估算首屏 LCP 能从 ~1.8s 降到 ~1.2s。

### m-4 sourcemap `hidden` 但还在产物目录中带 `*.map`
- 文件：`E:\校园墙\vite.config.ts:9`、`dist/assets/*.js.map`（已生成）
- 问题：`sourcemap: 'hidden'` 不在 JS 末尾追加 `//# sourceMappingURL`，**但 `.map` 文件仍会落到 dist/**。如果部署到公网 + CDN 不限制目录浏览，则 Sentry 上传映射前可能被打出。
- 修复：要么 `sourcemap: false`（仅 Sentry 上传映射）或构建后 `rm dist/**/*.map`；要么在 nginx 层 deny `*.map`。

### m-5 `.env` 文件被错误提交仓库
- 文件：`E:\校园墙\.env:1-9`（存于仓库根，且 `.gitignore:17` 写 `.env`，但 `git ls-files` 仍可见）
- 问题：`.env` 已含 `JWT_SECRET=campus-wall-dev-secret-key-2026`、`OPENROUTER_API_KEY=`（空）——若曾被真实 key 覆盖，密钥外泄。
- 修复：
  - `git rm --cached .env` 并提交；额外加 `**/.env` 进 `.gitignore`。
  - 检查 git log 是否曾含真实 key；如有过，**立刻轮换**并用 `git filter-repo` 清历史。

### m-6 Vite dev 代理 `strictPort: true` 与 E2E 期望端口 5173 强绑定，跨机器不可移植
- 文件：`E:\校园墙\vite.config.ts:36-56`、`E:\校园墙\playwright.config.ts:22-39`
- 问题：本地端口冲突时直接崩溃，CI 也固定 5173。`playwright.config.ts` 写的 `url: 'http://localhost:5173'` 是硬编码。
- 修复：`strictPort: false` + 端口漂移记录到 stdout；`playwright.config.ts` 把 baseURL/启动端口改成 `process.env.E2E_PORT ?? 5173`。

### m-7 PWA Service Worker 缓存策略未审计（`sw.js` 现网版本与构建产物可能不同步）
- 文件：`E:\校园墙\dist/sw.js`、`E:\校园墙\public/manifest.webmanifest`
- 问题：当前 `sw.js` 是手写还是构建产物未在源码 README 说明；离线情况下 stale 资产会导致"前端打不开但后端 OK"。
- 修复：
  - 引入 `vite-plugin-pwa` 并把 sw 纳入构建；或在文档里明确"sw.js 为手写，更新需手动跑 `node scripts/generate-pwa-icons.mjs`"并附示例图。
  - 加 `Cache-Control: no-cache` 在 `sw.js` 上避免缓存自身。

### m-8 演示账号文档与种子脚本需对齐
- 文件：`E:\校园墙\README.md:148-155`、`api\seed-demo.ts`（顶层）、`docs\ARCHITECTURE.md:198`
- 问题：README 列 `23770001-23770005 / demo1234`、`admin / admin123`；如果 seed 改了默认密码未同步文档，运维会卡住。
- 修复：把演示账号写入 `api/seed-demo.ts` 顶部常量，并在 README 用 `<!-- seed:accounts -->` 自动替换（避免文档漂移）。

### m-9 `audit_logs` 表已建但应用层只写 `admin_logs`，命名分裂
- 文件：`E:\校园墙\api\db\migrations\0001_initial.ts:229-240`、`api\routes\admin.ts:106,114,131,150`
- 问题：建了 `audit_logs` 表，代码里写 `INSERT INTO admin_logs`。两套口径。
- 修复：统一为 `admin_logs` 或 `audit_logs`（建议 `admin_logs`，更直观）；迁移脚本加 `RENAME TABLE` 或新建 v2 migration。

### m-10 缓存写路径前缀失效是字符串前缀匹配，可能误杀
- 文件：`E:\校园墙\api\utils\cache.ts:40-49`、`api\routes\posts.ts`（17 处 `cacheInvalidate('posts')`）
- 问题：当前所有键用 `'posts:'` 前缀，没冲突；但若将来加 `'posts:hot'` 和 `'posts:hot:top'` 互相干扰，无 namespacing 隔离。
- 修复：用 `cacheInvalidate(namespace)` 接受完整正则或树状命名（如 `cacheInvalidate(['posts:list','posts:detail'])`）。

### m-11 没有 `.dockerignore` / 没有 Dockerfile
- 文件：仓库根
- 问题：`README.md` 鼓励 `pm2 start "npm run start"`，但容器化部署是校园服务器更常见的形态；缺 Dockerfile 时运维容易把 `node_modules`、`.git`、`.env` 都打进去。
- 修复：补 `Dockerfile`（多阶段：build → runtime 用 node:20-slim 跑 `tsx`）+ `.dockerignore`（`node_modules, .git, .env, dist, api/data.db*, api/backups/, public/uploads/, test-results, playwright-report`）；镜像加非 root user。

### m-12 `seed-demo.ts` 与 OpenAPI `decrypt-backup.mjs` 没有 `chmod +x`/`type: module` 兼容性
- 文件：`E:\校园墙\scripts\*.mjs`
- 问题：项目 `"type": "module"`，脚本后缀 `.mjs` 双保险没问题；但 `playwright.config.ts` 用 `process.cwd()` 而 ESM 配置无 `import.meta.url` 兜底（已在注释中说明），可改 `__dirname` 模式。
- 修复：保持现状但补一个 `scripts/check-env.mjs`：启动时校验 `node -v >= 20`、`npm -v >= 9`、磁盘剩余空间、SQLite 写权限。

### m-13 README 与 ARCHITECTURE 关于 `拼车/组队` 描述一致，但脚本 `seed` 未声明
- 文件：`E:\校园墙\README.md:5`、`docs\ARCHITECTURE.md:259-266`
- 问题：README 顶部声称"八板块"，ARCHITECTURE §2 列 8 个；如 seed 改回 6 个后两边都要同步。
- 修复：把"板块数"抽成常量并在 README 表格中引用 `${sectionCount}`（脚本生成）；并在 ARCHITECTURE 中加"修改板块请同步 seed + README + ARCHITECTURE"约定。

---

## 🟢 Good（亮点与正向实践）

- **三段式 CI**（lint / typecheck / unit / build + e2e + lhci）覆盖度合理，节点 20 + npm cache 已配。
- **Sentry 预埋**（`@sentry/node` + `@sentry/vue`）：DSN 缺失完全 no-op（`api/observability.ts`），启用成本低。
- **JWT 生产强制密钥**：`utils/jwt.ts` 在 NODE_ENV=production 时无 `JWT_SECRET` 直接 throw，开发有一次性警告。
- **敏感词三档分级**（pass / warn / review）：词边界 ASCII 用 `\b`，前后端同源（README 明确说明）。
- **上传三重校验**（扩展名 / MIME / magic number）+ 服务端生成文件名 + 缩略图 sharp 管线，路径白名单防止遍历。
- **备份加密 AES-256-GCM** + CWBK1 头（IV + authTag + 密文），含独立解密工具；CLI 用法在 .env.example。
- **健康检查三路探测**（db / storage / ws）+ uptime + version + 5xx 计数。
- **WS hello 鉴权** + 10s 超时断开 + ping/pong 心跳 + REST 兜底（架构文档一致）。
- **限流五维**（IP+学号+UA 滑动窗口）覆盖 post / comment / upload / ai + auth 失败锁定；preset 阈值有注释解释"正常用户到不了、脚本必然触发"。
- **API 文档零额外依赖**（zod v4 内置 toJSONSchema + CDN Swagger UI）。
- **E2E 隔离库自动重建**（`scripts/e2e-backend.mjs` 删 `e2e-test.db*` + seed + spawn）+ retry=1 在 CI；HTML 报告 + trace 在失败时保留。
- **Vercel 配置简洁**：仅 1 个函数 + 3 条 rewrite，SPA fallback 用 Express 5 兼容正则。
- **演示账号分层**（admin + 5 个用户覆盖信誉分档位），README 表格化。

---

## Quick wins（1-2 天内可改完）

1. **`/api/health` degraded → 503**（C-1，10 行）
2. **`app.set('trust proxy', ...)`** + `.env.example` 增加 `TRUST_PROXY`（C-2，3 行）
3. **`process.on('uncaughtException'/'unhandledRejection')`** 兜底（C-3，15 行）
4. **`req.id = randomUUID()`** + 响应头回传 + 结构化日志最小版（M-4 雏形）
5. **CORS 白名单**（M-1，从 `cors()` 改为 `cors({ origin: ALLOWED.split(',') })`）
6. **CSP 基础头**（M-2，复制现成的模板到 `securityHeaders` 中间件）
7. **`/api/health` 增加 `lastBackupAt / lastBackupError / cacheStats()`**（M-7 + M-9）
8. **`.env` 移出 git 跟踪**（m-5，`git rm --cached .env` + 文档提示）
9. **`tsconfig` 开 `noUncheckedIndexedAccess: true`**（m-1，单字段）
10. **CI 加 `concurrency` + artifact 上传**（M-3，5 行）

---

## Top 5 priorities（上生产前必须解决）

1. **C-1** `/api/health` degraded 时改返回 HTTP 503 —— 否则 L7 探针误判节点健康。
2. **C-2** 反向代理部署形态 + `trust proxy` —— 否则限流形同虚设，影响账号/刷帖安全。
3. **C-3** 未捕获异常 + 优雅关停 —— 校园活动峰值 / 部署切换时最易撞上。
4. **M-1 + M-2** CORS 白名单 + CSP 头 —— 公网部署前的最小可接受基线。
5. **C-5** Vercel 形态决策（删除或真正接 Turso/Postgres + S3）—— 当前 README 一句警告拦不住运维误点部署。

---

## 附：审计中提到的关键文件清单

| 主题 | 关键文件 |
|---|---|
| CI/CD | `E:\校园墙\.github\workflows\ci.yml`、`E:\校园墙\.lighthouserc.json` |
| 构建 | `E:\校园墙\vite.config.ts`、`E:\校园墙\tsconfig.json`、`E:\校园墙\eslint.config.js`、`E:\校园墙\playwright.config.ts`、`E:\校园墙\vitest.config.mjs` |
| 部署 | `E:\校园墙\vercel.json`、`E:\校园墙\ecosystem.config.cjs`、`E:\校园墙\nodemon.json`、`E:\校园墙\package.json` |
| 可观测性 | `E:\校园墙\api\observability.ts`、`E:\校园墙\api\app.ts:144-182` |
| 安全 | `E:\校园墙\api\utils\jwt.ts`、`E:\校园墙\api\utils\sensitive.ts`、`E:\校园墙\api\app.ts:51-78`、`E:\校园墙\api\jobs\backup.ts`、`E:\校园墙\api\middleware\rateLimit.ts`、`E:\校园墙\api\routes\upload.ts` |
| 性能预算 | `E:\校园墙\api\utils\cache.ts`、`E:\校园墙\api\ws\hub.ts`、`E:\校园墙\api\openapi\document.ts` |
| 文档 | `E:\校园墙\docs\ARCHITECTURE.md`、`E:\校园墙\docs\API-MAPPING.md`、`E:\校园墙\README.md` |
| 脚本 | `E:\校园墙\scripts\e2e-backend.mjs`、`E:\校园墙\scripts\ensure-vitest-shim.mjs`、`E:\校园墙\scripts\generate-pwa-icons.mjs`、`E:\校园墙\api\scripts\decrypt-backup.mjs` |
| 环境 | `E:\校园墙\.env.example`、`E:\校园墙\.env`、`E:\校园墙\.gitignore` |