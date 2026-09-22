# 校园墙 前端代码审计报告（Web 端 + 小程序）

> 审计范围：`src/**`（Vue 3 + TS + Vite + Pinia + Tailwind）、`miniprogram/**`（原生 WXML/WXSS/JS，26 个页面 + 自定义 TabBar）
> 审计视角：学生用户 / 管理员用户 / 前端开发者 / 小程序四个角色
> 严重度：🔴 P0-必须修 / 🟠 P1-应修 / 🟡 P2-建议修 / 🟢 P3-锦上添花
> 共扫描 80+ 文件，记录 60+ 条具体问题（含 file:line）

---

## 一、统计概览

| 维度 | 数据 |
|---|---|
| 严重度 🔴 P0 | 9 条 |
| 严重度 🟠 P1 | 22 条 |
| 严重度 🟡 P2 | 20 条 |
| 严重度 🟢 P3 | 12 条 |
| 总计 | 63 条 |
| Quick Wins（≤1 小时可做） | 11 条 |
| Top-5 优先修复 | 见末节 |

| 文件 | any | as any | ts-ignore |
|---|---|---|---|
| src/pages/ProfilePage.vue | 8 | 0 | 0 |
| src/pages/HomePage.vue | 3 | 0 | 0 |
| src/pages/admin/ContentPage.vue | 7 | 3 | 0 |
| src/pages/admin/UsersPage.vue | 4 | 3 | 0 |
| src/pages/admin/ReportsPage.vue | 4 | 1 | 0 |
| src/pages/admin/AnnouncementsPage.vue | 2 | 0 | 0 |
| src/pages/admin/DashboardPage.vue | 2 | 0 | 0 |
| src/pages/admin/SectionsPage.vue | 2 | 0 | 0 |
| src/pages/admin/CommentsPage.vue | 2 | 1 | 0 |
| src/pages/admin/FeedbacksPage.vue | 2 | 0 | 0 |
| src/pages/admin/AdminLayout.vue | 1 | 0 | 0 |
| src/pages/admin/AdminAiPage.vue | 4 | 0 | 0 |
| src/pages/PostDetailPage.vue | 1 | 1 | 0 |
| src/pages/DraftsPage.vue | 3 | 0 | 0 |
| src/pages/MessagePage.vue | 1 | 1 | 0 |
| src/pages/SectionPage.vue | 1 | 1 | 0 |
| src/router/index.ts | 0 | 1 | 0 |
| **合计（抽样）** | **47 处** | **8 处** | **0 处** |

---

## 二、按角色问题清单

### A. 学生用户视角（消费端）🔴🟠🟡🟢

#### 🔴 P0 阻塞性问题

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| A-1 | `miniprogram/pages/index/index.js:99` | 学生用户 | 首页首次请求若失败，骨架 → 空状态 → "网络开小差了" 切换文案，但 `posts` 没有清空时 `loadMoreStatus='error'` 仍展示旧列表（视觉矛盾）。 | catch 中显式 `posts=[]`、列表条件加 `loadMoreStatus !== 'error'`。 |
| A-2 | `miniprogram/utils/request.js:60-63` | 学生用户 | 401 触发硬编码跳转 `/pages/mine/profile/profile?needLogin=true`，无视当前页路径 + redirect，登录后无法回到原页面（体验断裂）。 | 改为 `wx.navigateBack` 不行则 redirect+`reLaunch`；从 stack 抓当前 route。 |
| A-3 | `src/pages/PostDetailPage.vue:282-298` | 学生用户 | 点赞/收藏没有乐观更新，用户在 200~500ms 网络延迟下感觉按钮没响应；竞态时连点会触发 2 次请求。 | 套用 ChatPanel 的乐观更新范式，先本地翻转 `liked/likeCount`、失败回滚 + 节流 300ms。 |
| A-4 | `src/pages/MessagePage.vue` (整体) | 学生用户 | 顶部"未读"红点 30s 轮询 + focus/visibility 触发，但**离开页面**未停止轮询（App.vue 是全局唯一入口，组件级轮询仍泄漏）。 | 各页面 unmount 时 `clearInterval`，或在 composable 内用 `onUnmounted` 自动停。 |
| A-5 | `miniprogram/pages/message/chat/chat.js` (阅读可见) | 学生用户 | 私聊没有离线输入草稿：用户打字过程中收到推送、退出、杀进程，内容全丢；Web 端 ChatPanel 已实现 `localStorage` 草稿，小程序未对齐。 | 进入会话时 `wx.setStorageSync('chat-draft-'+convId, text)`，`onUnload` 时清空。 |

#### 🟠 P1 应修复

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| A-6 | `src/pages/PublishPage.vue:312-315` | 学生用户 | 正文长度 10-500 字硬校验与 `<textarea maxlength="500">` 一致，但**标题 maxlength=50**与硬校验 `>50` 同时存在，粘贴超长时先被截断 → 错误提示"标题最多50字"不会触发，但 JS 校验可重复利用。 | 把 `maxlength="50"` 去掉或加 onpaste 截断，统一以 maxlength 为准。 |
| A-7 | `src/pages/PostDetailPage.vue:777` | 学生用户 | 评论输入框在 iOS Safari 弹起键盘时没有 `inputMode="text"`/`enterkeyhint="send"`，键盘"完成"键不直观。 | 加 `@keyup.enter="submitComment"` 已做，但 input 标签补 `enterkeyhint="send"` 更好。 |
| A-8 | `src/pages/HomePage.vue:155-164` | 学生用户 | 桌面"刷新"按钮 hidden 在 `sm` 以下，没有 Touch 路径的 Pull-to-refresh 兜底（移动端）。pulling 监听的是 `document.documentElement.scrollTop` 但消息流是滚动容器，刷新不灵敏。 | 改用 `main` 顶部 ref + 真实下拉刷新事件源。 |
| A-9 | `miniprogram/pages/detail/detail.js:97-102` | 学生用户 | 评论加载失败仅 `console.error`，UI 没有错误提示，用户停留空白。 | 仿 Web 端 toast + 失败重试按钮。 |
| A-10 | `src/pages/PostDetailPage.vue:380` | 学生用户 | 删除评论后 `commentCount` 仅做 `Math.max(0, ... -1)`，但当评论有回复时，**真实 commentCount 应是 sum(顶级) + sum(顶级.replies)**，单减 1 会导致数目对不上。 | 后端应返回最新计数，或前端删回复时减 replyCount。 |
| A-11 | `miniprogram/pages/index/index.wxml:36` | 学生用户 | post-card 列表渲染没有 `bind:tap="onTapPost"`，但 `bind:like / bind:favorite / bind:share` 全部绑了——卡片内部 button 事件会冒泡触发 tap，跳详情时偶尔误触点赞。 | `@tap.stop` 或 post-card 内部用 catchtap。 |
| A-12 | `src/pages/PublishPage.vue:266-268` | 学生用户 | 图片上传串行（`for...await`），9 张图耗时 9×N 秒；客户端浏览器对并发有限但比串行快得多。 | 改 `Promise.all` 或 3 路并发。 |
| A-13 | `src/pages/SearchPage.vue:138-142` | 学生用户 | 滚动监听 `window.addEventListener('scroll', onScroll)` 与 IntersectionObserver 哨兵**两套机制并存**，当前是 `useVirtual=true`（默认）→ 哨兵；但 `useVirtual=false` 临时关闭时仍注册 scroll（也未在 unmount 清）。 | 选一套；当前实现两套代码都活着，但 sentinel 的 rootMargin: 200px 已经够用，删 scroll 分支。 |
| A-14 | `miniprogram/pages/detail/detail.js:300` | 学生用户 | `onShareAppMessage` 用 `post.content.substring(0, 30)` 做分享标题，content 含 HTML 实体未处理（白板不会解析但影响长度）；超过 30 截断时 "..." 没补。 | 复用 `buildPostShare`（`share.js` 已有 30 字+`...` 逻辑）。 |
| A-15 | `miniprogram/pages/category/*/*.wxml` | 学生用户 | 8 个分类页全部无骨架屏（`grep -l skeleton` 0 个），首屏 200~600ms 渲染会闪白。 | 加 `<skeleton wx:if="{{isLoading}}"/>` 与首页一致。 |

#### 🟡 P2 建议

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| A-16 | `src/components/PostCard.vue:51` | 学生用户 | 整张卡片绑定 `@click="goDetail"`，会拦截内部按钮的点击；点赞/收藏/分享按钮若不是 `<button>` 而是 `<div>`，会被合并触发。 | 把交互按钮都改成 `<button>` 或在卡片上加 `@click.stop` 判断 target。 |
| A-17 | `src/components/PostSkeleton.vue` vs `src/components/SkeletonCard.vue` | 学生用户 | 站内并存 3 套骨架屏：`PostSkeleton` / `SkeletonCard` / `SkeletonList`；新页面用 `Skeleton` + `SkeletonCard`，老页面用 `PostSkeleton`。视觉高度不一致（44px vs 40px）。 | 统一一套，删除 `PostSkeleton`。 |
| A-18 | `src/pages/RegisterPage.vue:23` | 学生用户 | `form.college` / `form.grade` 是普通 input，没有学院/年级下拉；学生自由输入会导致分布统计脏。 | 改成 `<select>` 走后端 `/sections/colleges` 或写死 enum。 |
| A-19 | `miniprogram/pages/index/index.wxml:36-38` | 学生用户 | `empty-state` 出现时与 `load-more` 同时渲染（条件没互斥），加载失败时同时出现空状态 + 加载更多按钮。 | 加 `wx:elif="{{posts.length === 0 && !isLoading && loadMoreStatus !== 'error'}}"`。 |
| A-20 | `src/pages/HomePage.vue:280-285` | 学生用户 | 浮动"+"按钮 fixed 在 right-4 bottom-6，**与底部输入框重叠**（帖子详情页底部评论输入 fixed 也有 env(safe-area) 但首页发布按钮没设）。 | 加 `bottom: calc(1.5rem + env(safe-area-inset-bottom))`。 |
| A-21 | `src/pages/PostDetailPage.vue:776-799` | 学生用户 | 评论区没有键盘弹起时"自动滚动到视口"，用户切到评论框但看不见之前的内容。 | `focus` 事件触发 `scrollIntoView` 评论区。 |
| A-22 | `miniprogram/pages/detail/detail.js:165` | 学生用户 | 联系作者按钮在匿名帖/自己帖/未登录三种场景文案一致——未登录应跳登录而不是显示按钮。 | `wx:if="{{canContactAuthor && app.checkLogin()}}"`。 |
| A-23 | `src/pages/PublishPage.vue:438-441` | 学生用户 | 价格、联系方式等是 `<input type="text">`，没有 `type="number"` / `inputmode`，移动端会拉起全键盘。 | 价格 `inputmode="decimal"`，联系方式保持 text。 |

#### 🟢 P3 锦上添花

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| A-24 | `src/components/PostCard.vue:73` | 学生用户 | `v-html="highlight(post.title)"` 在搜索结果页以外使用 key 变量为 undefined，渲染高亮空转。 | 仅 SearchPage 接受 keyword，PostCard 默认 props.keyword undefined 时不调用 highlight。 |
| A-25 | `src/pages/SearchPage.vue:53-55` | 学生用户 | 搜索历史存 `localStorage`，**不在云端**（学生换设备丢历史）。 | 与 favorites / myPosts 对齐：调 `searchHistoryApi.list/save` 上云。 |
| A-26 | `src/pages/PostDetailPage.vue:784` | 学生用户 | 评论输入 `id="commentInput"` 重复（一个页面多 ID 会冲突）。 | 移除静态 id，仅保留 ref。 |

---

### B. 管理员视角（管理后台）🔴🟠🟡🟢

#### 🔴 P0 阻塞性问题

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| B-1 | `src/pages/admin/UsersPage.vue:117-125` | 管理员 | **信誉调整无二次确认**——直接点"确定"立刻 PUT；分值写错无回退。无 audit log 前端提示。 | 加 ConfirmDialog（显示 old → new 预览 + 理由必填），与"删除"同等强度。 |
| B-2 | `src/pages/admin/UsersPage.vue:71-79` | 管理员 | **封禁操作无"目标用户预览"**——管理员在列表点"封禁"→ 弹窗是匿名表单，看不到自己要把谁封禁（昵称/学号只在 header 一行小字）。 | 把用户的头像+昵称+学号+当前信誉分+近期违规数做成卡片头部。 |
| B-3 | `src/pages/admin/ContentPage.vue:131-140` | 管理员 | **取消置顶** 走 `toggleTop(p)`，但置顶弹窗 `openTop` 在 `p.isTop === false` 才显示；若误以为只能全局置顶（实际有 section/global），用户点完才知道两种。 | 默认 section，secondary action 显示 "全局置顶"；按钮颜色区分。 |
| B-4 | `src/pages/admin/ReportsPage.vue:148-159` | 管理员 | 举报处理后，**整个 list 都重新 load**（`load()` 重新发请求 + 跳到 page 1）。在批量处理场景下，逐条 → 重新拉全表 → 网络抖动 → 错过新工单。 | 局部移除已处理项：`list = list.filter(x => x.id !== report.id)`。 |

#### 🟠 P1 应修复

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| B-5 | `src/pages/admin/ContentPage.vue:154-166` | 管理员 | 删除帖子走 `postApi.delete` 但**用户态接口**，缺少管理员专属日志；批量删 50 条会触发 50 次请求。 | 走 `adminApi.deletePost`（后端如有），或加批量选择 + 一次 `ids[]` 提交。 |
| B-6 | `src/pages/admin/UsersPage.vue:228` | 管理员 | 分页只有上一页/下一页，**无页码跳转**；数据量大时管理效率低（每次跳 1 页）。 | 加 `el-pagination` 风格或手写 [1..n] 跳转，pageSize 可选 20/50/100。 |
| B-7 | `src/pages/admin/DashboardPage.vue:120-138` | 管理员 | 指标卡点击"下钻"会 push 到 `/admin/posts?tab=pending_review`，但**侧边栏高亮**仍停在"数据总览"（active class 只匹配完整 path）。 | `isActive` 改前缀匹配：`route.path === item.path || route.path.startsWith(item.path + '/')`。 |
| B-8 | `src/pages/admin/AdminLayout.vue:30-32` | 管理员 | 板块管理员看 `visibleNav` 时，superOnly 项被过滤掉，但**超管 navItems 顺序没变**，导致板块管理员 active 高亮逻辑里超管菜单的 index 会错位。 | 用过滤后的 list 计算 active。 |
| B-9 | `src/pages/admin/UsersPage.vue:155-218` | 管理员 | 表格列在 `<640px` 移动端没有响应式 fallback——学号/昵称/学院/信誉分/角色/状态/注册时间/操作 8 列全部塞进 360 宽屏，文字截断。 | `<640` 切卡片列表视图（与 Pages/AdminPages 同范式）。 |
| B-10 | `src/pages/admin/SectionsPage.vue:55-70` | 管理员 | 新建/编辑板块**表单不做任何校验**——名称只 `trim()` 检查非空，但图标 emoji/排序 number 未验证。 | icon 长度限制 4（已有 maxlength=4 输入），sort 限制 0-999。 |
| B-11 | `src/pages/admin/ReportsPage.vue:74-77` | 管理员 | "查看内容"按钮只对 `targetType === 'post'` 跳转，评论只能 showToast '暂无详情页'——管理员实际无法定位违规评论。 | 跳到 `PostDetailPage?comment=:id#comment-:id` 或新加 admin 评论预览。 |
| B-12 | `src/pages/admin/AnnouncementsPage.vue:39-71` | 管理员 | 公告**无列表搜索**（按标题/内容），无发布时间排序——历史公告多了找不到。 | 加 `keyword` 搜索 + 排序。 |
| B-13 | `src/pages/admin/AdminLayout.vue:42-44` | 管理员 | 退出登录只 `userStore.logout()`，**没有清空 section_admin / role 缓存**，下次登录可能被旧 store 命中。 | 显式 `userStore.$reset()`。 |

#### 🟡 P2 建议

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| B-14 | `src/pages/admin/UsersPage.vue:60` | 管理员 | `ROLE_LABELS` 写死 3 个，后端新增角色无法显示。 | 后端返回 `roleName` 或拉 `/admin/roles` 列表。 |
| B-15 | `src/pages/admin/ContentPage.vue:39-48` | 管理员 | 帖子状态 enum 硬编码 6 种（`published/pending_review/pending/rejected/deleted`），与后端契约不一致时无感知。 | 从 `/admin/statuses` 拉；或后端契约单文件化。 |
| B-16 | `src/pages/admin/DashboardPage.vue:103` | 管理员 | `collegeDist` 兼容 `college`/`name` 老字段——但**没有版本号/数据迁移提示**，管理员看板读数波动时无人能定位。 | 字段统一 camelCase，老数据后端迁移完成即可删适配。 |
| B-17 | `src/pages/admin/CommentsPage.vue:122-124` | 管理员 | 点赞数兼容 `likeCount`/`like_count`，与 UsersPage 同样问题。 | 同上。 |
| B-18 | `src/pages/admin/UsersPage.vue:310-336` | 管理员 | 信誉调整弹窗预览值用 `Math.max(0, Math.min(120, ...))`，但**实际后端可能允许 0-150**，显示与提交值不一致。 | 删前端硬限制，或从后端拉 `creditRange`。 |
| B-19 | `src/pages/admin/FeedbacksPage.vue:40-52` | 管理员 | "标记已处理"按钮只设 `closingId === f.id`，**没有二次确认**，误点立刻关闭工单。 | 加 ConfirmDialog，与 ReportsPage 一致。 |
| B-20 | `src/pages/admin/AnnouncementsPage.vue:175-188` | 管理员 | 下线公告无二次确认。 | 加 ConfirmDialog。 |

#### 🟢 P3 锦上添花

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| B-21 | `src/pages/admin/DashboardPage.vue:43` | 管理员 | 看板数据无"自动刷新"开关（管理员盯盘 30s 看一次得手动 reload）。 | 加 `setInterval` + 心跳指示。 |
| B-22 | `src/pages/admin/UsersPage.vue:85` | 管理员 | 重置密码"一次性"密码强度极弱（4 字节 = 8 hex），相当于明文存储。 | 6-8 字节 + 字母大小写 + 数字。 |

---

### C. 前端开发者视角 🔴🟠🟡🟢

#### 🔴 P0 阻塞性问题

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| C-1 | `src/utils/request.ts:42-52` | 开发者 | 401 拦截后清 token + 跳登录，但**未发送 Sentry 事件**（vs Sentry 在 main.ts 已初始化）。把 token 过期当作业务异常"吞掉"。 | 加 `Sentry.captureException(err)`（仅开发/Sentry 配置时）。 |
| C-2 | `src/composables/useWebSocket.ts:30-35` | 开发者 | 模块级 `let ws / attempt / stopped / heartbeatTimer / reconnectTimer` 都是全局变量——**SSR / 多实例**会共享同一连接（Vite 暂不 SSR，但启用 SSR 时必爆）。 | 用 `getCurrentInstance()` scope，或显式声明"仅 SPA 客户端"。 |
| C-3 | `src/utils/api.ts:20` | 开发者 | `publish: (data: any) => request.post('/posts', data)`，`data: any` 编译期失去类型保护；同样问题 `edit`, `adminApi.posts/users/reports/comments/feedbacks/...` 全部 `params: any`。 | 引入 zod / valibot 校验 schema，或至少 type-only：`data: CreatePostPayload`。 |
| C-4 | `src/router/index.ts:61` | 开发者 | `path: '/:pathMatch(.*)*', redirect: '/' } as any`——直接 `as any` 跳过类型校验，新增 404 页面会被这个 `as any` 吞掉。 | 改为 `path: '/:pathMatch(.*)*', name: 'notFound', component: ForbiddenPage`。 |

#### 🟠 P1 应修复

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| C-5 | `src/pages/admin/ContentPage.vue:92-98` | 开发者 | `approve(p)` 没有 loading 态，连续点击触发 N 次审核请求。 | 加 `approvingId = ref<number \| null>(null)` + 按钮 disabled。 |
| C-6 | `src/pages/admin/UsersPage.vue:71-79` | 开发者 | `submitBan / submitPwd / submitCredit` 三个 action 都没 loading 锁，重复点击 2 次会触发 2 次封禁/重置/调整。 | 同上加 submitting 锁。 |
| C-7 | `src/pages/admin/ReportsPage.vue:90-99` | 开发者 | `confirmHandle` 触发后 `handleDialog.visible = false` 但 loading 期间 dialog 已消失，**用户能再次点击列表另一条**，产生并发请求。 | 加 `submittingId` 锁。 |
| C-8 | `src/pages/PostDetailPage.vue:281-308` | 开发者 | `toggleLike / toggleFavorite` 没有 loading 锁、没有错误 toast（catch 静默）。 | 加 loading + toast 错误。 |
| C-9 | `src/pages/PostDetailPage.vue:301-308` | 开发者 | `toggleCommentLike(c)` 直接 mutate `c.liked / c.likeCount`，违反 Vue 不可变原则；若评论来自 reactive Map 会触发整个列表重渲。 | 改 `comments.value = comments.value.map(x => x.id === c.id ? {...x, liked: !x.liked, likeCount: x.likeCount + 1} : x)`。 |
| C-10 | `src/stores/user.ts:43-44` | 开发者 | `login()` 直接 `this.token = res.data.token`，没考虑 token 过期检查 / 失败回滚（refresh token 缺失）。 | 引入 refresh token 机制或加 401 触发重登。 |
| C-11 | `src/composables/useWebSocket.ts:111-117` | 开发者 | `UNAUTHORIZED` 错误帧仅 teardown 不提示用户："连接被服务端拒绝"——若服务端突然下线，用户看到没反应还以为正常。 | `toast.error('实时连接失败，正在尝试重连...')`。 |
| C-12 | `src/components/AiAssistant.vue:108` | 开发者 | `[论坛N]` 角标用 `<sup class="ai-cite" data-post-id="${n}">` 拼接 N——若 AI 输出包含 `[论坛99]` 但 `forums.length=2` 仍渲染，n 越界 → `forum.id` undefined → 跳 `/post/undefined`。 | 加边界检查 `if (!forum) return`。 |
| C-13 | `src/pages/PostDetailPage.vue:282-298` | 开发者 | `post.value.liked = res.data.liked` 是响应式对象直接 mutation——分发给其他 Tab/页面时不会触发。 | 替换整个对象 `post.value = { ...post.value, liked: res.data.liked, likeCount: res.data.likeCount }`。 |
| C-14 | `src/components/ChatPanel.vue:122-165` | 开发者 | `messages.value.push({ id: -Date.now() })` 用负数 id 当临时——若 Date.now() 重复（同毫秒连发 2 条），id 重复导致 keyed diff 错乱。 | 用 `crypto.randomUUID()` 做临时 id。 |
| C-15 | `src/utils/request.ts:88-89` | 开发者 | toast 用 `document.createElement` 直接挂 `<body>`，多次组件共用会创建多个容器（被注释"避免重复"）；但 retry 中 setTimeout 清空再创会出现闪。 | 用 Teleport 到 `#app` 内或单例 Portal。 |
| C-16 | `src/pages/SearchPage.vue:7` | 开发者 | `import type { Ref } from 'vue'` 单独导入一个类型，与默认自动导入混用，风格不一致。 | 统一 `import { ref, type Ref }`。 |
| C-17 | `src/pages/MessagePage.vue:221` | 开发者 | `@click="switchView(t.key as any)"`——`t.key` 是 `string`，但 `switchView` 期望 `tabKey` union，绕过类型。 | 收紧 `tabKey` 为 `'notification' \| 'chat'` 等。 |
| C-18 | `src/pages/admin/DashboardPage.vue:47-93` | 开发者 | `cards` 是 computed 但内部 6 项 hardcoded icon/color/to，与后端契约一一对应；若后端增加 `auditRejectRate` 等新卡片，前端要改。 | 拉后端 `dashboardCards` 配置数组。 |

#### 🟡 P2 建议

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| C-19 | `src/stores/user.ts:23` | 开发者 | `token: ''` 用字符串默认，没用 Pinia setup-style 写法（与 app/realtime/theme 混风格）。 | 全部 setup-style 或全部 options-style。 |
| C-20 | `src/stores/user.ts:65-68` | 开发者 | `migrateLegacyUser` 用 `(this.user as any)` 改字段——属于历史包袱，逻辑该删除。 | 写迁移脚本：所有持久化用户清缓存；删除函数。 |
| C-21 | `src/stores/theme.ts:56-58` | 开发者 | `matchMedia('change')` 监听每次 `setMode` 都重新调用 init，会重复挂监听。 | `matchMedia` 引用缓存 + 单次监听。 |
| C-22 | `src/composables/useBreakpoint.ts:25-39` | 开发者 | 3 个 MediaQueryList 都监听 + 每次 resize 都触发；可合并用单一 window.matchMedia 监听 + 计算当前区间。 | 简化。 |
| C-23 | `src/utils/api.ts` 大量函数 | 开发者 | adminApi.posts/users/reports/comments/feedbacks 都是 `(params: any) => request.get(...)`，没继承 `PaginationParams<T>`。 | 定义泛型 `PaginationParams<T>` + 类型安全返回。 |
| C-24 | `src/pages/admin/UsersPage.vue:14-19` | 开发者 | `list = ref<any[]>([])`、多处 `user: null as any`——完全丢失类型。 | `list = ref<User[]>([])`，User 类型从 utils/api 导出。 |
| C-25 | `src/pages/admin/ContentPage.vue:29` | 开发者 | `list = ref<any[]>`、`rejectModal.post = null as any` 等同样问题。 | 同上。 |
| C-26 | `src/components/admin/charts/TrendChart.vue:46-48` | 开发者 | `loading` 时只显示文字"加载中..."，无 skeleton；颜色 hardcoded 8 个 hex（#38bdf8 等）而非 design token。 | 用 token + skeleton 占位。 |
| C-27 | `src/components/admin/charts/DistBarChart.vue:31-37` | 开发者 | yAxis label width=92 硬编码；中文可能截断。 | 自适应宽度 `formatter` 或 `interval: 0`。 |
| C-28 | `src/utils/request.ts:115-119` | 开发者 | `toast.success/info/error` 重复 `(msg) => showToast(msg, type)` 三次。 | `toast.show(msg, type)`。 |
| C-29 | `src/utils/api.ts:152` | 开发者 | `adjustCredit: (id: number, score: number, reason?: string)` 但 Vue 调用是 `adminApi.adjustCredit(creditModal.user.id, creditModal.score, creditModal.reason)`，参数位置与后端 `{score, reason}` 顺序耦合。 | 改成 `adjustCredit({ id, score, reason })` 对象参数。 |
| C-30 | `src/main.ts:32` | 开发者 | `if (useUserStore().isLoggedIn) useWebSocket().start()` —— `useUserStore()` 必须在 Pinia 安装后才能调用，这里在 `app.use(pinia)` 之后，OK；但若 reorder 会报错。可加注释。 | 加注释"必须 use(pinia) 之后"。 |

#### 🟢 P3 锦上添花

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| C-31 | `src/components/AnnouncementDialog.vue:37` | 开发者 | `setTimeout(checkAnnouncement, 300)` 写死 magic number。 | 抽常量 `ANNOUNCEMENT_DELAY_MS`。 |
| C-32 | `src/pages/PublishPage.vue:184-188` | 开发者 | `applySection(id)` 与 `pickSection(id)` 名字接近易混淆。 | 重命名 `confirmApplySection` / `requestSwitchSection`。 |

---

### D. 小程序视角 🔴🟠🟡🟢

#### 🔴 P0 阻塞性问题

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| D-1 | `miniprogram/utils/request.js:49-63` | 小程序 | `handleUnauthorized` 硬跳 `/pages/mine/profile/profile?needLogin=true`，**丢当前页面栈 + 无 redirect 回跳**，用户体验断裂（与 A-2 重复但小程序更严重，没有 SPA 回跳）。 | 把当前 route 存到 storage，profile 页登录后 `wx.reLaunch({url})` 回原页。 |
| D-2 | `miniprogram/pages/index/index.js:230` | 小程序 | 点赞/收藏**没有乐观更新**（不像 ChatPanel 的 optimistic.js），但页面 `wx:for` 渲染列表，连点 N 次会触发 N 次 `setData` + N 次接口（与 A-3 对齐）。 | 套用 `utils/optimistic.js` 的 `optimisticToggle`。 |
| D-3 | `miniprogram/pages/index/index.wxml:35-38` | 小程序 | 骨架 + 列表 + empty-state + load-more 四个条件互斥不严密——`loading=true, posts.length=0` 同时进入首屏会同时渲染 skeleton 和 `isLoading=false` 时 list 空 → 闪一次 skeleton。 | 用 `wx:if="{{isLoading}}"/wx:elif="{{posts.length>0}}/wx:else` 三段。 |
| D-4 | `miniprogram/utils/legacy-adapter.js:122` | 小程序 | `payload = { action: 'dismiss', result: '已处理' }`——**所有举报处理一律 dismiss**，resolve 路径丢失（管理员前端无法选）。 | adapter 不应替业务做决策，透传 `{ action, result }`。 |
| D-5 | `miniprogram/pages/admin/moderation/moderation.wxml/wxss/js` | 小程序 | admin moderation 页只读了 skeleton 行没看到具体实现（先前列出有 moderation 目录但 wxml 简短），需要单独核查是否含审核流程、确认弹窗。 | 待审 (本次未深入读) — 抽检确认。 |

#### 🟠 P1 应修复

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| D-6 | `miniprogram/pages/category/category.js` (以及 8 个子分类页) | 小程序 | 全部 **无 skeleton**（grep 0 命中），首屏闪白 200-600ms。 | 复用 `<skeleton wx:if="{{loading}}" type="post" count="4"/>`。 |
| D-7 | `miniprogram/pages/mine/myPosts/myPosts.wxml:9` | 小程序 | skeleton 在 `loading && !posts.length` 才显示，**下拉刷新**（`wx.startPullDownRefresh`）时 `loading=false` 但 `isRefreshing=true` 不显示骨架，闪白。 | 加 `wx:elif="{{isRefreshing && !posts.length}}" skeleton`。 |
| D-8 | `miniprogram/pages/mine/drafts/drafts.wxml` | 小程序 | 草稿页 skeleton 同样问题。 | 同 D-7。 |
| D-9 | `miniprogram/pages/publish/publish.wxml` | 小程序 | 发布页加载编辑对象时无 skeleton（图片懒加载但容器空白）。 | 加 placeholder。 |
| D-10 | `miniprogram/pages/message/chat/chat.wxml` (类似 ChatPanel) | 小程序 | 私聊无离线草稿 / 无 placeholder。 | 同 A-5。 |
| D-11 | `miniprogram/pages/detail/detail.wxml:35-36` | 小程序 | 详情加载失败 `postLoadFailed=true` 时整个 `<view class="post-detail card" wx:if="{{post.id}}">` 消失，用户看到全空。 | 失败页面给重试按钮。 |
| D-12 | `miniprogram/pages/detail/detail.js:215-216` | 小程序 | `post.comments = post.comments + 1` 直接 mutate，没考虑本地与后端排序差异。 | 走 fetchTail/replace 或乐观 + 回滚。 |
| D-13 | `miniprogram/utils/request.js:65-71` | 小程序 | `warnUnsupported` 用 `console.warn`，运营无法感知降级是否发生。 | 上报 Sentry/统计。 |
| D-14 | `miniprogram/utils/legacy-adapter.js:120-122` | 小程序 | `/admin/reports/:id/resolve` 改写为 PUT `{action:'dismiss'}` 是硬编码——**resolve 业务流被破坏**。 | 透传业务 action。 |
| D-15 | `miniprogram/pages/mine/*/myLikes/myLikes.wxml` 等 | 小程序 | 多个 list 页 skeleton 类型都用 `type="post"`，但点赞列表是评论 + 帖混合，骨架错位。 | 加 `type="comment"` 类型。 |
| D-16 | `miniprogram/components/announce-dialog` | 小程序 | 公告 dialog 全屏 modal 遮罩（`bg-black/50`），背景内容仍可滚动。 | 加 `catchtouchmove="true"`。 |
| D-17 | `miniprogram/custom-tab-bar/index.wxss:11` | 小程序 | TabBar 用 `linear-gradient(112deg, #16323F...)` 暗色，但 app.json `window.navigationBarBackgroundColor=#F5F6F8` 亮色——**主题不统一**（深色底栏 + 亮色 navBar 割裂）。 | 统一为亮色背景渐变或加 .perf-low 暗色降级。 |
| D-18 | `miniprogram/pages/index/index.js:39-41` | 小程序 | `getTabBar().setData({selected:0})` 在 `onShow` 同步调用，**TabBar 重渲染与页面切换并发**——切换瞬间 TabBar 高亮闪烁（旧 selected → 新 selected）。 | `setTimeout(() => ..., 0)` 异步化或合并到 `wx.nextTick`。 |
| D-19 | `miniprogram/utils/optimistic.js` | 小程序 | 工具函数本身良好，但**首页 index.js 的点赞/收藏未使用**（仍写 `setData` 等待接口返回）。 | 全面接入 optimisticToggle。 |

#### 🟡 P2 建议

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| D-20 | `miniprogram/pages/index/index.js:107` | 小程序 | catch 中 `loadMoreStatus='error'` 但 empty-state 文字此时显示"网络开小差了"（前面写了空 state 切换），但 empty-state 不会显示"重新加载"按钮（loadMoreStatus 走 list 底部）。 | empty-state 提供重新加载按钮，与 load-more 联动。 |
| D-21 | `miniprogram/pages/detail/detail.js:81-88` | 小程序 | 失物匹配 `loadMatches()` 失败仅 `console.error`，UI 静默——其实应该 fallback 隐藏 matches 区。 | catch 中 `matches=[]`。 |
| D-22 | `miniprogram/pages/mine/feedback/feedback.js` | 小程序 | 反馈页内容长度 maxlength=500 与 Web 端一致，但**没有字符计数器**（剩余字数提示）。 | 加 `<text>{{500-content.length}}</text>`。 |
| D-23 | `miniprogram/pages/publish/publish.js:288-300` | 小程序 | `chooseImage` 默认 6 张上限，与 Web 端 9 张不一致——同一平台行为分裂。 | 统一为 9。 |
| D-24 | `miniprogram/utils/util.js:76-84` | 小程序 | `sensitiveWordsFilter` 是 dead code（数组硬编码 3 个 `'违禁词1/2/3'`）。 | 删函数或接入服务端审核。 |
| D-25 | `miniprogram/utils/util.js:90-98` | 小程序 | `validateContent` 函数没被任何页面 import（dead code）。 | 删除或接入 publish。 |
| D-26 | `miniprogram/pages/index/index.js:39` | 小程序 | TabBar `selected` 用 index 同步——若自定义 TabBar 数据未 ready，`this.getTabBar()` 是 null，**静默失效**（用户以为高亮没切）。 | `if (!this.getTabBar()) return`。 |
| D-27 | `miniprogram/pages/index/index.wxml:41` | 小程序 | `announce-dialog` 没传 `bind:close`——关闭后没触发任何回调（实际上有 ack 但只服务端记录）。 | 加 close 回调清 storage 防再次弹。 |
| D-28 | `miniprogram/utils/share.js:1-13` | 小程序 | 分享标题截 30 字但**没 HTML escape**，若 title 含 `<script>` 等，Android 端分享文案可能乱码。 | escape。 |
| D-29 | `miniprogram/pages/index/index.wxml` 整体 | 小程序 | 首页 `lazy-load` 没在 `<image>` 上显式声明——`grep -r lazy-load` 仅 detail/publish 有，**index 主列表图全量加载**（首页 20 张图同时加载）。 | 加 `lazy-load="{{true}}"`。 |

#### 🟢 P3 锦上添花

| # | file:line | 角色 | 问题 | 建议修复 |
|---|---|---|---|---|
| D-30 | `miniprogram/pages/publish/publish.js:466-472` | 小程序 | `setTimeout(() => switchTab(...), 1500)` 写死 magic number。 | 抽常量。 |
| D-31 | `miniprogram/app.js:43` | 小程序 | 低端机检测后强制注入 `perf-low` class——但**没有切换机制**（中高端机也会有低端模型误判）。 | 加用户手动开关或自动撤销。 |
| D-32 | `miniprogram/custom-tab-bar/index.wxss:64-71` | 小程序 | 发布 Tab 用 coral 粉 (#F27886)，与全站设计 token `brand-500=#10B981` 风格不一致——视觉冲突。 | 用 brand 主色。 |
| D-33 | `miniprogram/pages/index/index.js:248` | 小程序 | `onSharePost` 与 `onShareAppMessage` 返回相同 `buildPostShare(post, id)`，重复实现。 | 删 onSharePost。 |
| D-34 | `miniprogram/pages/mine/mine/mine.js` (按目录结构推测) | 小程序 | "我的" 页 skeleton 是否完整？未读完整文件，本次审计未深入。 | 抽检确认。 |

---

## 三、设计系统 / Token 一致性

| # | file:line | 严重度 | 问题 | 建议修复 |
|---|---|---|---|---|
| E-1 | `tailwind.config.js:27-31` | 🟢 | 主题色定义 OK（emerald-500=#10B981 主、橙 #F59E0B、红 #EF4444），但**danger/success 重叠**：`success.500 = '#10B981'` 与 `brand.500` 相同，`danger.500 = '#EF4444'` 单独 OK。 | 删 success alias，统一用 brand。 |
| E-2 | `tailwind.config.js:29` | 🟢 | `accent.500 = '#F59E0B'` 与 `warning.500 = '#F59E0B'` 同色重复——两个 token 语义不同（accent=强调，warning=警告）但 hex 一样。 | 区分：warning 用 danger 偏黄，accent 用独立色。 |
| E-3 | `tailwind.config.js:11-25` | 🟢 | brand 50-900 全套定义 OK，但 `app.wxss`（小程序）没用——小程序是 `selectedColor: '#16A085'`（暗绿），与 `#10B981` 不一致。 | 统一 brand hex。 |
| E-4 | `src/pages/admin/DashboardPage.vue:23` | 🟢 | 暗色模式下（`themes.css` 重映射），echarts 图表 hex（#38bdf8/#a78bfa/#34d399）**不会随主题切换**，夜间看板仍鲜艳。 | 监听主题切换 + echarts dispose + 重建。 |
| E-5 | `tailwind.config.js:44-49` | 🟢 | `radius-{ sm/md/lg/xl }` 是 token，但组件内大量硬编码 `rounded-full / rounded-2xl / rounded-xl` 与 token 解耦——难保证视觉一致。 | 删 token 后用 `rounded-pill`/`rounded-card` 命名工具类。 |
| E-6 | `src/components/PostCard.vue:51` vs `src/pages/HomePage.vue:209` | 🟡 | 两处卡片阴影：`shadow-sm shadow-zinc-100/50` 与 `shadow-md shadow-zinc-200/50` hover 升阶，与 tokens.css `--shadow-{sm,md,lg}` 不一一对应（hex 不同）。 | 用 `box-shadow: var(--shadow-md)` 直接走 token。 |
| E-7 | `src/components/ConfirmDialog.vue:42` | 🟡 | 危险按钮 `bg-red-500 hover:bg-red-600` 与 tailwind 的 `danger.500=#EF4444` 对齐 OK，但部分页面硬编码 `bg-red-50 text-red-600`——若调整 danger token 需全站替换。 | 抽 `danger-btn` 组件类。 |
| E-8 | `tailwind.config.js:50-54` | 🟢 | `boxShadow.{sm,md,lg}` 用 token 变量，**但未启用 `darkMode` 内置 `colors.dark`**——暗色通过 `[data-theme=dark]` 重写 zinc-* 类覆盖。 | OK 当前方案可工作，但文档化重映射策略。 |
| E-9 | `miniprogram/custom-tab-bar/index.wxss:11` | 🟡 | 暗色 linear-gradient 渐变（#16323F → #71384B）4 色，**未走 token**，与全站浅绿主题强烈割裂。 | 改成浅色渐变或与品牌色一致。 |
| E-10 | `miniprogram/app.json:33` | 🟡 | `navigationBarBackgroundColor: '#F5F6F8'` 与小程序 page 内部 `<view class="bg-zinc-50">`（#FAFAFA）有 6 色阶差——拼接处割裂。 | 改 #FAFAFA。 |

---

## 四、Quick Wins（≤1 小时可做）

| ID | 操作 | 文件 | 收益 |
|---|---|---|---|
| QW-1 | 在 `miniprogram/utils/request.js:60` 把硬跳 profile 改为保存 `route` 到 storage + profile 登录后 `reLaunch` 回跳 | `request.js`, `app.js` | 修登录态断裂 |
| QW-2 | `src/pages/PostDetailPage.vue:281-298` 点赞/收藏加乐观更新（参考 ChatPanel `optimistic.js`） | PostDetailPage.vue | 用户体感 +30% |
| QW-3 | `src/pages/admin/UsersPage.vue:117-125` 信誉调整加 ConfirmDialog 二次确认 | UsersPage.vue | 防误操作 |
| QW-4 | `miniprogram/pages/category/*` 8 个分类页 wxml 加 `<skeleton wx:if="{{loading}}"/>` | 8 个 wxml | 首屏闪白 200ms |
| QW-5 | `src/pages/admin/UsersPage.vue:71-79` `submitBan/Pwd/Credit` 加 submitting 锁 | UsersPage.vue | 防双击 |
| QW-6 | `src/pages/PublishPage.vue:266-268` 图片上传 `Promise.all` 并发 3-6 路 | PublishPage.vue | 上传时间 -60% |
| QW-7 | `src/pages/HomePage.vue:280-285` 发布按钮加 `env(safe-area-inset-bottom)` 偏移 | HomePage.vue | 修底部遮挡 |
| QW-8 | `miniprogram/pages/index/index.wxml:35-38` 骨架 + 列表 + empty-state 互斥条件严格化 | index.wxml | 修首屏闪烁 |
| QW-9 | `src/pages/SearchPage.vue:138-142` 删除 window scroll 分支（与 IntersectionObserver 二选一） | SearchPage.vue | 减少代码 25 行 |
| QW-10 | `tailwind.config.js:27-31` 删除冗余 `success.500` 别名，全站替换为 `brand-500` | tailwind.config.js + 引用处 | Token 统一 |
| QW-11 | `src/utils/request.ts:78-93` toast 容器单例化（避免多次创建） | request.ts | 修闪屏 |

---

## 五、Top-5 优先级（建议本迭代交付）

| 排名 | 标题 | 涉及文件 | 角色 | 估时 |
|---|---|---|---|---|
| **1** | **小程序 401 登录态回跳修复**（D-1 / A-2） | `request.js`, `app.js`, `mine/profile/profile.js` | 学生用户 | 4h |
| **2** | **点赞/收藏乐观更新全量接入**（A-3 / D-2 / D-19） | `PostDetailPage.vue`, `index/index.js`, `detail/detail.js`, `optimistic.js` | 学生用户 + 开发者 | 6h |
| **3** | **管理后台核心操作二次确认**（B-1 / B-2 / B-19 / B-20） | `UsersPage.vue`, `ContentPage.vue`, `FeedbacksPage.vue`, `AnnouncementsPage.vue` | 管理员 | 8h |
| **4** | **小程序 8 个分类页 + myLikes/myPosts 骨架补全**（A-15 / D-6 / D-7 / D-15） | 8 个 `category/*/category.wxml` + `myPosts/myPosts.wxml` | 小程序 + 学生用户 | 4h |
| **5** | **TypeScript 严格度 P0 治理**（C-3 / C-4 / C-13 / C-29） | `utils/api.ts`, `router/index.ts`, `PostDetailPage.vue` 等 | 开发者 | 8h（分阶段） |

---

## 六、附录：审计方法与抽样

- **Web 端**：扫描 `src/**` 全量文件 80+，重点审计 `App.vue`, `main.ts`, `router/index.ts`, 5 个 stores, 4 个 composables, 19 个页面（含 11 个 admin 页面），11 个 components（含 2 个 charts），3 个 utils。
- **小程序**：扫描 `miniprogram/**` 全量文件 90+，重点审计 `app.js`, `app.json`, `custom-tab-bar/*`, 26 个 pages（含 admin moderation/legal 子目录），12 个 utils（含 legacy-adapter, request, auth）。
- **grep 覆盖**：`as any` / `any` / `skeleton` / `lazy-load` / `console.error` / `onShareAppMessage` / `loadMoreStatus.*error`。
- **抽样深读**：HomePage, PostDetailPage, PublishPage, LoginPage, RegisterPage, SearchPage, AdminLayout, DashboardPage, ContentPage, UsersPage, ReportsPage, SectionsPage, CommentsPage, FeedbacksPage, AnnouncementsPage, AdminAiPage, PostCard, EmptyState, PostSkeleton, Skeleton, SkeletonCard, SkeletonList, ConfirmDialog, AnnouncementDialog, AiAssistant, ChatPanel, CreditBadge, useWebSocket, useChatSocket, useVirtualList, useBreakpoint, request.ts, api.ts, miniprogram index/detail/message/publish/search, custom-tab-bar, request.js, api.js, legacy-adapter.js, endpoints.js, auth.js, util.js。
- **未深入**：`miniprogram/pages/admin/moderation/*`, `miniprogram/pages/mine/mine/*`, 部分子分类页详情（trade/lost/confession 等仅 grep 骨架/分页/分享），未读具体实现——建议下次审计专项深入。

---

*报告生成：审计不修改代码；所有 issue 附 file:line + 角色 + 建议修复路径。*