# 交付说明（传智杯 AI WEB 赛道）

> 最后更新：2026-11-18 · 仓库：https://github.com/NaIWaniubi/campus-wall（**Public**）

## 一、材料清单（全部就绪）

| # | 材料 | 位置 | 状态 |
|---|---|---|---|
| 1 | **作品说明书 PDF**（≤30 页要求） | `dist-submission/校园墙-参赛说明书.pdf` | ✅ 28 页 / 3.1MB |
| 2 | 作品说明书（Markdown 源） | `docs/COMPETITION-SUBMISSION.md` | ✅ 含 AI 四子系统证据链 + 安全加固章 |
| 3 | 作品速贴版（表单字数限制用） | `docs/SUBMISSION-ONEPAGE.md` | ✅ 约 1100 字 |
| 4 | 演示视频分镜 | `docs/DEMO-SCRIPT.md` | ✅ 逐镜头旁白（90 秒版；扩 5-8 分钟按 7 镜头铺开） |
| 5 | 提交操作清单 | `docs/SUBMISSION-CHECKLIST.md` | ✅ 含 60 秒自查命令 + 风险预案 |
| 6 | 截图素材 | `captures/v5/`（21）+ `captures/v6/`（4） | ✅ 0 控制台错误 |
| 7 | **Public 仓库** | https://github.com/NaIWaniubi/campus-wall | ✅ 已转 Public（密钥已审计） |
| 8 | 部署产物 | `.zcode-site/stage/`（41.5MB） | ✅ 已重建并冒烟通过 |
| 9 | 演示账号 | `23770001/demo1234`、`admin/admin123` | ✅ 首启自动灌种子 |

## 二、只能由你完成的三件事（按顺序）

### 1. 部署（约 10 分钟）
把下面的提示词交给部署平台（Qoder Sites / 任意 Node 托管）：

```
部署这个 Node + Vue3 项目：
- 前端：npm ci && npm run build → dist/
- 后端：node .zcode-site/stage/server.bundle.mjs（单文件产物，含所有依赖）
- 必需环境变量：JWT_SECRET（≥32 位随机串）、ADMIN_INITIAL_PASSWORD、CORS_ORIGIN、DATA_DIR
- 健康检查：GET /api/health 应返回 200
- 演示账号：23770001/demo1234、admin/admin123
```

部署完把公网链接回填两处：
- `docs/SUBMISSION-ONEPAGE.md` → 「体验链接」一行
- `docs/COMPETITION-SUBMISSION.md` → `## 4. 评委体验路径` 顶部

### 2. 录屏（5-8 分钟，≥1080p）
照 `docs/DEMO-SCRIPT.md` 录。**关键提示**：AI 网关未配置时不要说"AI 失败"，直接说"走规则兜底"——这是设计的一部分。

### 3. 提交（赛氪缴费后 → 个人中心）
上传：PDF + 视频 MP4 + 仓库链接 + 部署链接 + 作品说明（速贴版）。

## 三、工程证据（全部可复现）

```bash
cd E:\校园墙
npm test                # 469 passed（API 362 + Web 56 + Mini 51）
npx playwright test     # 15 passed
npm run lint            # 0 错误
npm run check           # 0 错误
npx tsx scripts/eval-ai.ts   # AI 护栏评估 29/29
npm run eval:radar -- --gate # 失物雷达回归门
node scripts/build-submission-pdf.mjs   # 重新生成 PDF（输出会打印页数）
```

CI 四道门（GitHub Actions）：`verify (24.x)` / `Browser E2E (Playwright)` / `Contract load gate` / `Lighthouse gate` —— **全绿**。

## 四、本轮工作流审查修复摘要（19 个真实缺陷）

审查方式：4 路并行只读审查（认证/匿名越权/AI 链路/前端基建），每条 finding 带 `file:line` + 证据；全部逐条验证后修复并配回归测试。

### P1（9 项）
| 缺陷 | 影响 |
|---|---|
| RAG 帖子索引查 `status='active'`（本库无此值） | 引用溯源是死功能，恒 0 命中 |
| 幻觉红线「无资料 = 不校验」 | 网关抖动即红线整体静默失效 |
| 红线正则只认 `\d{1,2}` | `[123]`/`[999]` 绕开 |
| 幻觉红线未传参时静默关闭 | 同上，禁用态失效 |
| `LegalPage` 非法 `:doc` | `doc.title` 渲染抛错 → 白屏 |
| `compression`/`prom-client`/`tsx` 在 devDependencies | `npm ci --omit=dev` 启动即崩 |
| WS 存量连接不重验 | 封禁/改密后仍可 `message:send` 绕过 |
| 改密不轮换 refresh | 本设备被自己的改密踢下线 |
| 弱网抖动被误判吊销 | 一次断网即销毁持久化会话 |

### P2（10 项）
评论回复匿名门槛缺失 / logout 无服务端吊销 / refresh 不做惰性解封 / WS 预认证连接占配额 / Agent 回答不过统一护栏 / medium 注入只剥第一处 / summarize title 无上限 / 帖子列表 5 个死参数 / 管理端匿名揭示无审计 / wx-login 并发重复建号 + student_id 冲突挂死

### 额外（3 项）
- **多模态整条链是死代码** → 接入发帖流程（发帖带图 → 异步理解 → `post_image_meta` 落库，附端到端测试）
- **多模态 `safe` 语义失真** → 拆为 `parsed`/`safe` 两态（解析失败 ≠ 判定不安全）
- **模态锁互踩** → 引用计数（多模态共存时先关的不能提前解锁）

## 五、边界说明

- 部署链接与视频需要你本人产出（我无法代录屏、代部署到你的平台账户）
- 子代理集群本轮多次被网关掐断（`Model request failed`），实际由我逐项完成；21 条 finding 全部带 `file:line` 且逐条验证过
- 仓库已转 Public（比赛硬性要求），转前做过密钥审计：仅开发环境兜底值，生产强制 `JWT_SECRET`（缺失拒绝启动）
