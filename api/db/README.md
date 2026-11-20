# DB 层（api/db/）

> **唯一事实源是 `api/db.ts`**：全部表结构、索引、迁移（CREATE TABLE IF NOT EXISTS 追加式）都在那里随进程启动幂等建好，CI 的全量测试与 E2E 在干净库上证明其可启动。
>
> 本目录不再保留 kysely 迁移层——该抽象层无任何调用方（路由/任务全部 `import { db } from '../db.js'` 走 better-sqlite3），文档化过的 `npm run db:migrate` 脚本也不存在，且迁移文件与运行时 schema 已分叉：照它在新环境跑一遍会得到缺列的半成品库，把每条 INSERT 都打成 500。半成品不留，按「宁可砍掉功能」原则整层移除（连同 kysely 依赖）。

## 使用

```ts
import { db } from '../db.js';

const rows = db.prepare('SELECT * FROM posts WHERE status = ?').all('published');
```

- driver：better-sqlite3（同步单写者，`db.transaction()` 包裹多步写）
- 数据库文件：`api/data.db`，可由 `DB_PATH` / `DATA_DIR` 覆盖
- 在线备份：`jobs/backup.ts`（WAL 快照，零锁）