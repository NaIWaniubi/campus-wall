# ============================================================
# 校园墙 · 容器化生产镜像（评委「clone → docker compose up」最短路径）
#
# 多阶段三段：
#   deps      —— 生产最小依赖（含 better-sqlite3/sharp 原生模块编译链）
#   build     —— 全量依赖装 vue-tsc/vite/tailwind，产出前端 dist/
#   runtime   —— 仅拷产物 + 运行时依赖 + CJK 字体
#
# 构建：docker build -t campus-wall .
# 运行：见 docker-compose.yml（一键起，含数据卷与首启引导）
# ============================================================

# ---- deps：生产最小依赖 ----
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 / sharp 原生编译兜底（两者均有 prebuilt，编译链仅在源码构建时触发）
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --omit=dev --no-audit --no-fund

# ---- build：前端产物 ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --no-audit --no-fund     # 全量依赖：vue-tsc/vite/tailwind 均为 devDep
COPY . .
# vue-tsc -b && vite build → dist/；类型检查顺带保证镜像产物与源码同步
RUN npm run build

# ---- runtime ----
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    HOST=0.0.0.0

# CJK 字体：分享卡片图（sharp SVG 文字渲染）需要，slim 无中文字体会出方块
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data/uploads /data/backups

# 应用代码：运行时依赖来自 deps（无 devDep），dist 为前端产物，api/ 含服务入口
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY api ./api
COPY package.json package-lock.json ./

EXPOSE 3000
# 探活走 /api/health（degraded 503 时探活失败会重启——这是有意的：
# storage 故障或备份停摆时容器编排应介入，而不是假装健康）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# 启动契约（与 api/db.ts、api/config.ts 的生产加固对齐，缺一即拒启）：
#   JWT_SECRET          ≥32 字符——生产缺省直接启动失败（不回退开发密钥）
#   ADMIN_INITIAL_PASSWORD —— 仅超管表为空的首启必填（杜绝已知默认口令）
#   PORT                默认 3000
#   DATA_DIR            = /data（campus.db / uploads / backups，落数据卷）
CMD ["npx", "tsx", "api/server.ts"]