# DB 抽象层（api/db/）

基于 kysely 的 18 表抽象，SQLite + PostgreSQL 双 driver。

## 使用

```ts
import { getDb, closeDb } from './db/index.js';

const db = getDb();
const users = await db.selectFrom('users').selectAll().limit(10).execute();
```

## 切换 driver

```bash
# 默认（SQLite，兼容现网）
DB_DRIVER=sqlite

# PostgreSQL
DB_DRIVER=postgres
DATABASE_URL=postgres://user:pass@host:5432/campus
```

## 18 表清单

users / posts / comments / sections / messages / conversations /
subscriptions / notifications / trades / follows / likes / drafts /
announcements / feedback / ai_logs / sensitive_words /
push_subscriptions / settings / audit_logs

完整字段定义见 `types.ts`。

## 迁移

见 `migrations/0001_initial.ts`（kysely migrate，双方言兼容）。
跑迁移：`npm run db:migrate`。
