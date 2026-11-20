# 系统架构

## 三端一体单仓库

本仓库为**单仓库多端**结构，Web 前端、微信小程序、后端 API 共存，共用一套接口契约。

```
src/          Web 前端（Vue 3 + Vite + TS）
miniprogram/  微信小程序（原生）
api/          后端 API（Node + Express + TS + SQLite）
tests/        跨端测试（Playwright E2E、小程序静态断言）
scripts/      构建与辅助脚本
docs/         文档站（VitePress）
```

## 后端分层

| 目录 | 职责 |
| --- | --- |
| `api/routes` | 路由模块（posts / auth / trades / messages / admin 等） |
| `api/middleware` | 鉴权、限流、错误处理等中间件 |
| `api/utils` | jwt、敏感词、推送、缓存等工具 |
| `api/ws` | WebSocket 层（hub / server / handlers） |
| `api/storage` | 存储抽象（local / s3 / factory） |
| `api/db` | 数据库层（better-sqlite3，api/db.ts 为唯一事实源） |

## 请求链路

1. 客户端（Web / 小程序）经 `request` 封装发起 HTTP 请求，携带 JWT；
2. 后端 `auth` 中间件校验令牌与账号状态（含临时封禁到期惰性解封）；
3. 路由处理业务，写操作在事务中保证一致性，失败以非 200 返回；
4. 需要实时性的场景（私信、通知）经 WebSocket 双路分发；
5. 出错时统一错误响应 + 5xx 计数暴露在 `/api/health` 供监控轮询。

## 可观测与运维

- `/api/health`：db / storage / ws 探测与 5xx 计数
- 滑动窗口限流：按 IP / 学号 / UA 维度，写端点挂载
- 备份：AES-256-GCM 加密落盘（`BACKUP_ENCRYPTION_KEY` 门控）
- 外部依赖全部**凭据门控**：Sentry / Web Push / 小程序订阅消息，未配置时静默降级

## 接口契约

后端以 **zod 作为唯一契约源**，生成 OpenAPI 文档并通过 Swagger UI 暴露，保证三端字段一致。