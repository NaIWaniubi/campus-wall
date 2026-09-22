# 部署运维

## 部署形态

- **Node 常驻进程**（推荐）：Express 直接对外提供服务，SQLite 与本地文件存储可用
- **PM2**：`npm run start:pm2`（配置见 `ecosystem.config.cjs`）

> 注意：纯 Serverless（如 Vercel）形态下，SQLite 与本地文件存储不可用，需要替换为外部数据库与对象存储。

## 构建与启动

```bash
npm run build
npm start
```

## 反向代理

部署在 nginx / CDN 之后时，务必让应用信任代理链：

```bash
TRUST_PROXY=1
```

否则限流会按代理 IP 计数，导致所有用户共享同一个限流桶。

## 健康检查与监控

- `GET /api/health` 返回 db / storage / ws 探测结果与 5xx 计数
- 建议接入监控轮询，异常时告警

## 备份

- 备份文件以 AES-256-GCM 加密落盘
- **必须持久化 `BACKUP_ENCRYPTION_KEY`**：一旦丢失，历史备份将无法解密
- 建议将密钥放入密管系统，并单独演练一次恢复流程

## 上线检查清单

- [ ] `.env` 已配置且未提交入库
- [ ] `TRUST_PROXY` 已按部署形态设置
- [ ] `BACKUP_ENCRYPTION_KEY` 已持久化
- [ ] `/api/health` 可被监控访问
- [ ] 默认管理员口令已修改
- [ ] `npm run check && npm run lint && npm run test` 全绿