# 变更日志

所有重要变更都记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，本项目遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 文档
- LICENSE 定为 MIT，README 同步
- 新增 SECURITY.md / CONTRIBUTING.md / CODE_OF_CONDUCT.md / CHANGELOG.md

## [1.0.0] - 2026-09-26

参赛/开源就绪版本。

### 平台形态
- **三端**：Vue 3 Web（5173）+ 原生微信小程序 + Express REST/WS API（3001），共用同一契约
- **8 大板块**：二手交易 / 失物招领 / 表白墙 / 吐槽树洞 / 互助问答 / 校园活动 / 拼车 / 组队
- **管理后台**：数据看板（KPI + 7 日趋势）、用户、内容审核、评论、举报、板块、公告、反馈、AI 助手配置

### 用户端功能
- 学号注册登录、JWT、个人中心、信誉分体系（0–120 分级权限）
- 发帖 / 草稿箱 / 24h 编辑窗、敏感词三级风险（驳回/审队/放行）
- 信息流：Tab 滑动、下拉刷新、无限加载、骨架屏
- 搜索：300ms 防抖、本地历史、热门词
- 互动：点赞、收藏、楼中楼回复、举报（24h 频控、3 人升级）
- 消息：分类 Tab、未读红点、WebSocket 单连接承载通知 + 私信
- 关注体系、我的点赞聚合页
- 失物招领智能匹配（闲置关键词打分双向通知）
- 板块订阅，每日定时摘要推送
- 二手交易双向互评，信誉分联动
- AI 助手（OpenRouter）：知识库 + 检索问答

### 可靠性与运维
- 信息流 LRU + TTL 缓存（`X-Cache` 可观测）
- SQLite WAL 在线热备份，AES-256-GCM 加密
- 滑动窗口限流，登录失败锁定
- `/api/health` 健康检查（db/storage/ws/uptime/5xx）
- PWA（manifest + SW，指纹静态优先，API 永不缓存）
- 图片上传压缩 + WebP 缩略

### 工程化
- CI：lint + typecheck + unit + build + Playwright E2E + Lighthouse + docs build
- Playwright 5 spec 核心流；隔离库 `api/e2e-test.db`
- VitePress 文档站（架构 + API 映射 + 指南）
- OpenAPI 契约（`api/openapi/`）
- ESLint 9 / vue-tsc 类型检查

### 演示与体验
- 演示账号：admin/admin123（管理员）、23770001–23770005/demo1234（用户）
- `npm run seed` 一键灌入幂等演示数据
- `npm run dev` 一键前后端联调
