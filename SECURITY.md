# 安全策略 / Security Policy

本项目涉及校园用户信息、匿名发布、消息推送、第三方 AI 调用等敏感面，我们对此非常重视。请按本指南报告与你同项目的合作者才会继续的测试。

## 支持范围

以下位置属于我们主动维护与升级的对象：

- `/api/auth` 自创/JWT 认证与密码重置流程
- `/api/upload` 文件上传路径（受限 MIME/尺寸）
- 匿名发布与举报-溯源 / 管理员揭示阈值
- 内容安全/敏感词管道（前后端双重过滤）
- 管理员后台（`/api/admin/*`）的授权与速率限制
- AI 助手（OpenRouter 集成）的知识库与配置面板
- SQLite 备份脚本（含加密选项 `BACKUP_ENCRYPTION_KEY`）
- WebSocket 实时层的 hello 鉴权与重连机制

仅 `master` 主分支接受安全修复；发布的 `v*` 标签不再维护。

## 报告一个潜在安全问题

请通过以下任意通道私下报告：

1. **GitHub Security Advisories**（首选）：仓库 → Security → Report a Vulnerability。
2. **Issue Tracker**：标记 `security` 标签，避免公开 detail；我们会跟随 Issue 直接联系你。
3. 邮件：__联系邮箱或联系待补__（撤回默认 GitHub 联系方式）。

勿通过公开 issue 提交 PoC。我们不接受通过社工、第三方站点或营业团队借位的报告。

## 响应承诺

- **48 小时**：受理并分配责任人。
- **7 天**：风险评估、确认威胁模型与影响面。
- **30 天**：补丁以 next master 发布或单独补丁；审核公用储蓄以认领。

严重漏洞（RCE / auth bypass / 隐私数据泄露）会在 7 天内应急修复并发布 advisory。

## 逾漏类的范围（非将持续关注的事项）

- 已知文档中的中间件配置陷阱（CORS, Helmet 默认值等之类）
- 人工审核队列分级阈值调整
- 默认演示数据或演示账号
- SDK/微信配置 `WX_APPID` / `WX_SECRET` 的本地非 HSM 存储
- 常规依赖更新的例行总结
- 涉及受到权威人事影响的「信誉分」设计决策

请在提交前自行 `npm audit` 并观察 README，我们虽然经常性维护依赖此补充，但仍属能识别漏洞的偏差。

## 安全实践推荐

- 生产环境必须覆写 `JWT_SECRET` / `BACKUP_ENCRYPTION_KEY` / `OPENROUTER_API_KEY`
- 将 `public/uploads/` 与 `api/data.db` 头出到非 web 目录
- 启用 `npm run start` 而非 `npm run dev` 提供生产服务
- HTTPS + WSS，避免明文 WebSocket。

尽管项目以教学/研究为目的，但我们仍视报告高优先级。谢谢。