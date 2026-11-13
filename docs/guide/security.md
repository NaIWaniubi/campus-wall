# 安全与匿名

## 匿名四道锁

1. **列表不可反查**：非本人视角强制 `is_anonymous = 0` 过滤口径，不能按作者反查匿名帖
2. **编辑不脱匿名**：不传 `isAnonymous` 时保留原值
3. **缓存不串号**：缓存 key 带查看者可见性维度，游客结果不会命中作者结果
4. **封禁即失效**：改密/封禁递增 `token_version`，旧 token 立即失效

传播面同口径：OG/JSON-LD/RSS/小程序分享卡对匿名帖统一归一「匿名同学」，
RSS 逐 item 断言零昵称泄露（集成测 + demo 实证）。

## 鉴权与限流

- JWT + `token_version`；WebSocket hello 带 token 鉴权，通知定向推送（不可主题旁听）
- 滑动窗口限流：发帖 10/min、评论 30/min、上传 20/min、AI 10/min（IP + 账号双维度 + IP 兜底桶）；登录注册失败锁定
- UA 不参与桶 key（客户端可伪造）

## 响应头与输入

- CSP（`default-src 'self'`、`frame-ancestors 'self'`）+ HSTS + nosniff + Referrer-Policy
- JSON-LD 内容 `<`/`>` 转 `\u003c` 防提前闭合 `</script>`；OG/RSS/SVG 全字段转义
- 上传：解码像素上限 5000 万（防解压炸弹），失败即拒绝；Content-Type 按扩展名精确映射
- 开放重定向防护：回跳路径仅允许同源相对路径

## 审计与备份

- 封禁/解封/改信誉/重置密码/审核/删评/举报处理全写 `admin_logs`，仅真实状态变更记录
- SQLite WAL 在线热备份保留 7 份；`BACKUP_ENCRYPTION_KEY` 配置后 AES-256-GCM 落盘加密

## 回归

安全相关断言分布在 `api/tests/integration/`（匿名信任、token 吊销、匹配守卫等）与
`tests/miniprogram/static.test.ts`；CI 静态门每次 push 复验。
