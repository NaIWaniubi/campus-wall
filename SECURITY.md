# 安全策略 / Security Policy

本项目面向校园用户，涉及实名/匿名发布、私信、举报溯源与第三方 AI 调用，敏感面较广。
以下安全机制是我们主动维护的对象，也是路线图的一部分：

## 支持范围（我们持续投入的位置）

| 位置 | 机制 |
|---|---|
| `/api/auth` | 双 token 认证：access 2h + refresh 7d；refresh 单次消费（jti 重放检测）；改密/封禁递增 `token_version`，REST 与 WS 双通道即时吊销；登录/注册失败按 IP + 账号双维度限流 |
| `/api/upload` | 类型白名单、解压炸弹防护（像素上限）、文件名受控正则、云存储抽象 |
| 匿名信任层 | 匿名帖不可按作者反查、编辑不脱敏、四路反查有回归测试、管理员揭示阈值 |
| 内容安全 | 本地敏感词三级评定 + 微信 `msgSecCheck`/`mediaCheckAsync`（未配凭据自动降级） |
| 管理后台 | RBAC 分级、审计日志全部写 `admin_logs`、限流分档 |
| AI 链路 | OpenRouter 集成、知识库权限收归超管、注入分级护栏、评估记分卡全离线可复现 |
| WebSocket | hello 帧鉴权（含 status/token_version 回查）+ 指数退避重连 + REST 兜底 |
| 数据保护 | SQLite WAL、每日热备（`BACKUP_ENCRYPTION_KEY` AES-256 可加密落盘）、定时清理 |
| 传输与响应头 | CSP / HSTS（生产）/ X-Frame-Options SAMEORIGIN / nosniff / Referrer-Policy |

仅 `master` 主分支接受安全修复；已发布的 `v*` 标签不再维护。

## 报告漏洞

请通过以下任一渠道**私下**报告：

1. **GitHub Security Advisories**（首选）：仓库 → Security → Report a Vulnerability
2. **Issue Tracker**：打上 `security` 标签，避免公开细节，我们会在 Issue 中直接沟通
3. 如需邮件渠道，请在 Issue 中提出后与我们协商公开联系方式

请勿通过公开 issue 提交 PoC 或可复现的完整攻击步骤。我们不接受通过社工、
第三方站点或口头转述来源不明的报告。

## 响应承诺

- **48 小时**内受理并分配责任人
- **7 天**内完成风险评估，确认威胁模型与影响面
- **30 天**内以 master 合入补丁或单独 patch 发布；严重漏洞（RCE / 认证绕过 / 隐私数据泄露）7 天内应急修复并附 advisory

## 不在持续投入范围的议题

- 已知且文档化的中间件配置项（CORS 源白名单、`TRUST_PROXY` 跳数等）的再次提醒
- 人工审核队列分级阈值的调参讨论
- 演示数据或演示账号本身
- 依赖的例行版本更新（仍建议自行 `npm audit`）
- 「信誉分」体系的设计哲学讨论

以上议题欢迎在普通 Issue 中讨论，我们会正常回应，但不作为安全修复排期依据。

## 上线检查单

部署到任何非本地环境前，请确认：

```bash
# 必填：缺失时生产环境拒绝启动
JWT_SECRET=<openssl rand -hex 32>
ADMIN_INITIAL_PASSWORD=<强口令>
NODE_ENV=production
CORS_ORIGIN=https://your-domain
PUBLIC_BASE_URL=https://your-domain
# 单层反代必须设为 1，否则限流按反代 IP 聚合失效
TRUST_PROXY=1
```

配套要求：

- 备份密钥单独存放，不与库文件同盘
- `WX_APPID` / `WX_SECRET` 不入库、不进仓库 CI
- 走 HTTPS + WSS，反代到 Node 时启用 HSTS（应用默认在 `NODE_ENV=production` 下启用）
- 详细部署形态见 [docs/DEPLOY.md](docs/DEPLOY.md)