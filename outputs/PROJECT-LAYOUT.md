# 校园墙项目 — 绝对路径清单

> 生成时间：2026-09-23
> 项目根目录：`E:\校园墙`
> Git 分支：`master`（无 remote 配置）
> 说明：本清单为全量文件级绝对路径，排除 `node_modules/`、`.git/`、`dist/` 内部文件（仅列目录）。

---

## 0. 项目根目录

```
E:\校园墙
```

项目为**三端一体**单仓库：

| 端 | 根路径 | 技术栈 | 文件数 |
|---|---|---|---|
| Web 前端 | `E:\校园墙\src` | Vue 3 + Vite + TS + Tailwind | 64 |
| 微信小程序 | `E:\校园墙\miniprogram` | 原生小程序 | 201 |
| 后端 API | `E:\校园墙\api` | Node + Express + TS + SQLite | 75 |
| 测试 | `E:\校园墙\tests` + `api\tests` + `src\**\__tests__` | Playwright + Vitest | — |

---

## 1. 根目录配置文件

```
E:\校园墙\README.md
E:\校园墙\package.json
E:\校园墙\package-lock.json
E:\校园墙\tsconfig.json
E:\校园墙\vite.config.ts
E:\校园墙\vitest.config.mjs
E:\校园墙\playwright.config.ts
E:\校园墙\eslint.config.js
E:\校园墙\tailwind.config.js
E:\校园墙\postcss.config.js
E:\校园墙\nodemon.json
E:\校园墙\ecosystem.config.cjs
E:\校园墙\vercel.json
E:\校园墙\.lighthouserc.json
E:\校园墙\index.html
E:\校园墙\.env
E:\校园墙\.env.example
E:\校园墙\.gitignore
E:\校园墙\fix_better_sqlite3.bat
E:\校园墙\.e2e-reveal.mjs
E:\校园墙\校园墙 Web 端产品需求文档（PRD）V1.0 完整版.docx
```

## 2. Web 前端 — `E:\校园墙\src`

### 2.1 入口与全局

```
E:\校园墙\src\main.ts
E:\校园墙\src\App.vue
E:\校园墙\src\style.css
E:\校园墙\src\vite-env.d.ts
E:\校园墙\src\assets\vue.svg
E:\校园墙\src\styles\tokens.css
E:\校园墙\src\styles\themes.css
```

### 2.2 路由与状态

```
E:\校园墙\src\router\index.ts
E:\校园墙\src\stores\app.ts
E:\校园墙\src\stores\user.ts
E:\校园墙\src\stores\theme.ts
E:\校园墙\src\stores\realtime.ts
E:\校园墙\src\stores\__tests__\theme.test.ts
```

### 2.3 工具层

```
E:\校园墙\src\utils\api.ts
E:\校园墙\src\utils\request.ts
E:\校园墙\src\utils\helpers.ts
E:\校园墙\src\utils\__tests__\helpers.test.ts
```

### 2.4 组合式函数

```
E:\校园墙\src\composables\useBreakpoint.ts
E:\校园墙\src\composables\useChatSocket.ts
E:\校园墙\src\composables\useVirtualList.ts
E:\校园墙\src\composables\useWebSocket.ts
```

### 2.5 通用组件

```
E:\校园墙\src\components\AiAssistant.vue
E:\校园墙\src\components\AnnouncementDialog.vue
E:\校园墙\src\components\ChatPanel.vue
E:\校园墙\src\components\ConfirmDialog.vue
E:\校园墙\src\components\CreditBadge.vue
E:\校园墙\src\components\EmptyState.vue
E:\校园墙\src\components\FeedbackDialog.vue
E:\校园墙\src\components\PostCard.vue
E:\校园墙\src\components\PostSkeleton.vue
E:\校园墙\src\components\Skeleton.vue
E:\校园墙\src\components\SkeletonCard.vue
E:\校园墙\src\components\SkeletonList.vue
E:\校园墙\src\components\admin\charts\DistBarChart.vue
E:\校园墙\src\components\admin\charts\TrendChart.vue
```

### 2.6 页面

```
E:\校园墙\src\pages\HomePage.vue
E:\校园墙\src\pages\LoginPage.vue
E:\校园墙\src\pages\RegisterPage.vue
E:\校园墙\src\pages\PostDetailPage.vue
E:\校园墙\src\pages\PublishPage.vue
E:\校园墙\src\pages\SearchPage.vue
E:\校园墙\src\pages\SectionPage.vue
E:\校园墙\src\pages\MessagePage.vue
E:\校园墙\src\pages\ProfilePage.vue
E:\校园墙\src\pages\UserProfilePage.vue
E:\校园墙\src\pages\SettingsPage.vue
E:\校园墙\src\pages\DraftsPage.vue
E:\校园墙\src\pages\MyPostsPage.vue
E:\校园墙\src\pages\MyCommentsPage.vue
E:\校园墙\src\pages\MyFavoritesPage.vue
E:\校园墙\src\pages\MyLikesPage.vue
E:\校园墙\src\pages\MySubscriptionsPage.vue
E:\校园墙\src\pages\ForbiddenPage.vue
```

### 2.7 管理后台页面 — `E:\校园墙\src\pages\admin`

```
E:\校园墙\src\pages\admin\AdminLayout.vue
E:\校园墙\src\pages\admin\AdminLoginPage.vue
E:\校园墙\src\pages\admin\DashboardPage.vue
E:\校园墙\src\pages\admin\ContentPage.vue
E:\校园墙\src\pages\admin\CommentsPage.vue
E:\校园墙\src\pages\admin\ReportsPage.vue
E:\校园墙\src\pages\admin\FeedbacksPage.vue
E:\校园墙\src\pages\admin\UsersPage.vue
E:\校园墙\src\pages\admin\SectionsPage.vue
E:\校园墙\src\pages\admin\AnnouncementsPage.vue
E:\校园墙\src\pages\admin\AdminAiPage.vue
```

## 3. 微信小程序 — `E:\校园墙\miniprogram`

### 3.1 应用级

```
E:\校园墙\miniprogram\app.js
E:\校园墙\miniprogram\app.json
E:\校园墙\miniprogram\app.wxss
E:\校园墙\miniprogram\sitemap.json
E:\校园墙\miniprogram\project.config.json
E:\校园墙\miniprogram\project.private.config.json
E:\校园墙\miniprogram\.gitignore
E:\校园墙\miniprogram\styles\tokens.wxss
```

### 3.2 工具库 — `E:\校园墙\miniprogram\utils`

```
E:\校园墙\miniprogram\utils\request.js
E:\校园墙\miniprogram\utils\api.js
E:\校园墙\miniprogram\utils\endpoints.js
E:\校园墙\miniprogram\utils\legacy-adapter.js
E:\校园墙\miniprogram\utils\auth.js
E:\校园墙\miniprogram\utils\optimistic.js
E:\校园墙\miniprogram\utils\mock.js
E:\校园墙\miniprogram\utils\category.js
E:\校园墙\miniprogram\utils\constants.js
E:\校园墙\miniprogram\utils\share.js
E:\校园墙\miniprogram\utils\util.js
```

### 3.3 页面（每页 4 文件：.js/.json/.wxml/.wxss）

首页与主体：

```
E:\校园墙\miniprogram\pages\index\
E:\校园墙\miniprogram\pages\detail\
E:\校园墙\miniprogram\pages\publish\
E:\校园墙\miniprogram\pages\search\
E:\校园墙\miniprogram\pages\category\
```

分类频道页：

```
E:\校园墙\miniprogram\pages\category\carshare\
E:\校园墙\miniprogram\pages\category\confession\
E:\校园墙\miniprogram\pages\category\daily\
E:\校园墙\miniprogram\pages\category\help\
E:\校园墙\miniprogram\pages\category\lost\
E:\校园墙\miniprogram\pages\category\team\
E:\校园墙\miniprogram\pages\category\trade\
```

消息：

```
E:\校园墙\miniprogram\pages\message\
E:\校园墙\miniprogram\pages\message\chat\
```

我的：

```
E:\校园墙\miniprogram\pages\mine\
E:\校园墙\miniprogram\pages\mine\profile\
E:\校园墙\miniprogram\pages\mine\settings\
E:\校园墙\miniprogram\pages\mine\drafts\
E:\校园墙\miniprogram\pages\mine\feedback\
E:\校园墙\miniprogram\pages\mine\follows\
E:\校园墙\miniprogram\pages\mine\myFavorites\
E:\校园墙\miniprogram\pages\mine\myLikes\
E:\校园墙\miniprogram\pages\mine\myPosts\
E:\校园墙\miniprogram\pages\mine\notification\
```

法律条款：

```
E:\校园墙\miniprogram\pages\legal\privacyPolicy.*
E:\校园墙\miniprogram\pages\legal\userAgreement.*
```

管理端：

```
E:\校园墙\miniprogram\pages\admin\moderation\
```

### 3.4 组件 — `E:\校园墙\miniprogram\components`

```
E:\校园墙\miniprogram\components\announce-dialog\
E:\校园墙\miniprogram\components\comment-item\
E:\校园墙\miniprogram\components\conversation-item\
E:\校园墙\miniprogram\components\empty-state\
E:\校园墙\miniprogram\components\load-more\
E:\校园墙\miniprogram\components\post-card\
E:\校园墙\miniprogram\components\skeleton\
E:\校园墙\miniprogram\components\subscribe-btn\
E:\校园墙\miniprogram\components\user-row\
E:\校园墙\miniprogram\custom-tab-bar\        (index.js/json/wxml/wxss)
```

### 3.5 资源与文档

```
E:\校园墙\miniprogram\images\                (PNG 13 个 + SVG 10 个 + default_avatar/empty)
E:\校园墙\miniprogram\docs\superpowers\plans\2026-07-28-campus-wall-social-redesign.md
E:\校园墙\miniprogram\docs\superpowers\plans\2026-07-31-xiaohongshu-apple-ui.md
E:\校园墙\miniprogram\docs\superpowers\plans\2026-08-01-demo-content-fill.md
E:\校园墙\miniprogram\docs\superpowers\specs\2026-07-28-campus-wall-social-redesign-design.md
E:\校园墙\miniprogram\docs\superpowers\specs\2026-07-31-xiaohongshu-apple-ui-design.md
E:\校园墙\miniprogram\tests\frontend-static.test.js
E:\校园墙\miniprogram\tests\package.json
```

## 4. 后端 API — `E:\校园墙\api`

### 4.1 应用入口

```
E:\校园墙\api\index.ts
E:\校园墙\api\app.ts
E:\校园墙\api\server.ts
E:\校园墙\api\db.ts
E:\校园墙\api\observability.ts
E:\校园墙\api\seed-demo.ts
```

### 4.2 路由 — `E:\校园墙\api\routes`（19 个）

```
E:\校园墙\api\routes\auth.ts
E:\校园墙\api\routes\users.ts
E:\校园墙\api\routes\posts.ts
E:\校园墙\api\routes\comments.ts
E:\校园墙\api\routes\sections.ts
E:\校园墙\api\routes\announcements.ts
E:\校园墙\api\routes\trades.ts
E:\校园墙\api\routes\follows.ts
E:\校园墙\api\routes\subscriptions.ts
E:\校园墙\api\routes\conversations.ts
E:\校园墙\api\routes\messages.ts
E:\校园墙\api\routes\drafts.ts
E:\校园墙\api\routes\feedback.ts
E:\校园墙\api\routes\upload.ts
E:\校园墙\api\routes\push.ts
E:\校园墙\api\routes\wx.ts
E:\校园墙\api\routes\ai.ts
E:\校园墙\api\routes\admin.ts
E:\校园墙\api\routes\adminAi.ts
```

### 4.3 数据库层

```
E:\校园墙\api\db\index.ts
E:\校园墙\api\db\types.ts
E:\校园墙\api\db\shadow-write.ts
E:\校园墙\api\db\README.md
E:\校园墙\api\db\migrations\0001_initial.ts
E:\校园墙\api\db\migrations\0002_admin_logs.ts
E:\校园墙\api\scripts\migrate.ts
E:\校园墙\api\scripts\decrypt-backup.mjs
```

数据库文件（运行时产物）：

```
E:\校园墙\api\data.db
E:\校园墙\api\e2e-test.db
E:\校园墙\api\e2e-test.db-shm
E:\校园墙\api\e2e-test.db-wal
E:\校园墙\api\backups\campus-wall-20260823-225614.db
```

### 4.4 工具与中间件

```
E:\校园墙\api\middleware\auth.ts
E:\校园墙\api\middleware\rateLimit.ts
E:\校园墙\api\utils\ai.ts
E:\校园墙\api\utils\auth-helpers.ts
E:\校园墙\api\utils\cache.ts
E:\校园墙\api\utils\direction-filter.ts
E:\校园墙\api\utils\extra-fields.ts
E:\校园墙\api\utils\jwt.ts
E:\校园墙\api\utils\match.ts
E:\校园墙\api\utils\notification.ts
E:\校园墙\api\utils\push.ts
E:\校园墙\api\utils\response.ts
E:\校园墙\api\utils\sensitive.ts
E:\校园墙\api\utils\wx-push.ts
```

### 4.5 WebSocket — `E:\校园墙\api\ws`

```
E:\校园墙\api\ws\index.ts
E:\校园墙\api\ws\server.ts
E:\校园墙\api\ws\hub.ts
E:\校园墙\api\ws\auth.ts
E:\校园墙\api\ws\protocol.ts
E:\校园墙\api\ws\handlers\dispatcher.ts
E:\校园墙\api\ws\handlers\message.ts
```

### 4.6 存储抽象 — `E:\校园墙\api\storage`

```
E:\校园墙\api\storage\index.ts
E:\校园墙\api\storage\factory.ts
E:\校园墙\api\storage\local.ts
E:\校园墙\api\storage\s3.ts
E:\校园墙\api\storage\types.ts
```

### 4.7 定时任务与知识库

```
E:\校园墙\api\jobs\backup.ts
E:\校园墙\api\jobs\dailyDigest.ts
E:\校园墙\api\knowledge\official.md
```

### 4.8 OpenAPI 文档

```
E:\校园墙\api\openapi\document.ts
E:\校园墙\api\openapi\schemas.ts
```

### 4.9 后端单测 — `E:\校园墙\api\tests\unit`

```
E:\校园墙\api\tests\unit\auth-helpers.test.ts
E:\校园墙\api\tests\unit\direction-filter.test.ts
E:\校园墙\api\tests\unit\extra-fields.test.ts
E:\校园墙\api\tests\unit\openapi-document.test.ts
E:\校园墙\api\tests\unit\rate-limit.test.ts
E:\校园墙\api\tests\unit\sensitive-risk.test.ts
```

## 5. 测试与脚本

### 5.1 E2E（Playwright）

```
E:\校园墙\tests\e2e\helpers.ts
E:\校园墙\tests\e2e\auth.spec.ts
E:\校园墙\tests\e2e\browse.spec.ts
E:\校园墙\tests\e2e\publish.spec.ts
E:\校园墙\tests\e2e\engage.spec.ts
E:\校园墙\tests\e2e\admin.spec.ts
E:\校园墙\tests\miniprogram\static.test.ts
```

### 5.2 构建/辅助脚本

```
E:\校园墙\scripts\e2e-backend.mjs
E:\校园墙\scripts\ensure-vitest-shim.mjs
E:\校园墙\scripts\generate-pwa-icons.mjs
E:\校园墙\scripts\sandbox-exec-shim.mjs
```

## 6. 静态资源与构建产物

```
E:\校园墙\public\manifest.webmanifest
E:\校园墙\public\sw.js
E:\校园墙\public\favicon.svg
E:\校园墙\public\icons\icon.svg
E:\校园墙\public\icons\icon-192.png
E:\校园墙\public\icons\icon-512.png
E:\校园墙\public\icons\icon-maskable.svg
E:\校园墙\public\icons\icon-maskable-512.png
E:\校园墙\public\uploads\.gitkeep
E:\校园墙\dist\                (构建产物，5.8 MB)
E:\校园墙\dist\assets\
E:\校园墙\dist\icons\
E:\校园墙\dist\uploads\
E:\校园墙\test-results\        (Playwright 结果)
```

## 7. 文档与审计产物

```
E:\校园墙\docs\API-MAPPING.md
E:\校园墙\docs\ARCHITECTURE.md
E:\校园墙\miniprogram\docs\superpowers\   (见 3.5)
E:\校园墙\.trae\documents\技术架构文档.md
E:\校园墙\.trae\documents\校园墙PRD.md
E:\校园墙\.github\workflows\ci.yml
E:\校园墙\.vscode\extensions.json
E:\校园墙\.workbuddy\memory\2026-08-21.md
```

`E:\校园墙\outputs\` 目录（26 个文件）：

```
E:\校园墙\outputs\API契约映射报告.md
E:\校园墙\outputs\audit-active-trade.md
E:\校园墙\outputs\audit-admin-security.md
E:\校园墙\outputs\audit-backend.md
E:\校园墙\outputs\audit-frontend.md
E:\校园墙\outputs\audit-guest-newbie.md
E:\校园墙\outputs\audit-infra.md
E:\校园墙\outputs\audit-quality.md
E:\校园墙\outputs\major-upgrade-plan.md
E:\校园墙\outputs\major-upgrade-plan-v4.md
E:\校园墙\outputs\spec-A-web-experience.md
E:\校园墙\outputs\spec-B-miniprogram.md
E:\校园墙\outputs\spec-C-backend.md
E:\校园墙\outputs\spec-D-engineering.md
E:\校园墙\outputs\old-admin-comments.vue
E:\校园墙\outputs\old-admin-posts.vue
E:\校园墙\outputs\final-verify.ps1
E:\校园墙\outputs\fix-round-verify.ps1
E:\校园墙\outputs\leftover-e2e.ps1
E:\校园墙\outputs\leftover-verify.ps1
E:\校园墙\outputs\t1-api-test.ps1
E:\校园墙\outputs\t5-api-test.ps1
E:\校园墙\outputs\t5-seed.mjs
E:\校园墙\outputs\t6-merge-test.ps1
E:\校园墙\outputs\t5-test.db-shm
E:\校园墙\outputs\t5-test.db-wal
E:\校园墙\outputs\PROJECT-LAYOUT.md   (本文件)
```

## 8. 缓存/附属目录（非源码，勿手动改）

```
E:\校园墙\\.git\                 (28 MB，分支 master，无 remote)
E:\校园墙\node_modules\          (627 MB)
E:\校园墙\.npm-tmp-cache\        (npm 临时缓存)
E:\校园墙\.agent-teams\          (47 文件，含 archive/)
E:\校园墙\.v2c\
E:\校园墙\captures\              (空)
```

---

## 9. 关键入口速查

| 用途 | 绝对路径 |
|---|---|
| 后端启动入口 | `E:\校园墙\api\server.ts` |
| 后端应用装配 | `E:\校园墙\api\app.ts` |
| 数据库访问层 | `E:\校园墙\api\db\index.ts` |
| Web 入口 | `E:\校园墙\src\main.ts` |
| Web 路由表 | `E:\校园墙\src\router\index.ts` |
| Web 请求封装 | `E:\校园墙\src\utils\request.ts` |
| 小程序入口 | `E:\校园墙\miniprogram\app.js` |
| 小程序页面注册 | `E:\校园墙\miniprogram\app.json` |
| 小程序请求封装 | `E:\校园墙\miniprogram\utils\request.js` |
| 小程序接口表 | `E:\校园墙\miniprogram\utils\endpoints.js` |
| CI 流水线 | `E:\校园墙\.github\workflows\ci.yml` |
| Vite 构建配置 | `E:\校园墙\vite.config.ts` |
| Vercel 部署配置 | `E:\校园墙\vercel.json` |
| 生产进程配置 | `E:\校园墙\ecosystem.config.cjs` |
| 环境变量样例 | `E:\校园墙\.env.example` |
