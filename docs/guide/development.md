# 本地开发

## 环境要求

- Node.js 22+
- npm 10+

## 安装与启动

```bash
npm install
npm run dev          # 同时起前端(vite) 与后端(nodemon)
```

也可分开启动：

```bash
npm run client:dev   # 仅前端
npm run server:dev   # 仅后端
```

## 常用脚本

| 脚本 | 作用 |
| --- | --- |
| `npm run dev` | 前后端并行开发 |
| `npm run build` | 类型检查 + 前端构建 |
| `npm run check` | `vue-tsc` 类型检查 |
| `npm run lint` | ESLint 全量检查 |
| `npm run test` | Vitest 单元测试 |
| `npm run e2e` | Playwright 端到端测试 |
| `npm run seed` | 灌入演示数据 |
| `npm run docs:dev` | 本地预览本文件站 |
| `npm run docs:build` | 构建文档站 |

## 端口与约定

- 后端 HTTP 服务默认监听 `api/server.ts` 配置的端口
- 前端开发服务器为 Vite 默认端口
- 实时通道：WebSocket（会话/通知）

## 环境变量

参考仓库根目录 `.env.example`。外部依赖均为**凭据门控**，未配置时功能静默降级、不影响开发：

- `SENTRY_DSN`：错误上报
- `VAPID_*`：Web Push
- 小程序订阅消息模板 ID
- `BACKUP_ENCRYPTION_KEY`：备份加密

## 代码约定

- TypeScript 严格模式，提交前 `npm run check && npm run lint`
- 写操作保证事务一致性，失败必须返回非 200
- 提交信息遵循 `type(scope): 描述`（feat / fix / docs / chore / test …）