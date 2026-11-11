# 校园墙 · 上线部署手册

> 目标：把「校园墙」变成一个评委/用户能直接点开的网址。
> 部署包已构建并验证完成，位于 `.zcode-site/stage/`（前端产物 + 打包后的 Node 服务 + linux x64 依赖）。

## 0. 部署包现状（已验收）

| 项 | 结果 |
|---|---|
| 打包体积 | 11.3 MB 包 / 32.5 MB 解包，209 个文件 |
| 启动方式 | `bash start.sh` → 绑定 `0.0.0.0:3000`，`GET /` 返回 200 |
| 数据库 | Node 24 内置 `node:sqlite`（无原生编译依赖），库文件在 `$DATA_DIR/campus.db` |
| 图片处理 | sharp linux x64（已按目标平台预装），删缩略图生成失败时自动降级为原图 |
| 首启种子 | 库不存在时自动灌 5 个演示用户 / 20 帖 / 互评 / 举报 / 公告 |
| 验证环境 | WSL Ubuntu（Linux x64, glibc 2.39, Node 24.22）：登录 / 发帖 / 雷达 / 上传+缩略图 / WebSocket 全部 200 |

## 1. 本机直接看（零配置，最快）

```bash
cd E:\校园墙
npm run dev            # 前端 5173 + 后端 3001，开发模式
```

或跑生产包（更接近线上）：

```bash
cd E:\校园墙
bash .zcode-site/stage/start.sh      # 默认 3000 端口；Windows 上无 linux sharp 会自动降级为原图
```

演示账号：`23770001 / demo1234`（学生） · `admin / CampusWall@2026`（超管，后台 `/admin`）

## 2. Render 上线（推荐，支持 WebSocket + 常驻进程）

Render 免费实例：0.5 vCPU / 512 MB，磁盘为临时盘（实例重启会重新灌演示数据）。

步骤：

1. 把本项目推到一个 Git 仓库（私有可，Render 支持私有仓库授权）：
   ```bash
   cd E:\校园墙
   git remote add deploy <你的仓库地址>     # 或复用已有 remote
   git push deploy master
   ```
2. Render 控制台 → **New → Blueprint** → 选该仓库（仓库根目录放 `.zcode-site/deploy/render.yaml` 的内容为 `render.yaml`）。
3. 部署完成后拿到 `https://<name>.onrender.com`。

关键环境变量（蓝图里已写好，手动建服务时照抄）：

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATA_DIR` | `/opt/render/project/src/data` |
| `TRUST_PROXY` | `1` |
| `WS_ENABLED` | `1` |
| `LOG_TO_FILE` | `0` |
| `JWT_SECRET` | Render 生成的随机值 |
| `ADMIN_INITIAL_PASSWORD` | `CampusWall@2026` |

构建命令：`npm install --omit=dev --no-audit --no-fund --os=linux --cpu=x64 --libc=glibc`
启动命令：`bash start.sh` · 健康检查路径：`/`

> 注意：Render 免费实例闲置后会休眠，首次访问约 30–50 秒冷启动。答辩前先点一次预热。

## 3. ZCode Sites 上线（需等配额）

2026-11-11 实测：免费版站点配额 `1/1` 已满（唯一站点「晚安营地」），新建站点被 `3605 Account quota exceeded` 拦下；
`usage` 显示周期 `2026-11-01 → 2026-12-01`，`canDeploy: true`（可更新已有站点）。

配额恢复后一条命令即可上线（stage 已经是最终形态，无需重新构建）：

```bash
cd E:\校园墙
node "C:/Users/chen/.zcode/cli/plugins/cache/zcode-plugins-official/zcode-site/0.4.2/scripts/zcode-site.mjs" \
  deploy .zcode-site/stage --new --name "校园墙 · 校园社区" --prefix campus-wall
```

若想立刻用现有名额：`--site 2120002180268335104`（会覆盖「晚安营地」，不可恢复）。

## 4. 数据与重置

- 数据目录 `$DATA_DIR`：`campus.db`（SQLite）、`uploads/`（图片）、`backups/`（定时备份，保留 7 份）
- 想重置演示数据：删掉 `$DATA_DIR/campus.db` 后重启，首启会自动重新灌种子
- 想强制重灌：`DB_PATH=<path> node api/seed.mjs --force`（本地源码模式用 `npm run seed -- --force`）

## 5. 这台机器上的已知边界

- `cloudflared` / `localhost.run` 之类内网穿透在本机被网络策略拦（QUIC 与 7844 均不可达），无法用它临时对外发布。
- Docker Desktop 未运行，容器镜像未在本机构建；但阶段包已在 WSL 真实 Linux 上跑通，等价于容器内运行。
- Vercel 不适合本项目：无 WebSocket、SQLite 只有 `/tmp`，实时私信会失效；建议用 Render 或 ZCode Sites。
