# 校园墙 Campus Wall

> 面向本校学生的校园信息聚合社区平台，让校园生活更有温度。

校园墙按场景分类提供**二手交易、失物招领、表白墙、吐槽树洞、互助问答、校园活动**等垂直板块，解决校园信息碎片化、传播效率低、匿名表达需求强等痛点。

- 信息高效聚合 · 纯净校园生态 · 匿名合规表达 · 轻量化体验

---

## ✨ 功能特性

### 用户端
- **账号体系**：学号注册登录、个人中心、信誉分体系（0-120 分级权限）
- **内容发布**：发帖、草稿箱（自动保存）、24 小时内编辑、敏感词实时检测
- **板块差异化字段**：二手交易（价格/新旧/联系）、失物招领（地点/时间/物品）、校园活动（时间/地点/主办方）
- **内容浏览**：首页信息流、板块 Tab 横向滑动、下拉刷新、上拉无限加载、骨架屏
- **搜索**：300ms 防抖搜索、本地搜索历史（10 条）、热门搜索词
- **互动**：点赞、收藏、楼中楼回复、热门评论标识、举报（24h 频控、3 人升优先级）
- **消息通知**：评论/点赞/系统通知分类 Tab、未读红点、全部已读
- **匿名合规**：匿名发布后台可溯源、强制匿名板块（树洞）、信誉分阈值控制

### 管理后台
- **数据看板**：6 项指标卡片、近 7 天趋势柱状图、板块/学院分布图
- **用户管理**：搜索/筛选、封禁/解封（按时长）、重置密码、调整信誉分
- **内容审核**：待审核/已通过/已驳回/已删除 Tab、通过/驳回/置顶/删除
- **评论管理**：全量评论检索、违规删除
- **举报处理**：待处理/已处理 Tab、驳回/删内容/封号
- **板块管理**：新增/编辑/删除、排序、强制匿名、需要审核
- **公告管理**：发布全站公告、用户确认后不再弹出

### 内容安全
- 前后端双重敏感词检测（高风险词直接驳回、中风险进人工审核队列）
- 信誉分阈值控制发帖/评论/匿名权限
- 频控：发帖每日上限、评论 10s 频控、举报 24h 频控
- 软删除机制，数据可追溯

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + TypeScript + Vite + Tailwind CSS + Vue Router + Pinia |
| 后端 | Express.js + TypeScript（tsx 运行时） |
| 数据库 | SQLite（better-sqlite3，开箱即用，可替换 MySQL/PostgreSQL） |
| 认证 | JWT（jsonwebtoken） |
| 密码加密 | bcryptjs |
| HTTP 客户端 | axios |
| 图标 | lucide-vue-next |
| 部署 | Vercel / 自托管 Node 服务 |

---

## 📁 目录结构

```
校园墙/
├── api/                    # 后端服务
│   ├── middleware/         # 中间件（认证）
│   ├── routes/             # 路由（auth/posts/comments/users/...）
│   ├── utils/              # 工具（JWT/响应/敏感词）
│   ├── app.ts              # Express 应用入口
│   ├── db.ts               # SQLite 初始化与连接
│   ├── server.ts           # 本地服务入口
│   └── index.ts            # Vercel Serverless 入口
├── src/                    # 前端源码
│   ├── components/         # 通用组件（PostCard/Dialog/...）
│   ├── pages/              # 页面（用户端 + admin/）
│   ├── router/             # 路由配置
│   ├── stores/             # Pinia 状态（user/app）
│   ├── utils/              # 工具（api/request/helpers）
│   ├── App.vue
│   └── main.ts
├── public/                 # 静态资源（favicon、用户上传）
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── vercel.json
└── package.json
```

---

## 🚀 快速开始

### 环境要求
- Node.js >= 18.0.0
- npm >= 9

### 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. (可选) 配置环境变量
cp .env.example .env
# 按需修改 .env 中的 JWT_SECRET 等

# 3. 启动开发服务（前后端同时启动）
npm run dev
```

启动后：
- 前端：http://localhost:5173
- 后端 API：http://localhost:3001

### 默认管理员账号
```
学号：admin
密码：admin123
```

> 普通用户请通过注册页面创建。管理员登录入口：http://localhost:5173/admin/login

---

## 📜 可用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动前端（Vite）与后端（nodemon）开发服务 |
| `npm run client:dev` | 仅启动前端 |
| `npm run server:dev` | 仅启动后端（文件改动自动重启） |
| `npm run build` | 类型检查 + 构建前端生产产物到 `dist/` |
| `npm run start` | 生产环境启动后端服务（同时托管前端） |
| `npm run preview` | 预览前端构建产物 |
| `npm run check` | TypeScript 类型检查 |
| `npm run lint` | ESLint 代码检查 |

---

## 🌐 部署

### 方式一：自托管（推荐用于校内服务器 / VPS）

```bash
# 1. 构建前端
npm run build

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，设置 JWT_SECRET 为强随机字符串，NODE_ENV=production

# 3. 启动生产服务（监听 PORT，默认 3001）
npm run start
```

生产模式下，后端会同时托管 `dist/` 下的前端产物，访问 `http://your-server:3001` 即可使用。

建议配合 **nginx 反向代理** + **PM2 进程守护**：
```bash
npm install -g pm2
pm2 start "npm run start" --name campus-wall
pm2 save && pm2 startup
```

### 方式二：Vercel 部署

1. Fork / 推送代码到 GitHub
2. 在 Vercel 导入该项目，框架选择 Vue，自动识别 `vercel.json`
3. 配置环境变量：`JWT_SECRET`（必填）、`NODE_ENV=production`
4. 部署完成后即可访问

> ⚠️ **Vercel 注意事项**：Vercel Serverless 文件系统只读，SQLite 数据库和上传的图片在每次冷启动后会丢失，仅适合演示。生产环境请使用方式一，或替换为 MySQL/PostgreSQL 与对象存储（如 S3）。

---

## ⚙️ 环境变量

| 变量名 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 后端服务端口 | `3001` |
| `JWT_SECRET` | JWT 签名密钥（生产环境**必须**修改） | `campus-wall-dev-secret-key-2026` |
| `JWT_EXPIRES_IN` | JWT 过期时间 | `7d` |
| `DB_PATH` | SQLite 数据库文件路径 | `api/data.db` |
| `NODE_ENV` | 运行环境 | `development` |

---

## 🔌 API 概览

完整 API 定义见 [`技术架构文档`](.trae/documents/技术架构文档.md)。主要接口分组：

| 模块 | 路径前缀 | 说明 |
|---|---|---|
| 认证 | `/api/auth` | 注册、登录、当前用户、修改密码、登出 |
| 帖子 | `/api/posts` | 列表、详情、发布、编辑、删除、点赞、收藏、举报 |
| 评论 | `/api/posts/:id/comments`、`/api/comments/:id/...` | 列表、发布、楼中楼回复、删除、点赞 |
| 用户 | `/api/users` | 公开信息、资料更新、我的帖子/评论/收藏 |
| 消息 | `/api/messages` | 列表、标记已读、全部已读 |
| 板块/搜索 | `/api/sections`、`/api/search` | 板块列表、搜索、热门词 |
| 草稿 | `/api/drafts` | 列表、保存、删除、清空 |
| 公告 | `/api/announcements` | 当前公告、确认、管理 |
| 上传 | `/api/upload` | 图片上传（JPG/PNG，≤5MB） |
| 管理后台 | `/api/admin` | 用户/内容/评论/举报/统计/板块管理 |

健康检查：`GET /api/health`

---

## 🗄 数据模型

共 9 张表，详见 [`技术架构文档`](.trae/documents/技术架构文档.md) 第 6 节：

`users` · `sections` · `posts` · `comments` · `likes` · `favorites` · `messages` · `reports` · `drafts` · `announcements` · `announcement_acks`

首次启动会自动建表并初始化 6 个板块和默认管理员账号。

---

## 🎨 设计规范

- **主色**：薄荷绿 `#10B981`（emerald-500）
- **辅助色**：暖橙 `#F59E0B`（点赞/热门）、珊瑚红 `#EF4444`（举报/错误）
- **中性色**：zinc 灰阶，背景 `#FAFAFA`
- **布局**：移动端优先，最大宽度 960px 居中
- **风格**：圆角胶囊按钮、卡片柔和阴影、线性图标

---

## 📝 信誉分体系

| 分值区间 | 功能权限 |
|---|---|
| 90-120 分 | 全部功能正常，支持匿名发布 |
| 80-89 分 | 正常发帖评论，不可匿名 |
| 60-79 分 | 每日限发 3 条，不可匿名，不可发二手交易 |
| 0-59 分 | 禁止发帖评论，仅可浏览 |

---

## 📄 文档

- [产品需求文档 PRD](.trae/documents/校园墙PRD.md)
- [技术架构文档](.trae/documents/技术架构文档.md)

---

## 📦 开源协议

本项目为私有项目，仅用于校内使用。
