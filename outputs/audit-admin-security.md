# 校园墙 · 管理后台体验与安全审计报告

- 角色：E) 新任超级管理员第一视角 + F) 安全审计员
- 范围：`src/pages/admin/*`（9 页）、`api/routes/admin.ts` 及认证/上传/公告等后端、`miniprogram/pages/admin/moderation`
- 性质：只读审计，未改动任何业务代码
- 日期：2026-02

## 总评

后台骨架成熟度高于预期：驳回必填原因、匿名帖举报阈值揭示、上传三重校验（扩展名+MIME+magic number+sharp 重编码）、生产环境强制 JWT_SECRET 都是加分项。但有三个 P0 级问题必须先处理：**默认超管凭证且登录页公开提示**、**临时封禁到期永不解封**、**登录接口零速率限制+账号枚举**。另有一条贯穿性缺陷：`section_admin` 角色被两个前端放行、却被后端全部拒绝——权限矩阵前后端脱节。

---

## 问题清单（严重度降序）

### P0-1 默认超管凭证 admin/admin123 自动播种，且登录页明文公示
- 位置：`api/db.ts:258-262`（首启自动建 `admin / admin123` 超管）；`src/pages/admin/AdminLoginPage.vue:98`（页面直接写「默认管理员账号：admin / admin123」）
- 影响：任何能看到登录页的人可夺取全站管理权（封人、改密码、删帖、看实名学号）。种子密码无首次登录强制改密机制。
- 建议：① 删除登录页提示文案；② 种子密码改为环境变量注入（如 `ADMIN_INITIAL_PASSWORD`），未配置则生成随机密码打印到服务端日志一次；③ 首次登录强制改密。

### P0-2 临时封禁到期后永不解封，「解封时间」是空头支票
- 位置：`api/middleware/auth.ts:52-54`（authRequired 只判 `status==='banned'`）；`api/routes/auth.ts:153-156、76-79`（登录/wx-login 同样只判状态并向用户承诺「解封时间：xxx」）
- 证据：全库 grep `ban_until` 无任何过期比较；`api/jobs/` 只有 backup/dailyDigest，无解封任务。管理端设「7 天封禁」（`UsersPage.vue:236-240`）实际等于永久。
- 建议：在 authRequired/authOptional/登录处加惰性解封一条 SQL：`UPDATE users SET status='active' WHERE status='banned' AND ban_until != '' AND ban_until <= now`（查询前执行即可），或加定时任务；两行代码消除一个信任事故。

### P0-3 登录/注册无速率限制 + 可账号枚举；全站无 IP 级限流
- 位置：`api/routes/auth.ts:148-161`（1001「账号不存在」vs 1002「密码错误」可枚举学号；无锁定/验证码）；`api/app.ts:53`（`cors()` 全开放）；`api/app.ts:54`（JSON body 上限 10mb 放大滥用面）。全项目仅 `ai.ts:65-80` 有业务级限流，登录/发帖/评论/上传均无。
- 建议：引入 `express-rate-limit`：`/api/auth/login`、`/register` 收紧（如 15 分钟 10 次），其余 API 通用档；登录失败统一文案「学号或密码错误」；CORS 改白名单。

### P1-4 section_admin 角色前后端权限矩阵脱节：进得去后台、调不动任何接口
- 位置：后端 `api/routes/admin.ts:14` 对**所有** `/api/admin/*` 用 `superAdminRequired`；前端却放行——Web 守卫 `src/stores/user.ts:28`、小程序 `moderation.js:95` 均接受 `section_admin`；`AdminLayout.vue:29` 还给其显示「板块管理员」徽章。
- 后果：section_admin 登录后看到完整九页导航，每个请求都 403，列表因 catch 吞错而静默空白——新管理员会以为「平台没有数据」。后端给 section_admin 的唯一真实能力是看未发布帖详情（`posts.ts:270`）。另外普通用户手改 URL 直接打 `/api/admin/*` 会得到统一 401/403 JSON（`middleware/auth.ts:106-113`），这一层是干净的。
- 建议（二选一，需产品决策）：A) 真实现板块管理员——admin 路由换 `adminRequired` 并按 `section_id` 过滤数据（工作量约 2-3 天）；B) 暂时在前端守卫与小程序角色检查中移除 `section_admin`，避免空壳后台（10 行）。

### P1-5 「已删除」tab 恒空：后端硬排除 deleted，前端却提供入口
- 位置：`src/pages/admin/ContentPage.vue:25`（tabs 含「已删除」）；`api/routes/admin.ts:124`（`WHERE p.status != 'deleted'` 先于 status 过滤拼接，`status=deleted` 永远返回空）。
- 影响：误删帖子无法找回、被删内容的申诉复核无从谈起；管理员会以为删除功能坏了。
- 建议：后端允许显式查询（如 `status=deleted` 时去掉排除条件，仅 super_admin 可用），或直接从 tabs 移除该项并在注释注明。二选一，别留死入口。

### P1-6 驳回原因：网页端作者可见，小程序端完全不可见
- 位置：API 已返回 `rejectReason`（`posts.ts:66`、`users.ts:67`）；Web 端 `src/pages/MyPostsPage.vue:93-96` 有「驳回原因」展示 ✓；但小程序全部页面（detail/mine 等）grep 不到任何 reject/驳回/审核状态 UI，作者唯一获知渠道是一条站内信。
- 影响：小程序作者帖子「消失」了都不知道被驳回了什么原因，会重复发布再次被拒。
- 建议：小程序「我的帖子」与详情页对 `status==='rejected'` 渲染红色状态条 + rejectReason（数据已在响应里，纯前端约 30 行 wxml/js）。

### P2-7 Dashboard：六卡不可下钻、trend 三系列挤成单色条、sectionDist/collegeDist 算完就扔
- 位置：`DashboardPage.vue:34-49`（卡片纯 div，无 @click/跳转）；`:51-53、97-111`（trend 把 users/posts/comments 求和画一根 brand-500 条，数值只有 hover 才见）；`:26-29`（StatsData 接口根本没声明 sectionDist/collegeDist）；而后端每次都白算这两块分布（`admin.ts:414-426`）。
- 补图表成本评估（无需图表库）：① 卡片下钻 = `router.push({path:'/admin/posts', query:{tab:'pending'}})` + ContentPage 读 query 初始化 activeTab，约 15 行；② trend 改三系列并排细条或堆叠色块，纯 CSS 约 30 行；③ sectionDist/collegeDist 用横向宽度百分比条（Tailwind `width:%`）各约 50 行。合计约半天，零新依赖；除非要交互式 tooltip/缩放，不必上 ECharts（+~300KB 不值）。
- 建议：先做卡片下钻 + 两张分布横条图，把后端已经付费的数据用起来。

### P2-8 小程序一键封禁 = 永久封禁，且不填原因
- 位置：`miniprogram/pages/admin/moderation/moderation.js:428` 只传 `{action:'ban'}` → `admin.ts:74-86` 默认 `reason='违规'`、duration 空 → 永久封禁 + 给用户的站内信写「永久封禁」。Web 端有 1/7/30/永久选项（`UsersPage.vue:236-241`）。
- 影响：移动场景手一抖就是不可逆的永久封号，两端行为不一致。
- 建议：小程序复用 `wx.showModal({editable:true})` 收原因 + `wx.showActionSheet` 选时长；或后端对无 duration 的请求默认 7 天而非永久。

### P2-9 板块置顶后端支持、前端无入口；板块置顶无数量上限
- 位置：`admin.ts:204-223` 的 topType 支持 `'section'|'global'`（默认 section），但只对 global 校验 ≤3 条（`:212-214`）；`ContentPage.vue:121` toggleTop 写死 `'global'`，按钮文案也只有「全局置顶」（`:247`）。
- 影响：运营无法把好帖固定在某板块内（这是高频需求）；section 置顶可无限刷。
- 建议：置顶按钮旁加「全局/本板块」二选一（下拉或二次确认弹窗），后端补 section 维度计数上限。

### P2-10 公告 targetUserId 定向能力半接线：表有列、查询认它、创建入口没有
- 位置：schema `db.ts:188`（target_user_id 列存在）；展示侧已生效 `announcements.ts:18-20`（`target_user_id IS NULL OR = ?`）；但创建接口 `announcements.ts:67-75` 根本不收该字段，`AnnouncementsPage.vue` 弹窗也无此输入。
- 接线成本评估：低。后端 POST 增加 `targetUserId` 参数并校验用户存在（约 5 行）；管理页弹窗加可选「指定用户学号」输入框（或复用用户搜索）（约 20 行）；确认表 announcement_acks 本来就按 user_id 记录，无需动。
- 附带发现：未登录用户看到公告却无法持久 ack（`announcements.ts:42` ack 需 authRequired），每次进入都会再弹——建议 ack 允许匿名写 localStorage 或游客也可 ack。

### P2-11 重置密码的一次性密码：无复制按钮 + Math.random 生成
- 位置：`src/pages/admin/UsersPage.vue:272-276`（结果页只有 `select-all` 文本，需手动圈选 8 位字符转告用户）；`:79-84` genPassword 用 `Math.random()` 而非 `crypto.getRandomValues()`。
- 建议：加「复制」按钮（navigator.clipboard，一行）；密码生成换 crypto API。另注意 `admin.ts:96-103` reset-password 未禁止对另一个 super_admin 使用（ban 有保护、reset 没有）。

### P2-12 管理操作零审计日志
- 位置：封禁/解封（`admin.ts:67-93`）、重置密码（`:96-103`）、信誉调整（`:106-118`）、帖子审核/删除、举报处理（`:334-387`）均不留操作者记录，唯一痕迹是发给用户的站内信。
- 影响：「谁在何时封了谁、删了哪篇、改了谁的密码」事后无法追责；配合 P0-1 风险放大。
- 建议：轻量 `admin_logs(actor_id, action, target_type, target_id, detail, created_at)` + 各变更 handler 内一行插入（含 reset-password 强制记录明文外的一切参数），管理端先不做查询页也值得。

### P2-13 反馈闭环断裂：closed 状态永远没人能设置
- 位置：`api/routes/feedback.ts` 只有 POST 创建；不存在关闭/回复端点；而 Web `FeedbacksPage.vue:12` 与小程序 `moderation.js:63-66` 都渲染了「已关闭」tab——永远为空的第二个死 tab。
- 建议：加 `PUT /api/admin/feedbacks/:id/close`（可选回填一条站内信作为回复），两端补按钮；否则砍掉 closed tab。

### P3-14 用户列表缺状态/角色筛选（后端早已支持）
- 位置：`UsersPage.vue:21-36` load() 只传 keyword；`admin.ts:31-37` 的 status/role 过滤参数闲置。管理员无法快速拉出「全部封禁用户」，只能翻页肉眼找。
- 建议：工具栏加状态下拉（正常/封禁）+ 角色下拉，接现成参数约 15 行。

### P3-15 错误处理卫生：500 泄露内部报错文本、MulterError 返回 HTTP 200
- 位置：`api/app.ts:140`（`error.message` 原样下发客户端）；`app.ts:136-139`（MulterError 以 HTTP 200 + code 400 返回，破坏 REST 语义，监控按状态码统计会漏计）。
- 建议：500 统一文案、细节只进日志；MulterError 改真 400。

---

## E 视角速答（新任超管第一次体验）

| 问题 | 结论 |
|---|---|
| 不看文档能懂 /admin 吗 | 基本能：导航命名清晰（数据总览/帖子治理/举报处理…）、有角色徽章；但 Dashboard 是死胡同——六个数字点不动，不知道去哪处理 |
| 六卡数字能下钻吗 | 不能。待审内容/待处理举报卡应点击直达对应预筛选列表 |
| 审核 pending_review 帖子顺不顺 | 顺：帖子治理 → 「人工审核」tab → 通过/驳回，驳回强制填原因 ✓。缺一步：从 Dashboard 直达 |
| 驳回后作者能看到原因吗 | Web 端能（我的帖子页显示）；**小程序端不能**（只有一条易被忽略的站内信） |

## 小程序 moderation 与网页后台能力对照

- 四 tab（内容审核/举报处理/意见反馈/用户管理）与 Web 对齐的部分：审核动作、举报三动作（含 revealedAuthor 橙色警示条，做得比 Web 还醒目）、反馈列表。
- 不一致/缺口：① 封禁参数缺失致一键永久封（P2-8）；② 无评论管理 tab；③ 反馈同样只能看不能关（P2-13）；④ 同样放行 section_admin 却必然全 403（P1-4）；⑤ 高危操作（重置密码/信誉调整）仅 Web 提供——这个限制是对的，注释也已说明。
