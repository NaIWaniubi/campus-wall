# 贡献指南

感谢你对校园墙的关注。贡献前先读本文，帮助我们保持一致的质量与规范。

## 我们的代码风格

- 前端：**Vue 3 + TypeScript + Vite + Tailwind CSS**，Pinia 状态管理
- 后端：**Express.js + TypeScript**（tsx 运行时）
- 微信小程序：**原生 WXML/WXSS/JS**，无第三方 UI 框架
- 数据库：**SQLite（better-sqlite3）**，可替换 MySQL/PostgreSQL
- 全部包经 ESLint + TypeScript 严格模式，CI 会做 barrier

## 准备

```bash
git clone <your-fork-URL>
cd 校园墙
npm install
cp .env.example .env
npm run seed   # 可选，灌入演示数据
npm run dev    # 前后端(debug)同时启动（web 5173 / api 3001）
```

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 同步起前端（Vite）+后端（nodemon） |
| `npm run check` | vue-tsc 类型检查 |
| `npm run lint` | ESLint |
| `npm test` | Vitest 单元测试 |
| `npm run e2e` | Playwright E2E |
| `npm run build` | vue-tsc + Vite 生产构建 |
| `npm run seed` | 演示数据灌入（幂等） |
| `npm run docs:dev` | VitePress 文档站预览 |

## 提交规范（Conventional Commits）

格式： `<type>(<scope>): <subject>`

- `type`: `feat` | `fix` | `docs` | `style` | `refactor` | `test` | `chore` | `perf` | `ci` | `revert`
- `scope`：可选，如 `web / api / mini / docs / e2e`
- `subject`：q 48 内，领导下限不许以句号结尾

示例：
- `feat(api): 私信会话列表按未读置顶`
- `fix(mini): 修复发布页 toast 抖动`

## 提交 PR 前的门槛

1. `npm run lint` 通过
2. `npm run check` 类型检查通过
3. `npm test` 全部通过
4. 如涉及 UI：至少一张前后对比截图 / Lighthouse CI 观察
5. 如涉及 API：通过 `npm run e2e`（必要时同步本地 `api/e2e-test.db` 隔离）
6. 描述里说明动机 / 影响面 / 回滚方案

## 修改方向

如果想法和当前风格冲突，欢迎先开 Issue 描述：动机 / 替代方案 / 影响面。维护者会尽快响应。

## CODE_OF_CONDUCT

本仓库全体贡献者均受 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 约束。安全相关问题请参考 [SECURITY.md](SECURITY.md)。

感谢贡献！
