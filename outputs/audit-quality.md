# 校园墙 工程质量审计（跨端一致性与工程卫生）

- 审计日期：2026-02（只读审计，未改动任何项目文件）
- 范围：`api/`（Express + better-sqlite3）、`src/`（Vue3 Web）、`miniprogram/`（微信小程序）
- 方法：全量端点枚举 × 双端调用点比对、字段命名扫描、缓存/构建产物/进程管理实证检查

---

## 一、双端功能矩阵（后端端点 × web × 小程序）

图例：✅ 已接入 | ❌ 未接入 | ⚠️ 定义了封装但无页面调用 | 🔀 经 api.js 旧路径映射层间接接入

| 后端端点 | web | 小程序 | 备注 |
|---|---|---|---|
| POST /auth/wx-login | ❌（Web 无微信场景） | ✅ | 501 静默回退表单登录 |
| POST /auth/login · /register | ✅ | ✅ | |
| GET /auth/me | ✅ | 🔀 `/user/info` 映射 | |
| PUT /auth/password | ✅ SettingsPage | **❌** | 小程序无法改密码 |
| POST /auth/logout | ✅ | ✅ | |
| GET /posts（列表+筛选+排序） | ✅ | ✅（7 个分类页） | direction/subType/priceRange 全链路见 §三 |
| GET /posts/:id · /:id/matches | ✅ | ✅ detail.js:46,78 | |
| POST/PUT/DELETE /posts | ✅ | ✅ publish.js:344-347 | |
| like / favorite / report | ✅ | ✅ | |
| 评论 list/publish/reply/like | ✅ | ✅（reply 走 replyToId 映射） | |
| DELETE /comments/:id | ✅ PostDetailPage:232 | **❌** | 小程序不能删评论 |
| POST /comments/:id/report | **❌** | **❌** | web commentApi 无 report 方法；小程序只能举报帖子 → 双端死端点 |
| GET /users/:id 公开主页 | ⚠️ userApi.info 定义未调用 | ❌ | 两端都没有"他人主页"页 → 死能力 |
| PUT /users/profile | ✅ | ✅ profile.js | 小程序传 campus 字段被 adaptPayload 白名单丢弃 |
| me/posts · me/favorites · me/likes | ✅ | ✅ | |
| GET /users/me/comments | ✅ MyCommentsPage | **❌** | 小程序无"我的评论"页 |
| messages 列表/read/read-all | ✅ | 🔀 `/notifications` 映射 | |
| PATCH /messages/:id/read | ❌ | ❌ | 与 PUT read/:id 语义重复 → API 冗余死端点 |
| sections / search/hot / search | ✅ | 🔀 `/search/hot-topics` 映射 | |
| POST /upload | ✅ | ✅ uploadFile | |
| drafts GET/POST/DELETE×2 | ✅ PublishPage:83 + DraftsPage | **❌** | 小程序只用本地单槽 `wx.setStorageSync('publishDraft')`（publish.js:57），换设备即丢草稿 |
| announcements active + ack | ✅ AnnouncementDialog:19,30 | **❌** | 小程序完全没有公告体系 |
| announcements 管理 CRUD | ✅ AnnouncementsPage | ❌ | |
| ai/chat + ai/chat/stream | ✅ 流式+非流回退 AiAssistant.vue:145,195 | **❌** | AI 助手仅 Web 形态；小程序零 AI 入口 |
| adminAi knowledge/settings/stats | ✅ AdminAiPage | ❌ | |
| admin/users ban | ✅ UsersPage | ✅ moderation.js:428 | |
| admin reset-password · credit | ✅ | ❌ | 小程序审核台缺这两个用户治理动作 |
| admin/posts audit · top | ✅ | ⚠️ audit ✅(203,228)；**top ❌** | 小程序不能置顶 |
| admin/comments 列表+删除 | ✅ CommentsPage | ❌ | |
| admin/sections CRUD | ✅ SectionsPage | ❌ | |
| subscriptions toggle/list | ✅ SectionPage:146,161 | ✅ subscribe-btn.js:31,48 | |
| trades complete · rate | ⚠️ tradeApi 定义未调用 | ❌ | **两端都没接**：交易完成/互评流程不存在，但 mine.js:81 与 ProfilePage:36 都在读 trade-ratings → 只读不写的半成品闭环 |
| GET /users/:id/trade-ratings | ✅ | ✅ mine.js:81 | |
| feedback 提交 | ✅ FeedbackDialog | ✅ feedback 页 | |
| conversations 全套 | ✅ ChatPanel/MessagePage | ✅ message/chat | |
| follows follow-toggle | ✅ PostDetailPage:81 | **⚠️ followToggle 已封装但零调用** | 小程序能看关注列表却没有任何"关注"按钮 → 只读残废 |
| follows status/following/followers | ✅ | ✅ detail.js:69, follows.js:59 | |

**矩阵结论**：后端能力利用率约 85%。真正"两端皆死"的端点：`POST /comments/:id/report`、`PATCH /messages/:id/read`、`GET /users/:id`、`POST /trades/:postId/(complete|rate)`。真正"单端缺失"影响体验的：小程序缺公告、草稿云同步、AI 助手、改密码、删评论、我的评论、关注按钮。

---

## 二、严重度排序问题清单

### P0-1｜整个 miniprogram/ 与大量核心代码从未提交 git —— 单盘故障即全丢
- **证据**：`git status --short` 显示 `?? miniprogram/`（整个目录）、`?? api/routes/{ai,adminAi,conversations,feedback,follows,trades,subscriptions}.ts`、`?? api/utils/cache.ts`、`?? api/jobs/`、`?? docs/`、以及 `src/pages/admin/` 下 9 个页面与 `AiAssistant.vue` 等 4 个组件全部 untracked。
- **影响**：小程序端约 150 个文件 + 后端一半路由不在版本库中；配合"服务器进程无守护"的现状，误删目录或磁盘故障 = 直接失去整个端。
- **建议**：立即 `git add miniprogram/ api/ src/ docs/ && git commit`；此后以 `.gitignore` 精确排除而非靠"忘了加"。这是本次审计最高优先级动作，成本 5 分钟。

### P0-2｜备份目录 api/backups/ 仅靠 `*.db` 通配规则"碰巧"被忽略
- **证据**：`jobs/backup.ts:16` 备份写入 `api/backups/campus-wall-*.db`；`.gitignore:25` 的 `*.db` 恰好匹配所以当前未被追踪——但没有一行显式规则声明意图。一旦备份改扩展名（.sqlite/.db.bak）或新增 `-wal` 伴生文件命名变化，含 bcrypt 哈希的全量用户库就会被 `git add -A` 收进历史。
- **建议**：`.gitignore` 增加 `api/backups/` 一行（显式表达意图），顺带把 `tmp-test-*.jpg`、`.e2e-reveal.mjs`、`.npm-tmp-cache/` 等工作区杂物清理或 ignore。

### P1-3｜生产进程无守护，README 只有口头建议
- **证据**：`package.json:7` `"start": "cross-env NODE_ENV=production tsx api/server.ts"` 直跑前台进程；README.md:194-198 写着"建议配合 PM2"，但仓库无 pm2 依赖、无 ecosystem 配置、无对应 npm script。历史上已多次发生孤儿进程/端口占用事故（EADDRINUSE 时 tsx 直接退出，无自动拉起）。vite 侧已有 `strictPort: true` 防端口漂移 ✓，后端没有等价防护。
- **建议**：入库 `ecosystem.config.cjs`（max_restarts、autorestart、日志落盘）+ `"start:pm2": "pm2 start ecosystem.config.cjs"`；启动时对 EADDRINUSE 给出明确中文报错并提示清理命令。

### P1-4｜字段命名双轨制：users 走 snake_case、posts/comments 走 camelCase，兼容补丁已外溢到两端前端
- **证据**：
  - 后端：`auth.ts:86,92,95` 返回 `student_id/credit_score/created_at`；`users.ts:18-20` 同样 snake_case；而 `formatPost` 输出 `createdAt/likeCount/isLiked` 等 camelCase。
  - web：`stores/user.ts:9-18` User 接口直接吃 snake_case，`ProfilePage.vue:101,203` 用 `credit_score/student_id` —— 同一个前端工程里两套命名并存。
  - 小程序：`utils/api.js:270-277` normalizeUser 打了三个兼容补丁（`u.studentId ?? u.student_id` 等）。
- **建议**：在 `auth.ts`/`users.ts` 的响应序列化处统一转 camelCase（一处 formatter 即可），然后删除 web store 的 snake_case 字段与小程序 normalizeUser 补丁。改动面小（2 个路由文件 + 2 个前端消费点），收益是永久消除"新同学写错字段名"这类 bug。

### P1-5｜小程序 utils/api.js 600 行旧契约翻译层该收敛
- **证据**：`miniprogram/utils/api.js:138-249` 五层映射（resolvePath/rewriteMethod/adaptQuery/adaptPayload/adaptResponse）把页面里的 `/user/info`、`/notifications`、`/search/hot-topics`、`/admin/reports/:id/resolve`、`category→sectionId`、`extra↔extraFields` 等旧契约翻译成新后端路径。页面实际只剩 ~10 个旧路径入口。
- **影响**：每加一个接口要同时理解新旧两套形状；`adaptQuery` 里 priceRange 中文标签、"500以上"正则拆数字（199-208 行）这类暗坑无人敢动。
- **建议**：一次性把页面调用改成新路径/新字段（机械替换），删除映射层；保留 normalizePost 一个渲染别名函数即可。预计半天，之后小程序与 web 共享同一份心智模型。

### P2-6｜无路由级代码分割：11 个 admin 页面打进每个普通用户的首屏包
- **证据**：`src/router/index.ts:9-15` 全部静态 import（仅 ForbiddenPage 动态加载）；实测 `dist/assets/index-*.js = 274.8KB`（单包含全部前台+后台页面），vendor 150.6KB 独立 ✓。manualChunks 函数式分包本身有效（vue 系独立 vendor，业务迭代不动缓存 ✓），但它救不了"没拆的路由"。
- **建议**：admin 路由改 `component: () => import('@/pages/admin/xxx.vue')`，主包预计减 40%+；顺手把 PostDetailPage/PublishPage 也懒加载。成本 30 分钟。

### P2-7｜缓存失效未覆盖封禁/信用分操作：被封用户的帖子最长多活 60 秒
- **证据**：posts 列表缓存 TTL 60s（`cache.ts:11`），key 含全部查询参数（posts.ts:174-180），`WHERE ... u.status != 'banned'` 在被缓存的查询内（posts.ts:98）。admin audit/top/删评论/举报处理都正确 `cacheInvalidate('posts')`（admin.ts:185,193,217,221,273,347,354）→ **管理员审核完前台立即可见 ✓**；但 **ban 用户（admin.ts:67）与 credit 调整（admin.ts:106）不失效任何缓存** → 封禁后其帖子仍从列表缓存吐出最长 60s。鉴权层不受影响（authRequired 每次查库校验 banned，middleware/auth.ts:52，封禁即时生效于登录态）。
- **建议**：banUser/adjustCredit 成功后补一行 `cacheInvalidate('posts')`（与同文件其他写路径对齐）；或在 cache.ts 提供 `cacheInvalidateAll()` 兜底。

### P2-8｜web/api 零测试：3 个最高价值补测点（附成本）
- **现状**：`package.json` 无 test script、无测试依赖；`miniprogram/tests/frontend-static.test.js` 的 26 个 test 块全是源码正则静态断言（防回归模式，有价值但不验证行为）。后端业务逻辑纯靠人肉。
- **推荐用 node:test + tsx --test（零新依赖）+ 内存 sqlite**，按性价比排序：
  1. **extraFields 合并语义**（posts.ts:388-440）：白名单过滤 + "请求键覆盖、未传键保留"合并（430-434 行，注释里明说漏带 direction 会把帖子从筛选 tab 抹掉）+ riskFlag 重建（436-440 行）。把 sanitizeExtraFields/merge 抽到 `api/utils/` 即可纯函数单测，**成本 ≈ 半天**，防的是真实发生过数据丢失类 bug。
  2. **direction 过滤生效条件**（posts.ts:139-148）：仅当 sectionId>0 且目标板块命中 isLostFoundSection 才追加 JSON 过滤、否则静默忽略。需要 supertest 式集成测试打 `GET /api/posts?sectionId=X&direction=lost/found/非法值` 断言 SQL 行为，**成本 ≈ 1 天**（需搭内存库夹具，但夹具可复用于后续所有接口测试）。
  3. **auth 三档守卫**（middleware/auth.ts）：无 token/过期 token→401、banned 用户→403、section_admin 访问 superAdminRequired 端点→403、authOptional 带 banned token 静默降级为游客（75 行）。纯中间件逻辑 + 2 个探针端点（/auth/me、/admin/stats），**成本 ≈ 半天**。
  - 合计 ≈ 2 人日即可覆盖历史上最容易回归的三块逻辑。

### P2-9｜PostSkeleton 覆盖不均 + 头像图未懒加载
- **证据**：骨架屏只在 HomePage:233 / SearchPage:171 / SectionPage:254 使用；MyPostsPage、MyFavoritesPage、MyLikesPage、MyCommentsPage、DraftsPage 加载期间直接空白（无 skeleton 也无 loading 态）。图片懒加载：帖子图 ✓（PostCard.vue:81、PostDetailPage.vue:392 有 `loading="lazy"`），但列表内头像 `<img>`（PostCard.vue:55 等 10 处）无 lazy——首页一屏 20 卡 × 头像全量立即请求。
- **建议**：五个"我的"页复用 PostSkeleton（props 已支持 count，10 分钟/页）；PostCard 头像加 `loading="lazy"` 一行。

### P3-10｜AI 助手双通道维护负担（低危备忘）
- **证据**：`ai.ts` 同时维护 `/ai/chat`（JSON）与 `/ai/chat/stream`（SSE）；AiAssistant.vue:145-206 手写 SSE 解析 + 失败回退非流式。两条响应形状（reply/forums vs delta/done/forums 帧）需要同步演进，且 fetch 直连绕过了 request.ts 拦截器（token 过期时走不到统一 401 跳转）。
- **建议**：保持现状可接受；至少给 stream 的 401 场景补一次 `userStore.logout()` 处理。

### P3-11｜miniprogram/utils/cache.js 是整个模块级死代码
- **证据**：`setCache/getCache/removeCache/clearAllCache` 在 pages/components/utils 中零引用（grep 无命中）；30 分钟 storage 缓存从未启用。
- **建议**：删除，或真用起来给分类页做离线兜底——二选一，别留着误导。

### P3-12｜性能基线结论（非问题，记录在案）
- web 首页共 3 个请求：posts(pageSize=20, 上限 50 硬顶 posts.ts:86) + sections + announcements/active，无限滚动分页 ✓ 健康；
- 小程序首页 pageSize=10 上拉加载 ✓；列表点赞/收藏批量 IN 预加载消 N+1（posts.ts:209-222）✓；
- 缩略图 thumb.webp 回退原图机制 ✓（PostCard.vue:24-27）。
- 结论：首页数据量与图片策略达标，无需整改。

### P3-13｜构建产物与杂物卫生
- dist/ 已正确 ignore 且未被 git 追踪 ✓（git check-ignore 实证）；sourcemap hidden ✓。
- 工作区残留未清理：`tmp-test-2000.jpg`、`tmp-test-small.png`、`.e2e-reveal.mjs`、`.npm-tmp-cache/`、`.agent-teams/` 均 untracked 散落根目录。
- 建议：删除测试图片；其余按 P0-1/P0-2 一并入 ignore 或提交决策。

### P3-14｜错误处理小刺：MulterError 以 HTTP 200 包裹返回（app.ts:136-138）
- 与全局 `{code,message,data}` 信封约定一致（业务码 400），但 HTTP 层恒 200 会让网关/监控的 4xx 统计失真。低优先级，若引入 nginx 日志分析再统一。

---

## 三、审计方法附注
- 端点清单来源：`Select-String 'router.(get|post|put|patch|delete)'` 于 `api/routes/*.ts`（17 个路由文件，共 78 个端点）。
- 双端调用点：web 以 `src/utils/api.ts` + 页面 grep 交叉验证；小程序以 `miniprogram/utils/api.js` 映射表 + pages/**/*.js 调用点 grep 交叉验证。
- 构建产物实测：`dist/assets` 文件尺寸排序；git 追踪状态以 `git ls-files` / `git check-ignore -v` 实证。
