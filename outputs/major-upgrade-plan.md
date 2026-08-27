# 校园墙 Campus Wall 重大升级方案 v3（基于实际审计）

> **本版更新**：v2 是抽象的"4 方向升级"；v3 把它映射到 4 份审计中**真实存在的 16+ 个 P0/P1/P2 bug**，让每个 task 都有具体修复目标。配合 v3 阅读：`audit-quality.md` / `audit-admin-security.md` / `audit-guest-newbie.md` / `audit-active-trade.md` / `API契约映射报告.md`。
>
> **项目基线（v3 校准）**：
> - 三端：`api/`（Express 5 + TS + better-sqlite3 + 17 路由 + 2 jobs + 7 utils/middleware + 18 表）、`src/`（Vue 3.5 + TS 5.9 + Vite 8 + Tailwind 3 + Pinia 3 + 17 路由 + 9 admin + 8 组件）、`miniprogram/`（原生 WXML/WXSS/JS + 26 页 + 7 组件 + 5 Tab）
> - **已有能力**（避免重复造轮）：JWT 7d + 严格密钥策略、上传三重校验（扩展名+MIME+magic+sharp 重编码）、敏感词三级风险、信息流 LRU 200+TTL 60s+X-Cache 头、热度公式 `(赞×2+评×3)/(小时+2)^1.5`、板块订阅+每日摘要 cron、SQLite WAL 备份 7 份轮换、失物智能匹配（match.ts）、二手交易互评+信誉联动、AI 助手（OpenRouter + 知识库）、微信登录 code2session + 501 静默回退、匿名举报 ≥3 揭示作者、ESLint 9 flat + vue-tsc 严格
> - **历史归档**：ARCHITECTURE.md（293 行）已是产品级架构文档；`miniprogram/docs/superpowers/` 下 5 份 spec/plan（含 2026-07-28 social-redesign、2026-07-31 xiaohongshu-apple-ui、2026-08-01 demo-content-fill）

---

## 0. 升级前事实清单（16+ 个真问题，按 audit 排序）

### P0（功能断裂，4 个）
| # | 标题 | 位置 | 涉及方向 |
|---|---|---|---|
| Q1 | 交易闭环网页端为零（无「标记已售」、无互评入口） | `PostDetailPage.vue` + `api.ts:176-181` `tradeApi` 零调用 | A |
| Q2 | 无法查看他人主页/信誉/交易评价历史 | 无 `/user/:id` 路由 + `ProfilePage.vue:36` 写死自己 id | A |
| Q3 | 消息中心不识别 match/digest/chat 三类通知 | `MessagePage.vue:23-28, 33-37, 57-70` | A |
| Q4 | 小程序草稿仅本地单槽（换设备即丢）+ miniprogram/ 全目录从未 git | `publish.js:57` + `git status` | B + D |
| Q5 | 临时封禁到期永不解封 | `middleware/auth.ts:52-54` + 无 jobs 解封 | C |
| Q6 | 默认超管凭证 admin/admin123 + 登录页明文公示 | `db.ts:258-262` + `AdminLoginPage.vue:98` | C |
| Q7 | 登录/注册无速率限制 + 账号枚举 | `auth.ts:148-161`（1001 vs 1002 区分） | C |

### P1（高频体验损伤，10+ 个）
| # | 标题 | 位置 | 涉及方向 |
|---|---|---|---|
| Q8 | 24h 编辑入口完全不存在 | `postApi.edit` 零调用 + `PublishPage.vue` 无 `?edit=` 模式 | A |
| Q9 | 草稿自动保存 30s 新建一条，挤掉真实旧草稿；发布成功还补一条 | `PublishPage.vue:66-73` + `drafts.ts` 纯 INSERT 无 upsert | A + C |
| Q10 | 首页铃铛未读红点几乎不亮（无轮询、无 focus 刷新） | `HomePage.vue:179-182` + `appStore.fetchUnreadCount` 调用方仅 3 处 | A |
| Q11 | ChatPanel 15s 轮询：每次双请求全量 100 条，多标签页翻倍 | `ChatPanel.vue:44-50` + 后端无 `?afterId=` | A + C |
| Q12 | 聊天中左侧会话列表不刷新 | `MessagePage.vue:126` | A |
| Q13 | 板块名改中文子串推断差异化字段，改名即静默失效 | `PublishPage.vue:32-40` `name.includes('二手')...` | A + C（加 `kind` 字段） |
| Q14 | 字段命名双轨制（users 走 snake_case、posts/comments 走 camelCase） | `auth.ts:86,92,95` + 小程序 `api.js:270-277` 打补丁 | A + B + C |
| Q15 | 小程序 `utils/api.js` 600 行混杂 5 类职责 | `api.js:138-249` | B |
| Q16 | 缓存失效未覆盖封禁/信用分操作（最长多活 60s） | `cacheInvalidate('posts')` 缺 ban/credit | C |
| Q17 | miniprogram/utils/cache.js 模块级死代码 | 全仓 0 引用 | B |
| Q18 | section_admin 角色前后端脱节（进得去后台、调不动接口） | `admin.ts:14` 全 `superAdminRequired` + 前端放行 | C |
| Q19 | Dashboard 6 卡不可下钻、trend 三系列挤成单色 | `DashboardPage.vue:34-49` | A |
| Q20 | 小程序一键封禁 = 永久封禁且不填原因 | `moderation.js:428` 只传 `{action:'ban'}` | B + C |

### P2（中等一致性缺口，10+ 个）
| # | 标题 | 位置 | 涉及方向 |
|---|---|---|---|
| Q21 | 路由级代码分割缺失：admin 11 页打进主包 | `router/index.ts:9-15` 全静态 import | A + D |
| Q22 | web/api 零测试（除小程序 26 块静态断言） | 无 test script、无 test 依赖 | D |
| Q23 | PostSkeleton 覆盖不均 + 头像图未懒加载 | HomePage/SearchPage/SectionPage 用了，5 个我的页没有 | A + B |
| Q24 | 404 误报为"帖子不存在" + 强行返回首页 | `PostDetailPage.vue:110-113` | A |
| Q25 | 401 拦截器 redirect 丢 query | `request.ts:36` `currentRoute.value.path` 应该是 `route.fullPath` | A |
| Q26 | 注册页协议链接死的 + 禁用按钮零解释 | `RegisterPage.vue:138, 141` | A |
| Q27 | 消息中心空态死胡同 | `MessagePage.vue:204, 242` | A |
| Q28 | 草稿自动保存完全静默（无"已保存"指示） | `PublishPage.vue:80-92` 空 catch | A |
| Q29 | 后端 500 泄露 `error.message` | `app.ts:140` | C |
| Q30 | 敏感词用 `'sb'/'nm'` 子串匹配误杀正常内容 | `helpers.ts:10` + `PublishPage.vue:203-205` | A + C |
| Q31 | 信誉门槛 UX 三连伤（开关点击后才报错、强匿名先开后拦） | `PublishPage.vue:454-460, 168-175, 108-114` | A |
| Q32 | "已删除" tab 恒空（后端硬排除 deleted） | `admin.ts:124` vs `ContentPage.vue:25` | A |
| Q33 | 公告 targetUserId 半接线 | schema 有列 + 展示认，创建入口没有 | A + C |
| Q34 | 重置密码无复制按钮 + Math.random 生成 | `UsersPage.vue:272-276, 79-84` | A + C |
| Q35 | 管理操作零审计日志 | admin.ts 全部 handler 不记录操作者 | C |
| Q36 | 反馈闭环断裂（closed 状态永远没人能设） | `feedback.ts` 无 close 端点 | A + C |
| Q37 | 用户列表缺状态/角色筛选（后端早支持） | `UsersPage.vue:21-36` | A |
| Q38 | 搜索结果无分页 + 防抖竞态 + 无筛选 | `SearchPage.vue:66` 固定 page=1 | A |
| Q39 | 我的收藏一次性加载无分页 | `MyFavoritesPage.vue:14-28` | A |
| Q40 | 通知列表前后端都无分页，read-all 吞未读 | `messages.ts:21-25` 硬 LIMIT 100 | A + C |

---

## 1. 方向 A：Web 端体验深度升级（主端）— 修复 Q1/Q2/Q3/Q8/Q10/Q11/Q12/Q13/Q19/Q21/Q23/Q24/Q25/Q26/Q27/Q28/Q30/Q31/Q32/Q33/Q34/Q36/Q37/Q38/Q39/Q40

### 1.1 spec 文件
完整 spec：`outputs/spec-A-web-experience.md`（48,829 字节 / 1,460 行 / 10 task）

### 1.2 关键 task → 问题映射
| Task | 修复的 P0/P1 |
|---|---|
| T1 设计 token + 三档响应式 layout | Q13（kind 字段配套） |
| T2 Skeleton 组件体系 | Q23（5 个"我的"页补 Skeleton） |
| T3 虚拟滚动信息流 | Q40（长列表性能） |
| T4 WebSocket 客户端 | Q3（match/digest 通知实时） + Q10（轮询替代） + Q11（增量） + Q12（活动广播） |
| T5 Dashboard 可视化 | Q19（卡片下钻 + 趋势 3 系列 + 板块/学院分布） |
| T6 暗色模式 | 体验提升（无直接 audit 命中） |
| T7 PWA | 体验提升（无直接 audit 命中） |
| T8 a11y 全面审计修复 | Q24（404 误报） + Q25（401 redirect 丢 query） + Q26 + Q27 + Q28 + Q30 + Q31 |
| T9 性能优化 | Q21（路由懒分包：admin 9 页全部动态） + Q23（头像 lazy） |
| T10 回归 + 文档 + LHCI | Q40（read-all 改仅当前已读） |

### 1.3 关键 P0 修复目标（必须在 M3 结束前）
- **Q1 交易闭环**：PostDetailPage 增加「标记已售」按钮（仅作者 + 二手板块 + !soldAt）→ `tradeApi.complete(postId)`；交易双方弹互评窗 → `tradeApi.rate`；PostCard/PostDetail 加「✓ 已售出」徽标
- **Q2 他人主页**：新增 `/user/:id` 路由（匿名作者跳脱敏主页）→ 复用 ProfilePage「交易评价」区块 + CreditBadge + 其公开发帖
- **Q3 通知识别**：MessagePage tabs 增加 match/digest/chat；typeMeta 补三类型；onItemClick 扩展（match→帖子详情、chat→会话、digest→不跳转但样式区分）

### 1.4 关键 P1 修复目标（M3-M4 期间）
- Q8 24h 编辑入口（`PublishPage.vue` 支持 `?edit=:id` + MyPostsPage 加按钮 + 驳回原因条加「去修改」）
- Q10 首页轮询（App.vue 已 30s 轮询，但首页 onShow 不触发；改为 onShow 触发 + 移除 ProfilePage/MessagePage 多余调用）
- Q11 增量拉取（与 C-WS 协同：先关掉 15s 双请求 → 用 WS push；fallback 路径用 `?afterId=`）
- Q12 活动广播（WS 收消息时 emit('activity')，父级节流 loadConvs）

---

## 2. 方向 B：微信小程序现代化 — 修复 Q4/Q15/Q17/Q20

### 2.1 spec 文件
完整 spec：`outputs/spec-B-miniprogram.md`（51,952 字节 / 1,207 行 / 8 task）

### 2.2 关键 task → 问题映射
| Task | 修复的 P0/P1 |
|---|---|
| T1 design token 抽出 | Q14（token 化后用同一套 design system 跟 Web 对齐） |
| T2-T5 复用 2026-07-31 已有 plan | 视觉对标小红书 + Apple（无 audit 命中，纯体验） |
| T6 utils/api.js 拆 4 文件 | Q15（核心 P1-5：5 类职责拆 4 文件，单文件 ≤ 250 行） + Q14 顺带收敛 snake/camel 兼容补丁 |
| T7 Skeleton + 8 大页挂载 | Q4 草稿上传同步思路对齐：草稿进云（drafts 路由）+ 跨设备可见 |
| T8 低端机 perf-low + 启动优化 | Q17 删除死代码 `utils/cache.js` |

### 2.3 关键 P0/P1 修复目标（M3 前）
- **Q4 草稿云同步**：把 publish.js:57 的 `wx.setStorageSync('publishDraft')` 切到 `POST /drafts`（API 已存在），DraftsPage 在小程序端也加；与 A-方向 Q9 协同修复（drafts.ts 加 upsert 语义）
- **Q15 api.js 拆分**：4 文件（request / legacy-adapter / endpoints / auth），api.js 留 30 行 facade；legacy-adapter 后续逐个消化（不需要一次性删）
- **Q20 小程序一键封禁**：moderation.js 改 `wx.showModal({editable:true})` 收原因 + `wx.showActionSheet` 选时长

### 2.4 范围
- 复用 2026-07-31 xiaohongshu-apple-ui spec 的 5 任务视觉方向
- 不引入 Taro/uni-app（README 锁栈）
- 不重做 8 个分类子页 UI
- 不改后端契约

---

## 3. 方向 C：后端能力补完 — 修复 Q5/Q6/Q7/Q9/Q11/Q13/Q14/Q16/Q18/Q29/Q30/Q33/Q35/Q36/Q40

### 3.1 spec 文件
完整 spec：`outputs/spec-C-backend.md`（54,470 字节 / 1,581 行 / 12 task）

### 3.2 关键 task → 问题映射
| Task | 修复的 P0/P1 |
|---|---|
| T1 storage 抽象 | Q4 草稿云端图片走 storage；不直接修 audit 命中 |
| T2 db 抽象 | 架构性升级，无 audit 命中 |
| T3 PG 迁移 | 架构性升级，无 audit 命中 |
| T4 WS 服务 | Q3 通知实时 + Q11 增量 |
| T5 私信切 WS | Q11/Q12 私信实时 |
| T6 离线消息队列 | Q11 弱网补发 |
| T7 OpenAPI + zod | 契约零漂移；不直接修 audit 命中 |
| T8 敏感词 Aho-Corasick | Q30 `'sb'/'nm'` 子串误杀 + 高亮定位 |
| T9 推送抽象 | Q3 多通道 |
| T10 限流滑动窗口 | Q7 登录/注册限流 + 区分维度 |
| T11 健康检查 + 监控 | Q35 审计日志 + Q29 500 不再泄露 message |
| T12 备份加密 + 异地 | Q5 解封任务（authRequired 前惰性 `UPDATE ... ban_until <= now`）+ Q5 完整解封 cron |

### 3.3 关键 P0 修复目标（M1-M2 必须先做，否则安全基线不达标）
- **Q5 临时封禁到期解封**：T12 阶段 1 一行 SQL 惰性解封（authRequired/authOptional/登录处各加一行），T12 阶段 2 完整 jobs/unban.ts cron；同步在 README P0-2 标注
- **Q6 默认超管凭证**：T11 阶段 1 改 `db.ts:258-262` 种子密码为 env 注入（`ADMIN_INITIAL_PASSWORD`），未配置则生成随机密码打印到服务端日志一次；首次登录强制改密
- **Q7 登录/注册限流 + 账号枚举**：T10 阶段 1 引入 `express-rate-limit`（`/api/auth/login`、`/register` 收紧 15 分钟 10 次），登录失败统一文案「学号或密码错误」

### 3.4 关键 P1 修复目标（M3-M4）
- Q9 草稿 upsert 语义（drafts.ts 加 `id` 更新 / `upsertKey` 去重）
- Q13 sections 加 `kind` 字段（前端 PublishPage 改用 kind 推断而非 name.includes）
- Q14 字段命名统一（auth.ts/users.ts 序列化处统一转 camelCase，删小程序 normalizeUser 兼容补丁）
- Q16 缓存失效覆盖（banUser/adjustCredit 后调 `cacheInvalidate('posts')`）
- Q18 section_admin 角色二选一（A 真实现 / B 前端移除放行）
- Q29 500 不再泄露 message（生产统一文案 + 错误码，细节进日志）
- Q35 admin_logs 表（封禁/解封/重置密码/信誉调整/审核/举报/删评论 handler 内一行插入）
- Q40 messages 分页参数 + read-all 仅当前已读

---

## 4. 方向 D：工程治理与可观测性 — 修复 Q4(miniprogram 全目录未 git) + Q14(契约管理) + Q22(零测试) + 0 噪声报警

### 4.1 spec 文件
完整 spec：`outputs/spec-D-engineering.md`（45,652 字节 / 1,376 行 / 10 task）

### 4.2 关键 task → 问题映射
| Task | 修复的 P0/P1 |
|---|---|
| T1 Vitest 配置 + 单测骨架 | Q22（基础） |
| T2 前端 utils/stores 单测 | Q22（Q14 字段命名收敛后单测固守） |
| T3 后端 utils/middleware 单测 | Q22（重点测 extraFields 合并语义 + direction 过滤 + auth 三档守卫 — audit-quality P2-8 三点） |
| T4 Playwright 配置 + E2E 骨架 | Q22 |
| T5 E2E 10 关键流程 | Q22（注册/登录/发帖/评论/点赞/关注/私信/管理 4 操作） |
| T6 miniprogram frontend-static.test 30+ 用例 | Q4（git 兜底 + api.js 拆分后回归） + Q15 拆分回归 + Q17 死代码检测 + Q20 一键封禁参数化 |
| T7 GitHub Actions | Q4（`git add miniprogram/` + commit） + 全量 CI 闸门 |
| T8 Sentry | Q29 500 → Sentry 报警，零噪声规则 |
| T9 LHCI | A-10 + C-11 协同 |
| T10 VitePress 文档站 | 把 4 份 audit + 4 份 spec + 主 plan 全部收入 docs/ |

### 4.3 关键 P0 修复目标（M0 立即可做，5 分钟）
- **Q4 git 兜底**：`git add miniprogram/ api/ src/ docs/ && git commit -m "chore: track all 3-tier sources in vcs"`；`.gitignore` 加 `api/backups/` 显式行（替代 `*.db` 通配）

### 4.4 关键 P1 修复目标（M1-M2 强制）
- Q22 三块最易回归单测（audit P2-8 已指明）：
  1. `extraFields` 合并语义（posts.ts:388-440，浅合并，漏带 direction 会把帖子从筛选 tab 抹掉）
  2. `direction` 过滤生效条件（posts.ts:139-148，仅当失物板块生效）
  3. `auth` 三档守卫（middleware/auth.ts：无 token/过期/banned/section_admin）

### 4.5 硬要求
- CI 全绿：lint + typecheck + test + e2e + build + lighthouse ≤ 12min
- PR 平均时长 ≤ 8min
- Sentry 0 噪声（错误聚合后 ≤ 5 类）
- LHCI 0 红线

---

## 5. 4 方向依赖与执行序

```
T0（立即 5 分钟）  ───  D-0 git 兜底 + .gitignore 修整
                    │
M1（第 2 周末）   ───  D-1/2/3（单测骨架 + 三块关键单测）
                    └─ C-M0：解封惰性 SQL + 默认超管 env 注入 + 登录限流 + 错误码映射
                    └─ A-1（响应式 layout 基础）
M2（第 4 周末）   ───  D-4/5/6（E2E + 小程序 30+ 用例）
                    └─ C-T1/2（storage + db 抽象 + 双 driver）
                    └─ A-2/3（Skeleton + 虚拟滚动）
                    └─ B-T1/2/3（design token + 已有 2026-07-31 plan 任务 1-3）
M3（第 6 周末）   ───  A-T4（WS 客户端，前提 C-T4 服务端）
                    └─ C-T4/5/6（WS 服务 + 私信切 WS + 离线队列）
                    └─ A-Q1/Q2/Q3 P0 修复
                    └─ B-T6（api.js 拆 4 文件 + Q4 草稿云端）
M4（第 8 周末）   ───  A-T5/6（Dashboard 可视化 + 暗色）
                    └─ C-T7/8/9（OpenAPI + 敏感词 + 推送）
                    └─ A-Q8/Q10/Q11/Q12 P1 修复
                    └─ B-T4/5（2026-07-31 任务 4-5）
M5（第 10 周末）  ───  A-T7/8（PWA + a11y）
                    └─ C-T10/11/12（限流 + 健康检查 + 备份）
                    └─ A-Q21 路由懒分包
                    └─ B-T7/8（Skeleton + 低端机 + 启动优化）
M6（第 12 周末）  ───  D-7/8/9/10（CI + Sentry + LHCI + VitePress）
                    └─ A-T9 性能优化
                    └─ C-T3 PG 迁移（可选，依部署决策）
M7（第 14 周末）  ───  回归 + 文档 + 灰度发布 + 收尾
```

---

## 6. 风险登记（按"修 bug"视角重新校准）

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Q5/Q6/Q7 安全基线修复破现有登录流 | 中 | 高 | 灰度：先在 staging 全量，跑 3 天监控 401/403/429 比例无异常后切生产 |
| Q9 草稿 upsert 改写后旧草稿丢失 | 中 | 高 | drafts.ts 双轨期（INSERT 保留 + 新增 upsertKey 唯一索引），老草稿读老路径 |
| Q14 字段命名统一破小程序端 | 高 | 高 | legacy-adapter 保留 snake/camel 兼容兜底；逐步消化非核心页面 |
| Q22 三块单测发现真实回归 | 中 | 中 | 立刻修 + 加测试，不放过 |
| WS 升级破坏老客户端 | 中 | 高 | REST 兜底永远保留；WS 与 REST 共存 2 周 |
| Sentry 接入初期噪声 | 高 | 中 | 错误聚合规则 + 阈值告警 + M6 前手动 silence 已知 issue |
| LHCI 预算反复超标 | 中 | 中 | 单 PR 限额 + 阻塞合入 |
| 工期延误 | 中 | 中 | M3 硬截止：A-Q1/Q2/Q3 + C-Q5/Q6/Q7 是 P0，必须完成；其余可推到 M4+ |

---

## 7. 升级前必读（与 4 份审计对齐）

本方案的 4 方向 + 40+ 个具体问题全部源自以下 4 份审计 + 1 份契约报告 + 1 份架构文档：
- `outputs/audit-quality.md`（工程质量，13 条 P0-P3）
- `outputs/audit-admin-security.md`（管理后台 + 安全，15 条 P0-P3）
- `outputs/audit-guest-newbie.md`（游客 + 新用户，15 条 P0-P2）
- `outputs/audit-active-trade.md`（日活 + 交易，13 条 P0-P2）
- `outputs/API契约映射报告.md`（小程序 → 新后端契约差异，10 条工作清单）
- `docs/ARCHITECTURE.md`（架构与机制详解，9 节）
- `README.md`（产品级说明，295 行）

**升级不是"现代化"，是"修这 40+ 个具体问题，并配套工程化能力"**。每条问题都已挂到具体方向 + 具体 task 上，进度可追踪。

---

## 8. 不在本方案范围（明确拒绝，与 v2 一致）
- 微服务化 / 服务网格 / SSR / i18n
- 切换图标库 / 引入新 UI 框架
- 短信/微信模板消息 / 群聊 / 语音 / 视频
- 校园卡 / 一卡通 / 跨校联盟
- k8s / Docker 编排 / 混沌工程 / A/B 测试平台
- 实时音视频

---

## 9. 文件清单（本方案产出）

| 文件 | 字节 | 行数 | 内容 |
|---|---|---|---|
| `outputs/major-upgrade-plan.md` | 本文件 | - | 主方案（v3，基于审计） |
| `outputs/spec-A-web-experience.md` | 48,829 | 1,460 | 方向 A 完整 spec（10 task + 代码） |
| `outputs/spec-B-miniprogram.md` | 51,952 | 1,207 | 方向 B 完整 spec（8 task + 代码） |
| `outputs/spec-C-backend.md` | 54,470 | 1,581 | 方向 C 完整 spec（12 task + 代码） |
| `outputs/spec-D-engineering.md` | 45,652 | 1,376 | 方向 D 完整 spec（10 task + 代码） |
| `outputs/audit-quality.md` | 已存 | - | 工程质量审计（13 条） |
| `outputs/audit-admin-security.md` | 已存 | - | 管理后台 + 安全审计（15 条） |
| `outputs/audit-guest-newbie.md` | 已存 | - | 游客 + 新用户审计（15 条） |
| `outputs/audit-active-trade.md` | 已存 | - | 日活 + 交易审计（13 条） |
| `outputs/API契约映射报告.md` | 已存 | - | 契约映射 + 10 条工作清单 |
| `docs/ARCHITECTURE.md` | 已存 | 293 行 | 架构与机制详解 |

---

## 10. 下一步

T0 立即可做（5 分钟）：`git add miniprogram/ api/ src/ docs/ && git commit` + `.gitignore` 修整。

M1 首批 task：D-1 单测骨架 + D-2 前端单测 + D-3 后端单测（含 audit P2-8 三块）+ C-M0 安全 P0 三件套 + A-1 响应式 layout。

回 T0 确认即可启动；回 "出 M1 详细 plan" 可生成首 2 周逐日任务列表。
