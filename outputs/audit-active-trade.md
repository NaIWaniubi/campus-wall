# 校园墙 产品体验审计 —— 日活用户(C) × 交易用户(D) 视角

> 只读审计，未改动任何项目文件。范围：`src/`（Vue3 网页端）、`api/`（Express）、对照 `miniprogram/`。
> 结论先行：**后端能力基本齐备，网页端大量"最后一公里"缺失** —— 交易闭环在网页端为零、三类新通知类型不识别不跳转、24h 编辑入口不存在。

严重度定义：P0 功能断裂（核心流程走不通）｜P1 高频体验损伤｜P2 中等缺陷/一致性缺口

---

## P0 — 功能断裂

### 1.【P0】交易闭环网页端为零：无「标记已售」、无互评入口
**证据**
- 后端完整：`api/routes/trades.ts:27-43`（`POST /trades/:postId/complete` 写入 `extra_fields.soldAt`，仅作者）、`trades.ts:48-99`（`POST /trades/:postId/rate`，1-5 星 + 评语 + 信誉分 ±）、`trades.ts:109+`（`GET /users/:id/trade-ratings` 公开）。
- 前端封装好了却没人用：`src/utils/api.ts:176-181` 定义 `tradeApi.complete/rate/ratingsOf`，全 `src/` 检索 `.edit(|tradeApi|complete|/rate` —— `ratingsOf` 仅 ProfilePage 自查使用，`complete`/`rate` **零调用**。
- `src/pages/PostDetailPage.vue` 通篇（578 行）无任何 sold/已售 UI；`extraFields.price` 有展示（398-400）但没有成交状态。
- 对照组：小程序至少有售出徽标 `miniprogram/pages/detail/detail.wxml:28` `<view class="sold-badge" wx:if="{{post.extra.soldAt}}">✓ 已售出</view>`；网页端连徽标都没有（PostCard.vue / PostDetailPage.vue 均无 soldAt 渲染）。

**影响**：二手卖家在网页端无法标记售出 → 互评前置条件（`trades.ts:56` "交易完成后才能评价"）永不满足 → 信誉分闭环（好评+2/差评-3）在网页用户群体中整体失效。
**修复建议**
1. PostDetailPage：`isAuthor && post.section 为二手 && !extraFields.soldAt` 时在互动栏上方加主按钮「标记已售」→ `tradeApi.complete(postId)`，成功后刷新详情；
2. 已完成交易对参与方（作者/买家）展示互评弹窗（星级 + 200 字评语）→ `tradeApi.rate`；
3. PostCard / PostDetail 加「✓已售出」徽标（读 `post.extraFields.soldAt`，对齐小程序）。

### 2.【P0】无法查看他人主页/信誉/交易评价历史
**证据**
- 路由表 `src/router/index.ts:40-54` 只有 `/profile`（本人，requireAuth）；无 `/user/:id` 公开主页。
- `src/pages/ProfilePage.vue:36` `tradeApi.ratingsOf(userStore.user!.id)` 写死只查自己。
- `src/pages/PostDetailPage.vue:345-360` 作者头像/昵称区域无任何 click 跳转；`PostCard.vue:53-70` 同样不可点。
- 而 `GET /users/:id/trade-ratings` 明确标注"公开可查"（`trades.ts:108`），后端 `userApi.info`（api.ts:39 `GET /users/:id`）也已封装未用于他人主页。

**影响**：D 角色买家在下单/私聊前无法核实卖家信誉与历史评价——交易信任链断在源头；C 角色也无法通过点击感兴趣的人建立关注外的浏览动线。
**修复建议**：新增公开路由 `/user/:id`（匿名帖作者除外），页面复用 ProfilePage 的「交易评价」区块 + CreditBadge + 其公开发布的帖子列表；PostDetailPage 与 PostCard 的非匿名作者区绑定点击跳转。

### 3.【P0】消息中心不识别 match/digest/chat 三类通知，匹配通知点了没反应
**证据**
- 后端实际产生的通知类型：
  - `match`：`api/utils/match.ts:96-100`，`upsertNotification(userId,'match','发现 N 条可能与你相关的帖子…', matches[0].id)` —— **related_id 就是对方帖子 id**；
  - `digest`：`api/jobs/dailyDigest.ts:61`，每日摘要推送给订阅者；
  - `chat`：`api/routes/conversations.ts:137-139`，私信通知 related_id=会话 id。
- 网页 `src/pages/MessagePage.vue:23-28` 子 Tab 只有 `all/comment/like/system`；`typeMeta()`（33-37）除 comment/like 外全部落到默认铃铛图标（match/digest/chat/system 四类混在一个图标下）；`onItemClick`（57-70）**只对 comment/like 且有 postId 才跳转** —— match/digest/chat 点了仅标记已读，无任何导航。
- 对照组：小程序通知页明确支持 `match/digest` Tab 且点击 `navigateTo` 到帖子（`miniprogram/pages/mine/notification/notification.js:11-14, 52-61`）。

**影响**：失物招领匹配通知（本产品核心差异化闭环）在网页端"收到了但不知道能点"；摘要/私信通知同样死链。日活用户的召回动线全断。
**修复建议**
1. tabs 增加 `{key:'match',label:'匹配'}`、`{key:'digest',label:'摘要'}`（后端 `messages.ts:16-18` 本就按 type 过滤，零后端改动）；
2. `typeMeta` 补三类型专属图标配色；
3. `onItemClick` 扩展：`match`→`/post/${msg.postId}`（详情页已有"可能相关"匹配卡片区 PostDetailPage.vue:444-459 可承接全部候选）；`chat`→`/message?tab=chat&conv=${msg.postId}`（related_id 即 convId）；`digest`→不跳转但给出摘要展开样式区分。

---

## P1 — 高频体验损伤

### 4.【P1】帖子编辑入口完全不存在（后端明明支持 24h 内编辑）
**证据**
- 后端：`api/routes/posts.ts:382-457` `PUT /posts/:id`，24 小时窗口 + extraFields 合并语义齐全。
- 前端：`api.ts:21` `postApi.edit` 已封装，全 `src/` 零调用；`MyPostsPage.vue` 操作区只有删除（39-57、99-102）；`PostDetailPage.vue` 更多菜单只有 分享/举报/删除（311-321）；`PublishPage.vue` 是纯新建表单，无 `route.query.id` 编辑模式。
- 连带问题：rejected 帖子虽能看到驳回原因（`MyPostsPage.vue:94-97`，接口确实回了 `rejectReason`，posts.ts:66），但没有「修改后重新提交」路径——用户唯一出路是删除重发，驳回原因看了也白看。

**修复建议**：PublishPage 支持 `?edit=:id`（拉详情回填含 extraFields，提交走 `postApi.edit`）；MyPostsPage / PostDetail 对 `isMine && createdAt<24h` 帖子加「编辑」入口；rejected 帖子的原因条右侧加「去修改」按钮直达编辑模式。

### 5.【P1】草稿自动保存 30 秒新建一条，会挤掉真实旧草稿；发布成功后还会补写一条重复草稿
**证据**
- `src/pages/PublishPage.vue:66-73` 每 30s `autoSaveDraft()`；`draftApi.save` 即 `POST /drafts`（api.ts:88）。
- 后端 `api/routes/drafts.ts` 保存逻辑是纯 INSERT（无按内容/upsertKey 去重），且总数 ≥10 时 `DELETE ... ORDER BY created_at ASC LIMIT 1` **删最旧**。
- 卸载兜底 `PublishPage.vue:99-105`：`onUnmounted` 时只要表单非空就再存一次——而 `handleSubmit` 成功后 `router.replace('/post/'+id)`（228 行）触发卸载时**表单从未清空**，于是刚发布的内容又被存成一条草稿。
- 草稿恢复流同理：DraftsPage 恢复到发布页后（DraftsPage.vue:33-35），原草稿不删除，30s 后又生成一条副本。

**影响**：认真写帖 5 分钟 ≈ 10 条自动草稿 → 触发上限 → **用户真正的旧草稿被系统静默删除**（数据丢失级体验事故）；草稿箱充满重复垃圾。
**修复建议**：① `POST /drafts` 支持带 id 的更新语义（或前端记住当前 draftId 调 PUT）；② 发布成功回调里清空表单再跳转，并删除关联草稿；③ onUnmounted 补存前判断"刚发布成功"标志位。

### 6.【P1】首页铃铛未读红点几乎不会亮：无轮询、无 focus 刷新
**证据**
- `src/stores/app.ts:28-31` `fetchUnreadCount` 是唯一来源；调用方仅三处：`App.vue` 启动一次、`MessagePage` 标记已读后、`ProfilePage` 挂载时（检索 `fetchUnreadCount` 共 5 处命中，均在上述文件）。
- `HomePage.vue:179-182` 铃铛只读 `appStore.unreadCount`，整个浏览会话期间不再刷新——日活用户刷一下午首页，来私信/匹配通知也不会有任何提示。
- 附带浪费：该函数用 `GET /messages` 拉 ≤100 条完整消息列表只为取 `unreadCount`（`messages.ts:21-39`），应改用轻量 count 接口。

**修复建议**：App 级定时器（登录态 60s 轮询即可）+ `visibilitychange`/`focus` 时立即刷新；后端仿照 `GET /conversations/unread-count`（conversations.ts:148-157）加一个通知未读 count 接口。

### 7.【P1】ChatPanel 15s 轮询：每次双请求全量 100 条，后台标签页不停、多标签页翻倍
**证据**
- `src/components/ChatPanel.vue:44-50` `fetchTail` 先发 `pageSize:1` 探总数、再拉整页 100 条 → 每个 15s 周期 **2 个 HTTP 请求、最多 ~200 条消息体**，即使零新消息；根因是后端 `GET /:id/messages`（`conversations.ts:81-110`）不支持 `afterId` 增量参数。
- `onMounted/onUnmounted`（96-103）只管启停定时器，无 `document.visibilityState` 检查——切到后台标签照样轮询（挂机 1 小时 ≈ 480 请求）。
- 多标签页无任何协同（无 BroadcastChannel/storage 事件）：两个标签都停在消息页 = 轮询量直接 ×2，且各自 `emit('read')` 重复触发父级刷新。
- 未读同步本身是对的：进入会话后端清零未读（conversations.ts:97-98），`MessagePage.onConvRead`（116-122）同步列表红点与全局角标——但仅限"当前打开的这个会话"。

**修复建议**：① 后端加 `?afterId=` 增量查询，前端轮询只取增量（单请求）；② `visibilitychange===hidden` 暂停、恢复可见立即拉一次；③ 同源 `BroadcastChannel('chat-poll')` 错峰：一个标签轮询后广播时间戳，其余标签静默；④ 会话级未读变化通过现有 `unread_a/unread_b` 汇总接口低成本刷新全局角标。

### 8.【P1】聊天过程中左侧会话列表不刷新：lastMessage/lastAt 陈旧，其他会话新消息无感知
**证据**
- `src/pages/MessagePage.vue:126` `switchView` 里 `!convsLoaded.value` 才 `loadConvs()`，之后永不重拉；ChatPanel 轮询只 `emit('read')` 清当前会话红点（ChatPanel.vue:66）。
- 用户 A 与 B 聊天期间 C 发来新私信：会话列表不出现 C 的未读、顺序不变、顶部铃铛也不亮（见第 6 条），完全盲区，直到退出消息页重进。

**修复建议**：ChatPanel 轮询检测到新消息时 `emit('activity')`，父级节流地静默 `loadConvs()`；或父级自带 60s 低频刷新（配合第 7 条的全局暂停策略）。

---

## P2 — 中等缺陷 / 一致性缺口

### 9.【P2】搜索结果无分页、防抖有竞态、无筛选
**证据**：`src/pages/SearchPage.vue:66` 固定 `search(kw, 1)`，无加载更多（对比 HomePage/SectionPage 都有无限滚动）；`doSearch`（62-74）无请求序号/取消机制——连续输入时慢响应晚到会覆盖新结果；结果区也没有 SectionPage 那样的价格/时间筛选（SectionPage.vue:41-43、117-121 有现成范式，且 `postApi.list` 本就支持 keyword+sectionId 组合）。
**修复建议**：加 hasMore+滚动加载；doSearch 引入递增 requestId 丢弃过期响应；结果头部补板块/排序筛选 chips。（热搜词已正确接入：SearchPage.vue:90；关键词高亮已有且做了 XSS 转义：PostCard.vue:34-47 —— 这两点不用改。）

### 10.【P2】首页板块 Tab 无订阅状态/入口，网页也无「我的订阅」管理页
**证据**：订阅能力网页端**存在但不完整**——`SectionPage.vue:139-169, 196-207` 有完整订阅 toggle（含登录引导），后端 `subscriptions.ts:12-46` 正常；但 `HomePage.vue:190-203` 板块横滑 Tab 无任何订阅标识或快捷入口；ProfilePage 菜单（108-123）没有「我的订阅」项。而订阅的真实价值（每日摘要 digest 按 `subscriptions` 表生成，dailyDigest.ts:16-23）在网页端完全不可感知。
**修复建议**：Tab 上给已订阅板块名旁加小铃铛角标；Profile 菜单加「我的订阅」（复用 `subscriptionApi.list`，支持进板块页/一键退订）。

### 11.【P2】被驳回/下架帖子的详情页无状态解释
**证据**：`PostDetailPage.vue:45, 380-383` 只处理 `pending` 一种非公开态；`rejected/offline` 帖子作者能打开详情（posts.ts:268-273 允许作者访问），但页面无任何状态条与驳回原因（原因只在 MyPostsPage 列表里有，PostDetailPage 未渲染 `post.rejectReason`）。
**修复建议**：把 MyPostsPage 的状态条逻辑抽成小组件复用到详情页；rejected 态附驳回原因 + 「去修改」入口（衔接第 4 条）。

### 12.【P2】我的收藏一次性加载、无分页（我的点赞却有）
**证据**：`MyFavoritesPage.vue:14-28` 单次 `load()` 无 load-more；对照组 `MyLikesPage.vue:15-20` 有完整分页；后端 `users.ts:101+` favorites 接口本就支持 LIMIT/OFFSET（api.ts:43 甚至没暴露 params）。收藏超过一页即无声截断。
**修复建议**：api.ts 的 myFavorites 补 params，页面复制 MyLikesPage 的分页模式。

### 13.【P2】通知列表前后端都无分页，超 100 条历史永久不可见，「全部已读」却是全量
**证据**：后端 `messages.ts:21-25` 硬编码 `LIMIT 100` 无分页参数；前端 `MessagePage.load()`（39-49）无加载更多。用户未读的第 101 条永远刷不出来，而 `PUT /read-all`（58-61）会把包括看不见的在内全部标已读——未读数与可见列表从此对不上。
**修复建议**：后端加 page/pageSize 并返回 hasMore；前端列表加加载更多；或至少把 read-all 语义改为"仅当前已加载的已读"，避免静默吞掉未读。

---

## 附：验证过、无需整改的点（避免误伤）
- 首页热门/最新切换正常传参（HomePage.vue:107-112，sort 进 SQL 排序）。
- 网页搜索页已接 hotSearch（SearchPage.vue:89-91）且热搜词可点击发起搜索。
- 关键词高亮已实现且先 HTML 转义再替换，无 XSS 注入面（PostCard.vue:34-47）。
- SectionPage 二手/失物等差异化筛选（价格区间/时间/subType）已实现（SectionPage.vue:88-95）。
- 板块订阅 toggle 后端幂等、前端含登录引导与 loading 防抖（SectionPage.vue:153-169）。
- ChatPanel 进入会话即清未读 + 列表红点联动的基本链路是通的（conversations.ts:97-98 ↔ MessagePage.vue:116-122）。

## 优先级总览
| # | 主题 | 严重度 | 主要文件 |
|---|------|--------|----------|
| 1 | 交易闭环（已售/互评）网页端为零 | P0 | PostDetailPage.vue, api.ts |
| 2 | 无法查看他人主页与交易评价 | P0 | router/index.ts, ProfilePage.vue, PostDetailPage.vue |
| 3 | match/digest/chat 通知不识别不跳转 | P0 | MessagePage.vue |
| 4 | 24h 编辑入口缺失 | P1 | MyPostsPage.vue, PublishPage.vue, PostDetailPage.vue |
| 5 | 草稿自动保存污染 + 挤掉旧草稿 | P1 | PublishPage.vue, api/routes/drafts.ts |
| 6 | 铃铛未读红点不更新 | P1 | stores/app.ts, App.vue |
| 7 | 聊天轮询功耗/多标签翻倍 | P1 | ChatPanel.vue, conversations.ts |
| 8 | 聊天时会话列表不刷新 | P1 | MessagePage.vue |
| 9 | 搜索无分页/竞态/筛选 | P2 | SearchPage.vue |
| 10 | 首页无订阅入口、无订阅管理 | P2 | HomePage.vue, ProfilePage.vue |
| 11 | rejected 帖详情无状态解释 | P2 | PostDetailPage.vue |
| 12 | 收藏无分页 | P2 | MyFavoritesPage.vue |
| 13 | 通知无分页、read-all 吞未读 | P2 | messages.ts, MessagePage.vue |
