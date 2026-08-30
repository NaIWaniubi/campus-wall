# 校园墙重大升级 v4（基于盘点报告）

> **历史 commit 已修 ~30 条**，剩余 24 未修 + 2 部分修 = 26 条。本版方案专攻"还差什么"。

## 0. 当前落地（9/40 task 已 commit）

```
8b29b75  docs(major-upgrade): add v3 master plan + 4 executable spec
7578727  feat(web-a-t1): 设计 token + 三档响应式 + 主题 store       [A ✅]
ec958e8  feat(web-a-t2): Skeleton 原子 + 业务骨架 + 5 个我的页接入    [A ✅]
4e12780  feat(backend-c-t1): storage 抽象 + local/s3 双实现           [C ✅]
0234317  feat(backend-c-t2): db 抽象 (kysely + 18 表 + sqlite/pg)     [C ✅]
fa08994  feat(backend-c-t3): PG 迁移 (kysely 18 表 migration)         [C ✅]
04c2ed6  feat(backend-c-t4): WS server + JWT hello + 会话订阅          [C ✅]
5fa57ac  style(mini-b-t1): design token 抽出                          [B ✅]
ce97479  style(mini-b-t2): 全局视觉系统 active 反馈                   [B ✅]
1390b29  style(mini-b-t3): 首页 header 轻量化                        [B ✅]
```

D 方向 vitest/happy-dom 已入 package.json 但未 commit；A T3 虚拟滚动未做。

## 1. 盘点结果（56 条 audit）

| 类别 | 数量 | 详情 |
|---|---|---|
| ✅ 已修 | 30 条 | 全部 P0 + 大部分 P1 |
| ⚠️ 部分修 | 2 条 | active-trade P1-5 草稿 / admin-security P2-8 小程序一键封禁 |
| ❌ 未修 | 24 条 | 见下表 |

## 2. 24 条未修 + 2 条部分修 = 26 条（按"日活影响 × 改动成本"排）

| 优先级 | 问题 | 审计出处 | 修复方向 | 估时 |
|---|---|---|---|---|
| 🔴1 | P2-13 通知无分页 + read-all 吞未读 | active-trade | C-后端 messages.ts + Web MessagePage | 半天 |
| 🔴2 | P1-4 详情页 404/网络错区分（"不存在"谎报 + 强制回首页） | guest-newbie | Web PostDetailPage.vue | 1h |
| 🔴3 | P2-11 rejected 详情页无状态条 + 去修改入口 | active-trade | Web PostDetailPage.vue | 1h |
| 🔴4 | P2-10 首页无订阅入口 + 无订阅管理页 | active-trade | Web HomePage + ProfilePage + 新 MySubscriptionsPage | 半天 |
| 🔴5 | P1-6 401 拦截器 query 丢参 | guest-newbie | Web src/utils/request.ts | 半小时 |
| 🟡6 | P2-9 搜索无分页/竞态/筛选 | active-trade | Web SearchPage.vue | 半天 |
| 🟡7 | P2-12 我的收藏无分页 | active-trade | Web MyFavoritesPage.vue + api.ts | 1h |
| 🟡8 | P2-15 + admin-security P3-15 后端 500 泄露 + MulterError HTTP 200 | guest-newbie / admin-security | api/app.ts | 1h |
| 🟡9 | P2-11 注册页协议链接死 + 禁用按钮无解释 | guest-newbie | Web RegisterPage.vue | 1h |
| 🟡10 | P2-12 消息中心空态死胡同 | guest-newbie | Web MessagePage.vue | 1h |
| 🟡11 | P2-13 游客举报引导登录 | guest-newbie | Web PostDetailPage.vue | 1h |
| 🟡12 | P2-14 用户列表状态/角色筛选 | admin-security | Web UsersPage.vue | 1h |
| 🟡13 | P2-12 审计日志 | admin-security | api/admin.ts + 新表 admin_logs | 半天 |
| 🟢14 | P0-1 miniprogram/ 入库（gitlink 修复 ✅ 已自动达成） | quality | — | 0 |
| 🟢15 | P0-2 api/backups/ 显式 ignore | quality | .gitignore 已含 `api/backups/` ✅ | 0 |
| 🟢16 | P1-4 字段命名双轨（snake/camel） | quality | api/auth.ts + api/users.ts 统一 camelCase | 半天 |
| 🟢17 | P1-5 小程序 api.js 翻译层收敛 | quality | miniprogram/utils/api.js 拆 4 文件 | 1 天 |
| 🟢18 | P2-6 路由级代码分割（admin 9 页懒分包） | quality | src/router/index.ts | 半小时 |
| 🟢19 | P2-8 web/api 零测试 | quality | vitest 配好 + 3 块最易回归单测 | 1 天 |
| 🟢20 | P2-9 PostSkeleton 覆盖 + 头像 lazy | quality | 5 个"我的"页（已大部分在 A T2 完成）+ PostCard 头像加 lazy | 1h |
| 🟢21 | P3-10 AI 双通道 401 处理 | quality | AiAssistant.vue 改用 request.ts | 1h |
| 🟢22 | P3-11 miniprogram cache.js 死代码删除 | quality | 直接删 | 5 分钟 |
| 🟢23 | P3-13 工作区杂物清理 | quality | `git clean -nd` + 收 .gitignore | 5 分钟 |
| ⚠️24 | 部分修-草稿挤掉 | active-trade | api/routes/drafts.ts upsert + PublishPage 清理 | 1h |
| ⚠️25 | 部分修-小程序一键永久封禁 | admin-security | miniprogram/pages/admin/moderation/moderation.js | 1h |
| 🟢26 | A-T3 虚拟滚动信息流（spec 中断） | A spec | `@tanstack/vue-virtual` + HomePage | 1h |

## 3. 第二批 subagent 派工

按"互相无依赖 + 同区域归并"原则分 4 个 subagent：

### Subagent 2-A：Web 体验 P1/P2 集中修（8 条）
- 🔴2 详情页 404/网络错区分
- 🔴3 rejected 详情页状态条
- 🔴4 首页订阅入口 + MySubscriptionsPage
- 🔴5 401 拦截器 query
- 🟡6 搜索分页/竞态/筛选
- 🟡7 收藏分页
- 🟢19-a PostCard 头像 lazy
- 🟢26 A-T3 虚拟滚动

### Subagent 2-B：Web 管理 + 注册 + 消息 + 举报（5 条）
- 🟡9 注册页协议链接
- 🟡10 消息中心空态 CTA
- 🟡11 游客举报引导登录
- 🟡12 用户列表状态/角色筛选
- 🟢21 AI 助手 401 处理

### Subagent 2-C：后端错误处理 + 通知分页 + 草稿 upsert（4 条）
- 🔴1 通知分页 + read-all 仅当前已读
- 🟡8 后端 500 不泄露 + MulterError 真 400
- 🟡13 admin_logs 审计日志
- ⚠️24 drafts upsert 语义

### Subagent 2-D：工程治理 + 清理（5 条）
- 🟢16 字段命名统一 camelCase（auth.ts + users.ts）
- 🟢17 小程序 api.js 拆 4 文件
- 🟢18 路由懒分包
- 🟢19-b vitest 三块单测（extraFields 合并 / direction 过滤 / auth 守卫）
- 🟢22 miniprogram cache.js 死代码删除
- 🟢23 工作区杂物清理

**剩余 4 条跨大改动（A T3 单独已分到 2-A；字段统一+api 拆分+测试+清理由 2-D 一并做）**。

## 4. 实际不做的（已在历史或本批覆盖）

- 🟢14 P0-1 miniprogram/ 入库：B subagent 顺手修了 gitlink（miniprogram 转回普通目录树）
- 🟢15 P0-2 .gitignore：已含 `api/backups/` 一行
- ⚠️25 部分修-小程序一键封禁：本批未分（可后续单独修）

## 5. 总进度预期

- 当前：9/40 commit
- 第二批 4 subagent：~22 条新 commit（按"1 条 = 1 commit"）
- 第二批结束：**~31/40 commit**，剩 9 条 = A T4-10 + B T4-8 + C T5-12 + D T4-10 中无 audit 命中的体验类 + 部分修小程序一键封禁
- 第三批：剩余 9 条推完

## 6. 风险控制

- 4 subagent 并行可能再撞 npm 锁死。**应对**：subagent 指令要求"装新包前先 `npm install --prefer-offline --no-audit`；不行就跳过依赖改动，只改代码"
- 单 subagent 容量 ~8 commit，3 个 audit 类重改可能 1 subagent 做不完 → 报告里明确"未完成清单"，我立即补第二批 subagent
- 已落地 commit 不动；冲突时优先 subagent 让步（避免覆盖）

## 7. 进度追记

### 第三批（2026-08-30 已完成，12 commit）
- ✅ 🟢21 AI 助手 401 → `bad1fb5`（登出 + redirect + 错误分支区分）
- ✅ C-T5 私信切 WS 双路分发 → `54ddb55`（顺带补齐 WS 路径漏掉的未读自增与 chat 通知）
- ✅ C-T6 增量拉取 → 复查发现 `?afterId=` 已在 conversations.ts 实现，未重复做
- ✅ C-T6 通知 WS 广播 → `2cb09c7`（NotificationPush 帧）
- ✅ A-T4 Web WS 客户端 → `865fca0` + `d50e316`（三件套 + ChatPanel/MessagePage 接入 + 轮询降级）
- ✅ A-T5 Dashboard → `f2e5351`（echarts 趋势折线 + 双分布条形图；卡片下钻 6385bfd 已达成）
- ✅ A-T6 暗色 → `efbf5f7`（灰阶语义重映射 + SettingsPage 三态切换）
- ✅ C-T10 限流 → `a07f3d8`（滑动窗口，IP/学号/UA 维度，写端点挂载 + 单测）
- ✅ C-T11 健康检查 → `0cc7202`（db/storage/ws 探测 + 5xx 计数）
- ✅ D-T2/D-T3 前端单测 → `619260e`（helpers/theme 13 用例）
- ✅ A-T9 vite 分包 → `5b36c1e`（echarts 独立 chunk 492KB，Dashboard 业务块 496KB→<12KB）
- ✅ B-T8 小程序骨架屏 → `57f351f`（三形态组件 + 8 处接入 + 按需注入）
- 备注：4 个并行 subagent 全因基础设施问题失败（并发上限×2 / 模型请求失败 / captcha），全部工作由主会话完成

### 第四批（2026-08-30 已完成，6 commit）
- ✅ C-T8 敏感词 → `ac8c5c2`（后端 ASCII 词边界，修复 USB 被 sb 误杀；findSensitiveHits 高亮预留 + 5 用例）
- ✅ D-T7 CI → `8081933`（GitHub Actions：lint/check/test/build）
- ✅ D-T6 小程序静态断言 → `1a5585f`（30 用例 + vitest mini project）
- ✅ A-T7 PWA → `a5e02c3`（manifest + 保守 SW + sharp 生成图标）
- ✅ C-T12 备份加密 → `838eea1`（BACKUP_ENCRYPTION_KEY AES-256-GCM + 解密脚本，回路已验证）
- ✅ A-T10 文档收尾 → README 能力清单更新 + 本追记

### 仍未做（后续批次候选）
- C-T7 OpenAPI + zod（大工程，建议单独批）
- C-T9 推送抽象 / Web Push（需外部服务与 env）
- D-T4/D-T5 Playwright E2E（需装包 + 浏览器下载）
- D-T8 Sentry / D-T9 LHCI（外部服务 / Chrome 环境）
- D-T10 VitePress 文档站（需新依赖；文档暂由 README 承接）
- B-T4/T5 视觉任务（2026-07-31 spec，主观大改）
- ⚠️ 新发现：小程序草稿仍为本地单槽（publish.js:57 wx.setStorageSync），Q4 的「草稿云同步」只做了后端 upsert 与 Web 端，小程序侧切 /drafts 未做
- ⚠️ 新发现：6 个 eslint warning（s3.ts/shadow-write.ts 失效 eslint-disable 指令），历史遗留非阻塞
