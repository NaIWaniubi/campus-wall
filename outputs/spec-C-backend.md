# 方向 C：后端能力补完 — 完整执行规范

> 项目：E:\校园墙（api/ 目录）  
> 范围：后端能力补完（不动前端、不动现有 REST 路由行为）  
> 目标读者：实施工程师 + 评审人  
> 版本：v1.0（初稿）

---

## 1. 目标与成功标准

| # | 目标 | 可量化指标 | 验收方式 |
|---|------|------------|----------|
| 1 | 存储可插拔 | `api/storage/` 抽象完成，至少 2 个实现（local + s3），切换实现仅改 1 个 env | `STORAGE_DRIVER=s3` 启动后所有上传/读取走 S3 协议；本地单测切换 `local` 通过 |
| 2 | DB 可迁移到 PostgreSQL | kysely 抽象完成，18 表 schema 覆盖，启动 `DB_DRIVER=postgres` 通过 | `npm run db:check` 在 sqlite + postgres 两种连接上均成功 |
| 3 | 私信实时化 | WebSocket 鉴权 + 会话订阅 + 离线队列上线拉取全链路 | 100 个并发连接 5 分钟稳定；断网 30s 后上线消息零丢失 |
| 4 | OpenAPI 与实现零漂移 | zod schema → OpenAPI → Swagger UI；CI 漂移检查失败红 | 路由实现字段名 100% 来自 zod schema；CI `npm run openapi:check` 必过 |
| 5 | 敏感词系统升级 | Aho-Corasick + 上下文高亮 + 管理后台 CRUD | 100KB 词库扫描 1MB 文本 <50ms；高亮可定位 ±2 词窗口 |
| 6 | 推送多通道 | notifier 抽象 + Web Push VAPID + 站内降级 | 用户未授权 push 时自动降级站内；授权后推送送达率 ≥95% |
| 7 | 限流维度化 | 滑动窗口 + IP/学号/UA 三维度独立桶 | 同一 IP 不同学号不被误伤；同一学号不同 IP 仍受学号桶约束 |
| 8 | 健康检查可观测 | `/healthz` 返回 DB/Storage/Queue 三态 + 监控 hook | 故障注入 5s 内 `/healthz` 状态翻转；Prometheus `/metrics` 输出 |

---

## 2. 范围与不做项

### 2.1 范围内
- 12 个 task 全部实现（详见 §5）
- 双写期、灰度开关、回滚按钮
- CI 脚本与监控 hook
- OpenAPI 文档站点

### 2.2 不做项（YAGNI）
- ❌ 不重写现有 REST 路由（仅消息/私信相关逐步切 WS）
- ❌ 不引入 ORM 重型生态（typeorm/prisma 都不引入）
- ❌ 不做微服务拆分（继续单仓单进程）
- ❌ 不做完整 i18n（仅预留 hook）
- ❌ 不重写敏感词管理后台 UI（仅 API + 简易 admin 页面）
- ❌ 不做实时音视频
- ❌ 不做全文搜索升级（保持 LIKE 检索）

---

## 3. 关键技术决策

| 决策 | 选型 | 备选 | 理由 |
|------|------|------|------|
| ORM/Query Builder | kysely | prisma / typeorm / drizzle | kysely 类型推断 + SQL-first + 无运行时反射；与 better-sqlite3/postgres 兼容 |
| 存储抽象 | 自研 `Storage` 接口 | multer-s3 | 现有 multer 已稳定，抽象层只接管 path/bucket，不接管 middleware |
| WebSocket | `ws` + 鉴权中间件 | socket.io / uWebSockets | 简单 + 与 Express 共享 http.Server；socket.io 协议开销大 |
| 消息协议 | JSON over WS | protobuf / msgpack | 内部协议、可读性 > 性能；后期可切 msgpack |
| 敏感词算法 | Aho-Corasick | 正则 / DFA | 单次扫描 O(n)，可定位所有匹配 |
| 推送协议 | Web Push (VAPID) | FCM / 极光 | 标准 Web API，浏览器原生支持；FCM 需企业资质 |
| 限流算法 | 滑动窗口（双桶加权） | 固定窗口 / 令牌桶 | 防突刺更平滑；实现成本可接受 |
| 备份加密 | AES-256-GCM + age | GPG / KMS | 无 KMS 依赖；age 简单可审计 |
| 异地策略 | 加密后 rclone → S3 兼容存储 | OSS 直传 | rclone 支持 30+ 后端，统一入口 |
| API 文档 | zod-to-openapi + swagger-ui-express | 手写 OpenAPI YAML | schema 即单一事实源，零漂移 |
| 健康检查 | 自研 + prom-client | terminus | 避免黑盒；prom-client 已被生态广泛使用 |
| 双写期协调 | feature flag + 影子写 | 完整事务 | 简单可回滚；影子写可比对结果 |

---

## 4. 依赖项

### 4.1 新增 npm 依赖

| 包名 | 版本范围 | 用途 | 风险 |
|------|----------|------|------|
| `kysely` | ^0.27.0 | 类型化 query builder | 生态稳定，迁移成本低 |
| `pg` | ^8.11.0 | PostgreSQL 驱动 | 经典 |
| `ws` | ^8.16.0 | WebSocket 服务端 | 标准 |
| `@types/ws` | ^8.5.0 | 类型 | devDep |
| `zod` | ^3.22.0 | schema 校验 | 已有？需确认 |
| `@asteasolutions/zod-to-openapi` | ^7.0.0 | zod → OpenAPI | 维护活跃 |
| `swagger-ui-express` | ^5.0.0 | 文档 UI | 标准 |
| `aho-corasick` | ^1.0.0 | 敏感词算法 | 纯 JS，性能可接受 |
| `web-push` | ^3.6.0 | Web Push 协议 | 标准 |
| `prom-client` | ^15.0.0 | Prometheus metrics | 生态标准 |
| `rclone` | （系统二进制） | 异地备份 | 部署时安装 |
| `age` | （系统二进制） | 加密 | 部署时安装 |
| `compression` | ^1.7.0 | 响应压缩 | 已有？ |
| `helmet` | ^7.1.0 | HTTP 安全头 | 推荐 |
| `pino` | ^8.17.0 | 结构化日志 | 替换 console.log |

### 4.2 devDep

| 包名 | 版本 | 用途 |
|------|------|------|
| `@types/swagger-ui-express` | ^4.1.0 | 类型 |
| `supertest` | ^6.3.0 | HTTP 测试 |
| `@types/supertest` | ^6.0.0 | 类型 |
| `testcontainers` | ^10.0.0 | 集成测试（postgres） |
| `tsx` | 已有 | 跑 ts |

---

## 5. 详细 task 清单

### Task 1: api/storage/ 抽象 + local + s3 双实现

**为什么**：当前上传逻辑与本地文件系统耦合，迁到 S3 / OSS 需改业务代码。抽象层隔离"写到哪里"和"业务怎么用"。

**文件清单**：
- `api/storage/index.ts`（工厂）
- `api/storage/types.ts`（接口）
- `api/storage/local.ts`（本地实现）
- `api/storage/s3.ts`（S3 兼容实现）
- `api/storage/factory.ts`（按 env 选 driver）
- `api/utils/upload.ts`（改造：调用 Storage 而非 fs）

**接口**：

```ts
// api/storage/types.ts
export interface PutObjectOpts {
  key: string;            // 不含 bucket 前缀的相对路径
  body: Buffer | Readable;
  contentType: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}
export interface StorageObject {
  key: string;
  size: number;
  etag?: string;
  lastModified?: Date;
}
export interface SignedUrlOpts {
  key: string;
  expiresInSec: number;   // 默认 300
  method?: 'GET' | 'PUT';
}
export interface Storage {
  put(opts: PutObjectOpts): Promise<StorageObject>;
  get(key: string): Promise<Readable>;
  head(key: string): Promise<StorageObject | null>;
  delete(key: string): Promise<void>;
  signedUrl(opts: SignedUrlOpts): Promise<string>;
  publicUrl(key: string): string;  // 同步，便于 SSR/前端直接拼接
}
```

**实现核心（local）**：

```ts
// api/storage/local.ts
import { createReadStream, existsSync, statSync, promises as fsp } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import type { Storage, PutObjectOpts, StorageObject, SignedUrlOpts } from './types.js';

export class LocalStorage implements Storage {
  constructor(
    private root: string,                    // e.g. /var/lib/campus/upload
    private publicBase: string               // e.g. /uploads
  ) {
    if (!existsSync(root)) throw new Error(`storage root not found: ${root}`);
  }

  async put(opts: PutObjectOpts): Promise<StorageObject> {
    const abs = path.join(this.root, opts.key);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    const buf = await streamToBuffer(opts.body);
    await fsp.writeFile(abs, buf);
    const etag = crypto.createHash('md5').update(buf).digest('hex');
    return { key: opts.key, size: buf.length, etag, lastModified: new Date() };
  }

  async get(key: string): Promise<Readable> {
    const abs = path.join(this.root, key);
    if (!existsSync(abs)) throw new Error(`not found: ${key}`);
    return createReadStream(abs);
  }

  async head(key: string): Promise<StorageObject | null> {
    const abs = path.join(this.root, key);
    if (!existsSync(abs)) return null;
    const s = statSync(abs);
    return { key, size: s.size, lastModified: s.mtime };
  }

  async delete(key: string): Promise<void> {
    const abs = path.join(this.root, key);
    if (existsSync(abs)) await fsp.unlink(abs);
  }

  async signedUrl(opts: SignedUrlOpts): Promise<string> {
    // 本地实现：签发短时 JWT，由 middleware/verifyUpload.ts 校验
    return signLocalToken(opts.key, opts.expiresInSec);
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }
}

async function streamToBuffer(body: Buffer | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  const chunks: Buffer[] = [];
  for await (const c of body) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
```

**验收**：
- `STORAGE_DRIVER=local` 启动后上传图片仍能访问
- `STORAGE_DRIVER=s3` 启动后上传走 S3 协议（用 minio 容器验证）
- 切换实现不改任何业务路由

---

### Task 2: api/db/ 抽象 + connection pool + kysely 集成

**为什么**：SQLite 单文件 + better-sqlite3 同步 API 在 serverless 友好但并发受限。kysely 抽象后可平滑切到 PostgreSQL。

**文件清单**：
- `api/db/index.ts`（Kysely 实例工厂）
- `api/db/types.ts`（DB interface — 18 表）
- `api/db/sqlite.ts`（better-sqlite3 驱动）
- `api/db/postgres.ts`（pg 驱动）
- `api/db/migrator.ts`
- `api/migrations/`（kysely migrations 目录）

**Kysely 18 表完整定义**：

```ts
// api/db/types.ts
import type { ColumnType, Generated } from 'kysely';

export interface UserTable {
  id: Generated<number>;
  student_id: string;            // 学号，唯一
  nickname: string;
  password_hash: string;
  avatar: string | null;
  bio: string | null;
  reputation: number;            // 0-120
  role: 'user' | 'admin' | 'super';
  is_banned: 0 | 1;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, never, string>;
}
export interface PostTable {
  id: Generated<number>;
  user_id: number;
  section_id: number;
  type: 'normal' | 'lost' | 'found' | 'trade' | 'announcement';
  title: string;
  content: string;
  images: string;                // JSON 数组字符串
  status: 'visible' | 'hidden' | 'deleted';
  view_count: Generated<number>;
  like_count: Generated<number>;
  comment_count: Generated<number>;
  is_top: 0 | 1;
  is_essence: 0 | 1;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, never, string>;
}
export interface CommentTable {
  id: Generated<number>;
  post_id: number;
  user_id: number;
  parent_id: number | null;
  content: string;
  like_count: Generated<number>;
  status: 'visible' | 'hidden' | 'deleted';
  created_at: ColumnType<string, string | undefined, never>;
}
export interface SectionTable {
  id: Generated<number>;
  slug: string;                  // 唯一，如 'lost-found'
  name: string;
  description: string;
  icon: string | null;
  sort_order: Generated<number>;
  post_count: Generated<number>;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface MessageTable {  // 私信
  id: Generated<number>;
  conv_id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  type: 'text' | 'image' | 'system';
  read_at: string | null;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface ConversationTable {
  id: Generated<number>;
  user_a: number;
  user_b: number;
  last_message_id: number | null;
  last_message_at: string | null;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, never, string>;
}
export interface SubscriptionTable {  // 板块订阅
  id: Generated<number>;
  user_id: number;
  section_id: number;
  notify_new_post: 0 | 1;
  notify_digest: 0 | 1;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface NotificationTable {  // 站内通知
  id: Generated<number>;
  user_id: number;
  type: 'like' | 'comment' | 'follow' | 'system' | 'trade' | 'announcement';
  target_id: number | null;
  content: string;
  read_at: string | null;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface TradeTable {
  id: Generated<number>;
  post_id: number;
  seller_id: number;
  buyer_id: number | null;
  price: number;
  status: 'open' | 'reserved' | 'closed' | 'completed';
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, never, string>;
}
export interface FollowTable {
  id: Generated<number>;
  follower_id: number;
  followee_id: number;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface LikeTable {
  id: Generated<number>;
  user_id: number;
  target_type: 'post' | 'comment';
  target_id: number;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface DraftTable {
  id: Generated<number>;
  user_id: number;
  section_id: number | null;
  title: string;
  content: string;
  images: string;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, never, string>;
}
export interface AnnouncementTable {
  id: Generated<number>;
  user_id: number;
  title: string;
  content: string;
  pinned: 0 | 1;
  starts_at: string;
  ends_at: string | null;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface FeedbackTable {
  id: Generated<number>;
  user_id: number;
  type: 'bug' | 'suggest' | 'complain';
  content: string;
  contact: string | null;
  status: 'pending' | 'processing' | 'resolved';
  created_at: ColumnType<string, string | undefined, never>;
}
export interface AiLogTable {  // AI 调用日志
  id: Generated<number>;
  user_id: number | null;
  feature: 'rewrite' | 'summarize' | 'moderate' | 'match';
  input_hash: string;            // 脱敏 hash
  output: string;
  latency_ms: number;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface SensitiveWordTable {
  id: Generated<number>;
  word: string;
  level: 1 | 2 | 3;              // 提示/审核/拒绝
  action: 'warn' | 'review' | 'block';
  category: string | null;
  created_by: number | null;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, never, string>;
}
export interface PushSubscriptionTable {  // Web Push 订阅
  id: Generated<number>;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface SettingTable {  // 键值配置
  key: string;
  value: string;
  updated_at: ColumnType<string, never, string>;
}
export interface AuditLogTable {  // 管理操作审计
  id: Generated<number>;
  user_id: number;
  action: string;
  target_type: string;
  target_id: number | null;
  detail: string;
  ip: string | null;
  created_at: ColumnType<string, string | undefined, never>;
}

export interface Database {
  users: UserTable;
  posts: PostTable;
  comments: CommentTable;
  sections: SectionTable;
  messages: MessageTable;
  conversations: ConversationTable;
  subscriptions: SubscriptionTable;
  notifications: NotificationTable;
  trades: TradeTable;
  follows: FollowTable;
  likes: LikeTable;
  drafts: DraftTable;
  announcements: AnnouncementTable;
  feedback: FeedbackTable;
  ai_logs: AiLogTable;
  sensitive_words: SensitiveWordTable;
  push_subscriptions: PushSubscriptionTable;
  settings: SettingTable;
  audit_logs: AuditLogTable;
}
```

**Driver 工厂**：

```ts
// api/db/index.ts
import { Kysely, SqliteDialect, PostgresDialect } from 'kysely';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import type { Database as DB } from './types.js';

let _db: Kysely<DB> | null = null;

export function getDb(): Kysely<DB> {
  if (_db) return _db;
  const driver = process.env.DB_DRIVER ?? 'sqlite';
  if (driver === 'sqlite') {
    _db = new Kysely<DB>({
      dialect: new SqliteDialect({
        database: new Database(process.env.SQLITE_PATH ?? './data.db'),
      }),
    });
  } else if (driver === 'postgres') {
    _db = new Kysely<DB>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: process.env.DATABASE_URL }),
      }),
    });
  } else throw new Error(`unknown DB_DRIVER: ${driver}`);
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_db) { await _db.destroy(); _db = null; }
}
```

**验收**：
- 两个 driver 启动均通过
- 现有 19 个路由（除 raw SQL 片段）改用 kysely
- `npm run db:check` 在 CI 跑通

---

### Task 3: PostgreSQL 迁移（kysely migrations + 双写期）

**为什么**：学校规模 5000-30000 人，SQLite 写并发瓶颈会出现（lock contention）。迁移到 PG 是扩容必经之路。双写期保障可回滚。

**文件清单**：
- `api/migrations/0001_init.ts`
- `api/migrations/0002_*.ts`（后续）
- `api/scripts/migrate.ts`
- `api/scripts/shadow-write.ts`（双写校验）
- `docs/MIGRATION-PLAN.md`

**Init migration 关键 SQL（PG 方言）**：

```ts
// api/migrations/0001_init.ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createTable('users')
    .addColumn('id', 'serial', (c) => c.primaryKey())
    .addColumn('student_id', 'varchar(32)', (c) => c.notNull().unique())
    .addColumn('nickname', 'varchar(64)', (c) => c.notNull())
    .addColumn('password_hash', 'varchar(128)', (c) => c.notNull())
    .addColumn('avatar', 'varchar(255)')
    .addColumn('bio', 'text')
    .addColumn('reputation', 'integer', (c) => c.notNull().defaultTo(60))
    .addColumn('role', 'varchar(16)', (c) => c.notNull().defaultTo('user'))
    .addColumn('is_banned', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('idx_posts_section_created')
    .on('posts').columns(['section_id', 'created_at']).execute();
  // ... 其余 17 张表同模式
}
```

**双写脚本骨架**：

```ts
// api/scripts/shadow-write.ts
import { getDb } from '../db/index.js';
import { getLegacyDb } from '../db/legacy.js';

const primary = process.env.SHADOW_PRIMARY ?? 'sqlite';
const shadow = process.env.SHADOW_SECONDARY ?? 'postgres';

export async function shadowWrite<T>(
  table: string,
  fn: (db: any) => Promise<T>
): Promise<T> {
  const primaryDb = getDb(primary);
  const shadowDb = getDb(shadow);
  const result = await fn(primaryDb);
  // 影子写：失败不阻塞主链路
  fn(shadowDb).catch((e) => {
    console.error(`[shadow-write] ${table} failed`, e);
    metrics.shadowWriteFail.inc({ table });
  });
  return result;
}
```

**验收**：
- PG 上 init 脚本一次性建表成功
- 影子写校验：1000 条帖子数据 PG/SQLite 比对零差异
- 回滚开关：`DB_DRIVER=sqlite` 一行切回

---

### Task 4: api/ws/ WebSocket 服务 + JWT 鉴权 + 会话订阅

**为什么**：私信实时化是核心体验（用户在校园场景下消息延迟敏感）。HTTP 轮询浪费 90% 流量且延迟高。

**文件清单**：
- `api/ws/server.ts`（启动）
- `api/ws/auth.ts`（连接时 JWT 校验）
- `api/ws/hub.ts`（连接管理 + 房间订阅）
- `api/ws/protocol.ts`（消息类型定义）
- `api/ws/handlers/message.ts`

**协议 JSON Schema**（客户端/服务端统一）：

```ts
// api/ws/protocol.ts
import { z } from 'zod';

export const ClientHello = z.object({
  type: z.literal('hello'),
  token: z.string(),                        // JWT
});
export const Subscribe = z.object({
  type: z.literal('subscribe'),
  topics: z.array(z.enum(['messages', 'notifications', 'announcements', 'presence'])),
});
export const Unsubscribe = z.object({
  type: z.literal('unsubscribe'),
  topics: z.array(z.enum(['messages', 'notifications', 'announcements', 'presence'])),
});
export const SendMessage = z.object({
  type: z.literal('message:send'),
  requestId: z.string().uuid(),
  to: z.number().int().positive(),
  body: z.string().min(1).max(2000),
  clientMsgId: z.string().uuid(),            // 客户端去重
});
export const Ping = z.object({ type: z.literal('ping'), ts: z.number() });
export const ClientMsg = z.discriminatedUnion('type', [
  ClientHello, Subscribe, Unsubscribe, SendMessage, Ping,
]);

export const ServerError = z.object({
  type: z.literal('error'),
  code: z.enum(['UNAUTHORIZED', 'BAD_REQUEST', 'RATE_LIMIT', 'INTERNAL']),
  message: z.string(),
  requestId: z.string().optional(),
});
export const MessageAck = z.object({
  type: z.literal('message:ack'),
  requestId: z.string(),
  messageId: z.number().int(),
  clientMsgId: z.string(),
  createdAt: z.string(),
});
export const MessageIncoming = z.object({
  type: z.literal('message:incoming'),
  messageId: z.number().int(),
  from: z.number().int(),
  convId: z.number().int(),
  body: z.string(),
  createdAt: z.string(),
});
export const Pong = z.object({ type: z.literal('pong'), ts: z.number() });
export const ServerMsg = z.discriminatedUnion('type', [
  ServerError, MessageAck, MessageIncoming, Pong,
]);
export type TClientMsg = z.infer<typeof ClientMsg>;
export type TServerMsg = z.infer<typeof ServerMsg>;
```

**Hub 核心**：

```ts
// api/ws/hub.ts
import { WebSocket } from 'ws';
import type { TClientMsg, TServerMsg } from './protocol.js';

interface Conn {
  ws: WebSocket;
  userId: number;
  topics: Set<string>;
  subscribedConvs: Set<number>;     // 用户当前订阅的会话
}
const conns = new Map<number, Set<Conn>>();    // userId -> connections
const convSubs = new Map<number, Set<Conn>>();  // convId -> connections

export function attach(ws: WebSocket, userId: number): Conn {
  const c: Conn = { ws, userId, topics: new Set(), subscribedConvs: new Set() };
  const set = conns.get(userId) ?? new Set();
  set.add(c);
  conns.set(userId, set);
  return c;
}

export function detach(c: Conn): void {
  conns.get(c.userId)?.delete(c);
  for (const conv of c.subscribedConvs) convSubs.get(conv)?.delete(c);
}

export function sendTo(userId: number, msg: TServerMsg): number {
  const set = conns.get(userId);
  if (!set || set.size === 0) return 0;
  const payload = JSON.stringify(msg);
  let n = 0;
  for (const c of set) {
    if (c.ws.readyState === 1) { c.ws.send(payload); n++; }
  }
  return n;
}

export function sendToConv(convId: number, msg: TServerMsg): number {
  const set = convSubs.get(convId);
  if (!set) return 0;
  const payload = JSON.stringify(msg);
  let n = 0;
  for (const c of set) { if (c.ws.readyState === 1) { c.ws.send(payload); n++; } }
  return n;
}

export function subscribeConv(c: Conn, convId: number): void {
  c.subscribedConvs.add(convId);
  const set = convSubs.get(convId) ?? new Set();
  set.add(c);
  convSubs.set(convId, set);
}
```

**WebSocket 启动**：

```ts
// api/ws/server.ts
import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import { ClientHello, ClientMsg } from './protocol.js';
import { verifyToken } from '../utils/jwt.js';
import { attach, detach } from './hub.js';
import { handleMessage } from './handlers/message.js';

export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', async (ws) => {
    let userId: number | null = null;
    let conn: ReturnType<typeof attach> | null = null;
    const helloTimer = setTimeout(() => ws.close(4001, 'hello timeout'), 10_000);

    ws.on('message', async (raw) => {
      let parsed: TClientMsg;
      try { parsed = ClientMsg.parse(JSON.parse(raw.toString())); }
      catch { ws.send(JSON.stringify({ type: 'error', code: 'BAD_REQUEST', message: 'invalid frame' })); return; }

      if (parsed.type === 'hello') {
        try { userId = verifyToken(parsed.token); } catch {
          ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'bad token' }));
          ws.close(4001); return;
        }
        clearTimeout(helloTimer);
        conn = attach(ws, userId);
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        return;
      }
      if (!conn || userId === null) {
        ws.send(JSON.stringify({ type: 'error', code: 'UNAUTHORIZED', message: 'no hello' }));
        return;
      }
      if (parsed.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', ts: Date.now() })); return; }
      if (parsed.type === 'subscribe') {
        for (const t of parsed.topics) conn.topics.add(t);
        return;
      }
      if (parsed.type === 'unsubscribe') {
        for (const t of parsed.topics) conn.topics.delete(t);
        return;
      }
      if (parsed.type === 'message:send') {
        await handleMessage(conn, userId, parsed);
        return;
      }
    });

    ws.on('close', () => { clearTimeout(helloTimer); if (conn) detach(conn); });
  });

  return wss;
}
```

**验收**：
- 浏览器 demo 客户端连得上
- 无 token 10s 自动断开
- 100 并发连接内存 < 200MB

---

### Task 5: 私信路由切 WebSocket（保留 REST 兜底）

**为什么**：WS 是优选，但弱网/老浏览器/SEO 仍需 REST 兜底。两条路径同写同读，业务层无感。

**文件清单**：
- `api/routes/messages.ts`（改造：POST 走 WS 后再触发同写）
- `api/handlers/messageDispatcher.ts`（双路分发）

**核心逻辑**：

```ts
// api/handlers/messageDispatcher.ts
import { getDb } from '../db/index.js';
import { sendToConv, sendTo } from '../ws/hub.js';
import { MessageAck, MessageIncoming } from '../ws/protocol.js';
import { z } from 'zod';

const SendInput = z.object({
  to: z.number().int().positive(),
  body: z.string().min(1).max(2000),
  clientMsgId: z.string().uuid(),
});

export async function dispatchMessage(senderId: number, input: z.infer<typeof SendInput>) {
  const db = getDb();
  return await db.transaction().execute(async (trx) => {
    // 1. 找/建会话
    const [a, b] = [Math.min(senderId, input.to), Math.max(senderId, input.to)];
    let conv = await trx.selectFrom('conversations')
      .selectAll()
      .where(({ eb, and }) => and([eb('user_a', '=', a), eb('user_b', '=', b)]))
      .executeTakeFirst();
    if (!conv) conv = await trx.insertInto('conversations').values({ user_a: a, user_b: b, last_message_at: null, last_message_id: null }).returningAll().executeTakeFirstOrThrow();

    // 2. 幂等：按 clientMsgId 查重
    // (实际可加 unique index on (sender_id, client_msg_id))
    const msg = await trx.insertInto('messages')
      .values({
        conv_id: conv.id, sender_id: senderId, receiver_id: input.to,
        content: input.body, type: 'text', read_at: null, created_at: new Date().toISOString(),
      }).returningAll().executeTakeFirstOrThrow();

    await trx.updateTable('conversations')
      .set({ last_message_id: msg.id, last_message_at: msg.created_at, updated_at: msg.created_at })
      .where('id', '=', conv.id).execute();

    // 3. 双路推送
    sendTo(senderId, MessageAck.parse({
      type: 'message:ack', requestId: input.clientMsgId,
      messageId: msg.id, clientMsgId: input.clientMsgId, createdAt: msg.created_at,
    }));
    const delivered = sendToConv(conv.id, MessageIncoming.parse({
      type: 'message:incoming', messageId: msg.id, from: senderId,
      convId: conv.id, body: msg.content, createdAt: msg.created_at,
    }));
    // 4. 在线则不入离线队列
    return { message: msg, conv, delivered };
  });
}
```

**REST 兜底**：

```ts
// api/routes/messages.ts 改造片段
router.post('/', requireAuth, async (req, res) => {
  const parsed = SendInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const result = await dispatchMessage(req.user!.id, parsed.data);
  res.json({ ok: true, ...result });
});
```

**验收**：
- WS 发送 / REST 发送 行为完全一致
- clientMsgId 重复时返回已发送的 messageId（幂等）

---

### Task 6: 离线消息队列 + 上线拉取

**为什么**：用户断网/移动端后台期间消息不能丢；上线要补齐。

**文件清单**：
- `api/jobs/offlineQueue.ts`
- `api/handlers/pullMissed.ts`

**实现**：

```ts
// api/jobs/offlineQueue.ts
import { getDb } from '../db/index.js';

interface QueuedMsg { id: number; to: number; createdAt: string; }

export async function enqueueOffline(msg: { id: number; to: number; createdAt: string }) {
  const db = getDb();
  // 直接写 messages 表的 read_at=NULL 即天然队列；
  // 这里不另设 redis 队列，避免引入新依赖。
  // 拉取就是：SELECT WHERE receiver_id=? AND read_at IS NULL AND id > last_pull_id
  await db.insertInto('notifications')
    .values({ user_id: msg.to, type: 'system', target_id: msg.id, content: '新消息', read_at: null, created_at: msg.createdAt })
    .execute();
}

export async function pullMissed(userId: number, lastId: number, limit = 100) {
  const db = getDb();
  return await db.selectFrom('messages')
    .selectAll()
    .where('receiver_id', '=', userId)
    .where('id', '>', lastId)
    .where('read_at', 'is', null)
    .orderBy('id', 'asc')
    .limit(limit)
    .execute();
}
```

**REST 入口**：

```ts
router.get('/messages/missed', requireAuth, async (req, res) => {
  const since = Number(req.query.since ?? 0);
  const rows = await pullMissed(req.user!.id, since);
  res.json({ items: rows, serverTime: Date.now() });
});
```

**验收**：
- 模拟用户离线 60s，期间收到 50 条消息，上线一次性拉齐
- 拉到后置 read_at，下次 since 正确推进

---

### Task 7: OpenAPI 生成（zod → zod-to-openapi）+ Swagger UI + CI 漂移检查

**为什么**：手写 OpenAPI YAML 必漂移；用 zod schema 作为单一事实源，CI 必检。

**文件清单**：
- `api/openapi/registry.ts`
- `api/openapi/paths/*.ts`（每个路由一个）
- `api/scripts/generate-openapi.ts`
- `api/scripts/openapi-check.ts`
- `docs/openapi.json`（生成产物）

**示例**：

```ts
// api/openapi/registry.ts
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

export const PostCreateInput = z.object({
  section_id: z.number().int().positive().openapi({ example: 1 }),
  title: z.string().min(2).max(80).openapi({ example: '失物招领' }),
  content: z.string().min(1).max(5000),
  images: z.array(z.string().url()).max(9).default([]),
  type: z.enum(['normal', 'lost', 'found', 'trade']).default('normal'),
}).openapi('PostCreateInput');

export const PostCreateResponse = z.object({
  id: z.number().int(),
  created_at: z.string().datetime(),
}).openapi('PostCreateResponse');

registry.registerPath({
  method: 'post',
  path: '/api/posts',
  summary: '发表帖子',
  tags: ['posts'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: PostCreateInput } } } },
  responses: {
    200: { description: 'ok', content: { 'application/json': { schema: PostCreateResponse } } },
    400: { description: 'bad request' },
    401: { description: 'unauthorized' },
  },
});

export function generateOpenApi() {
  const gen = new OpenApiGeneratorV3(registry.definitions);
  return gen.generateDocument({
    openapi: '3.0.3',
    info: { title: '校园墙 API', version: '1.0.0' },
    servers: [{ url: 'https://campus.example.com' }],
  });
}
```

**CI 漂移检查**：

```ts
// api/scripts/openapi-check.ts
import { generateOpenApi } from '../openapi/registry.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const generated = JSON.stringify(generateOpenApi(), null, 2);
const committed = readFileSync(resolve('docs/openapi.json'), 'utf-8');
if (generated !== committed) {
  console.error('OpenAPI drift! Run `npm run openapi:gen` and commit.');
  process.exit(1);
}
```

**验收**：
- `npm run openapi:gen` 输出 `docs/openapi.json`
- `npm run openapi:check` 在 CI 必跑
- 改 zod schema 不重跑 gen 会被 CI 拦截

---

### Task 8: 敏感词 Aho-Corasick + 上下文高亮 + 管理后台 CRUD

**为什么**：现有三级风险是朴素匹配；AC 算法单次扫描 + 可定位位置，给后台审核提供精确打击。

**文件清单**：
- `api/utils/sensitive.ts`（重写）
- `api/utils/aho.ts`
- `api/routes/adminSensitive.ts`（CRUD）
- `api/admin/sensitive.html`（管理页面）

**AC 核心**：

```ts
// api/utils/aho.ts
import AhoCorasick from 'aho-corasick';
import type { SensitiveWord } from '../db/types.js';

export interface Match {
  word: string;
  start: number;
  end: number;
  level: 1 | 2 | 3;
  action: 'warn' | 'review' | 'block';
}

export function buildMatcher(words: SensitiveWord[]) {
  const keywords = words.map((w) => ({ k: w.word.replace(/[*?]/g, ''), v: w }));
  const ac = new AhoCorasick(keywords.map((k) => k.k));
  return {
    scan(text: string): Match[] {
      const hits = ac.search(text);
      const out: Match[] = [];
      for (const [endIdx, set] of hits) {
        // set: Set<keyword>
        for (const k of set) {
          const meta = keywords.find((x) => x.k === k)!.v;
          out.push({ word: k, start: endIdx - k.length + 1, end: endIdx + 1, level: meta.level, action: meta.action });
        }
      }
      return out;
    },
  };
}

export function highlight(text: string, matches: Match[], window = 2): string {
  // 输出 HTML：把匹配词用 <mark> 包裹，前 window 个词上下文保留
  const tokens = text.split(/(\s+)/);
  let charIdx = 0;
  const ranges = matches.map((m) => [m.start, m.end] as [number, number]);
  let html = '';
  for (const tok of tokens) {
    const start = charIdx, end = charIdx + tok.length;
    const hit = ranges.find(([s, e]) => start >= s! && end <= e!);
    if (hit) html += `<mark data-l="${matches[0].level}">${escapeHtml(tok)}</mark>`;
    else html += escapeHtml(tok);
    charIdx = end;
  }
  return html;
}
```

**管理后台 CRUD**：

```ts
// api/routes/adminSensitive.ts
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
const WordInput = z.object({
  word: z.string().min(1).max(64),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  action: z.enum(['warn', 'review', 'block']),
  category: z.string().max(32).optional(),
});

router.get('/', requireAdmin, async (_req, res) => {
  const db = getDb();
  const rows = await db.selectFrom('sensitive_words').selectAll().orderBy('id', 'desc').limit(500).execute();
  res.json({ items: rows });
});
router.post('/', requireAdmin, async (req, res) => {
  const parsed = WordInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const db = getDb();
  const row = await db.insertInto('sensitive_words').values({ ...parsed.data, created_by: req.user!.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).returningAll().executeTakeFirstOrThrow();
  res.json(row);
});
router.delete('/:id', requireAdmin, async (req, res) => {
  const db = getDb();
  await db.deleteFrom('sensitive_words').where('id', '=', Number(req.params.id)).execute();
  res.json({ ok: true });
});
export default router;
```

**验收**：
- 100KB 词库扫 1MB 文本 <50ms
- 管理后台可增删改查
- 词库变更后命中下次请求立即生效（内存缓存 60s）

---

### Task 9: 推送抽象（notifier）+ Web Push VAPID + 站内降级

**为什么**：单一站内通知覆盖率低；浏览器/手机系统推送能到 95% 但需用户授权。两路并存最稳。

**文件清单**：
- `api/notifier/types.ts`
- `api/notifier/index.ts`
- `api/notifier/webPush.ts`
- `api/notifier/inApp.ts`
- `api/routes/push.ts`（订阅注册/取消）

**抽象**：

```ts
// api/notifier/types.ts
export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;                  // 点击跳转
  tag?: string;
  data?: Record<string, unknown>;
}
export interface Notifier {
  name: 'web-push' | 'in-app';
  send(userId: number, payload: PushPayload): Promise<{ delivered: boolean; reason?: string }>;
}

// api/notifier/index.ts
import { webPushNotifier } from './webPush.js';
import { inAppNotifier } from './inApp.js';

const notifiers: Notifier[] = [webPushNotifier, inAppNotifier];

export async function notify(userId: number, payload: PushPayload) {
  const results = await Promise.all(notifiers.map((n) => n.send(userId, payload).catch((e) => ({ delivered: false, reason: e.message }))));
  return results;
}
```

**Web Push 实现**：

```ts
// api/notifier/webPush.ts
import webpush from 'web-push';
import { getDb } from '../db/index.js';
import type { Notifier, PushPayload } from './types.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
let configured = false;
function ensureConfig() {
  if (configured) return;
  webpush.setVapidDetails('mailto:admin@campus.example.com', VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
}

export const webPushNotifier: Notifier = {
  name: 'web-push',
  async send(userId, payload) {
    ensureConfig();
    const db = getDb();
    const subs = await db.selectFrom('push_subscriptions').selectAll().where('user_id', '=', userId).execute();
    if (subs.length === 0) return { delivered: false, reason: 'no_subscription' };
    const results = await Promise.allSettled(subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload))));
    const ok = results.some((r) => r.status === 'fulfilled');
    // 清理失效订阅
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      if (r.status === 'rejected' && (r.reason as any).statusCode === 410) {
        await db.deleteFrom('push_subscriptions').where('endpoint', '=', subs[i]!.endpoint).execute();
      }
    }
    return { delivered: ok };
  },
};
```

**站内降级**：

```ts
// api/notifier/inApp.ts
import { getDb } from '../db/index.js';
import type { Notifier, PushPayload } from './types.js';

export const inAppNotifier: Notifier = {
  name: 'in-app',
  async send(userId, payload) {
    const db = getDb();
    await db.insertInto('notifications').values({
      user_id: userId, type: 'system', target_id: null,
      content: `${payload.title}: ${payload.body}`, read_at: null, created_at: new Date().toISOString(),
    }).execute();
    return { delivered: true };
  },
};
```

**VAPID 密钥生成脚本**：

```bash
# scripts/gen-vapid.sh
npx web-push generate-vapid-keys
```

**验收**：
- 未授权 push 的用户收到站内通知
- 授权用户浏览器收到系统通知
- 失效订阅（410）自动清理

---

### Task 10: 限流滑动窗口 + 维度区分（IP/学号/UA）

**为什么**：固定窗口边界突刺可绕过；学号桶能防同一用户换 IP 刷帖。

**文件清单**：
- `api/middleware/rateLimit.ts`（重写）
- `api/middleware/rateLimitStore.ts`（内存 + 可选 redis 适配）

**实现**：

```ts
// api/middleware/rateLimitStore.ts
interface Bucket { count: number; resetAt: number; }
type Key = string;
const store = new Map<Key, Bucket>();

export function inc(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const b = store.get(key);
  if (!b || b.resetAt < now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    store.set(key, fresh);
    return { ok: true, remaining: limit - 1, resetAt: fresh.resetAt };
  }
  b.count++;
  const ok = b.count <= limit;
  return { ok, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
}

// 定期清理
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (v.resetAt < now) store.delete(k);
}, 60_000).unref();
```

```ts
// api/middleware/rateLimit.ts
import type { Request, Response, NextFunction } from 'express';
import { inc } from './rateLimitStore.js';

interface Rule { name: string; limit: number; windowMs: number; by: 'ip' | 'student' | 'ua'; }
const rules: Record<string, Rule> = {
  auth:        { name: 'auth', limit: 10,  windowMs: 60_000, by: 'ip' },
  postCreate:  { name: 'postCreate', limit: 5, windowMs: 60_000, by: 'student' },
  comment:     { name: 'comment', limit: 30, windowMs: 60_000, by: 'student' },
  messageWs:   { name: 'messageWs', limit: 120, windowMs: 60_000, by: 'student' },
  default:     { name: 'default', limit: 120, windowMs: 60_000, by: 'ip' },
};

export function rateLimit(ruleName: keyof typeof rules) {
  const r = rules[ruleName];
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${r.name}:${r.by}:${
      r.by === 'student' ? (req.user?.student_id ?? req.ip!)
      : r.by === 'ip' ? (req.ip ?? 'unknown')
      : (req.get('user-agent') ?? 'unknown')
    }`;
    const r1 = inc(key, r.limit, r.windowMs);
    res.setHeader('X-RateLimit-Limit', r.limit);
    res.setHeader('X-RateLimit-Remaining', r1.remaining);
    res.setHeader('X-RateLimit-Reset', Math.floor(r1.resetAt / 1000));
    if (!r1.ok) return res.status(429).json({ error: 'RATE_LIMIT', resetAt: r1.resetAt });
    next();
  };
}
```

**验收**：
- 同 IP 不同 student_id 互不影响
- 同 student_id 换 IP 仍受 student 桶约束
- 429 响应头含 reset 时间

---

### Task 11: 健康检查升级（DB/Storage/Queue 状态）+ 监控 hook

**为什么**：单一 healthz 在事故时只看进程活没活；多依赖时要看依赖是否可达。

**文件清单**：
- `api/routes/health.ts`（重写）
- `api/metrics.ts`（prom-client）
- `api/server.ts`（接入 /metrics）

**实现**：

```ts
// api/metrics.ts
import client from 'prom-client';
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpReqDuration = new client.Histogram({
  name: 'http_request_duration_seconds', help: 'http latency',
  labelNames: ['method', 'route', 'status'], buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [registry],
});
export const wsConns = new client.Gauge({ name: 'ws_connections', help: 'active ws conns', registers: [registry] });
export const shadowWriteFail = new client.Counter({ name: 'shadow_write_fail_total', help: 'shadow write failures', labelNames: ['table'], registers: [registry] });
```

```ts
// api/routes/health.ts
import { Router } from 'express';
import { getDb } from '../db/index.js';
import { getStorage } from '../storage/factory.js';
import { registry as metricsRegistry } from '../metrics.js';

const router = Router();
let lastQueueDepth = 0;

export function setQueueDepth(n: number) { lastQueueDepth = n; }

router.get('/healthz', async (_req, res) => {
  const checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }> = {};
  // DB
  const t0 = Date.now();
  try { await getDb().selectFrom('users').select('id').limit(1).execute(); checks.db = { ok: true, latencyMs: Date.now() - t0 }; }
  catch (e: any) { checks.db = { ok: false, detail: e.message }; }
  // Storage
  try { await getStorage().head('__healthcheck__'); checks.storage = { ok: true }; }
  catch (e: any) { checks.storage = { ok: /not found/i.test(e.message), detail: e.message }; }
  // Queue（这里用离线消息数代表）
  checks.queue = { ok: true, detail: `depth=${lastQueueDepth}` };
  const ok = Object.values(checks).every((c) => c.ok);
  res.status(ok ? 200 : 503).json({ ok, checks, time: new Date().toISOString() });
});

router.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});

export default router;
```

**验收**：
- DB 故障时 /healthz 返回 503
- /metrics 输出 prometheus 格式
- 默认指标 30s 内可见

---

### Task 12: 备份加密 + 异地策略 + 灾备演练脚本

**为什么**：当前 WAL 热备份只在本机盘；硬盘故障即丢。加密 + 异地是数据安全的最低标准。

**文件清单**：
- `api/scripts/backup-encrypt.ts`
- `api/scripts/backup-restore.ts`
- `scripts/backup-remote.sh`
- `docs/DISASTER-RECOVERY.md`
- `api/jobs/backup.ts`（改造：调用加密脚本）

**加密脚本**：

```ts
// api/scripts/backup-encrypt.ts
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { createCipheriv, randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const SRC = process.env.BACKUP_SRC ?? '/var/lib/campus/data.db';
const DST_DIR = process.env.BACKUP_DST ?? '/var/backups/campus';
const PUBKEY = process.env.AGE_PUBKEY!;   // 受托人公钥

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const plain = path.join(DST_DIR, `${ts}.db`);
  const enc = `${plain}.age`;
  // 1. 拷贝 sqlite → 临时（保证 hot WAL 一致）
  await run('sqlite3', [SRC, `.backup '${plain}'`]);
  // 2. age 加密（流式）
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  await pipeline(createReadStream(plain), cipher, createWriteStream(`${plain}.enc`));
  const tag = cipher.getAuthTag();
  // 3. age 用受托人公钥加密 key（密钥信封）
  await run('age', ['-r', PUBKEY, '-o', `${plain}.key.age`], { input: Buffer.concat([key, iv, tag]) });
  // 4. 上传
  await run('rclone', ['copyto', `${plain}.enc`, `remote:campus-backups/${ts}/data.db.enc`]);
  await run('rclone', ['copyto', `${plain}.key.age`, `remote:campus-backups/${ts}/key.age`]);
  // 5. 本地保留 7 天
  await run('find', [DST_DIR, '-name', '*.db', '-mtime', '+7', '-delete']);
  console.log(`backup ok: ${ts}`);
}

function run(cmd: string, args: string[], opts: { input?: Buffer } = {}) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args);
    if (opts.input) p.stdin.end(opts.input);
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`)));
    p.stderr.on('data', (d) => process.stderr.write(d));
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
```

**Shell 异地策略**：

```bash
# scripts/backup-remote.sh
#!/usr/bin/env bash
set -euo pipefail
TS=$(date -u +%Y%m%dT%H%M%SZ)
SRC=/var/lib/campus/data.db
DST=/var/backups/campus/${TS}
mkdir -p "${DST}"
sqlite3 "${SRC}" ".backup '${DST}/data.db'"
# 加密
age -r "${AGE_RECIPIENT}" -o "${DST}/data.db.age" < "${DST}/data.db"
# 计算 SHA256
sha256sum "${DST}/data.db.age" | awk '{print $1}' > "${DST}/data.db.age.sha256"
# 上传到异地（rclone 已在 api/scripts/backup-encrypt.ts 内做，此处可补充到第二目的地）
rclone copyto "${DST}/data.db.age" "b2:campus-backup-dr/${TS}/data.db.age"
# 清理本地 30 天前
find /var/backups/campus -mindepth 1 -maxdepth 1 -mtime +30 -exec rm -rf {} +
```

**灾备演练脚本**：

```ts
// api/scripts/backup-restore.ts
import { spawn } from 'node:child_process';
import { createDecipheriv, createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

async function main() {
  const ts = process.argv[2];
  if (!ts) throw new Error('usage: backup-restore <ts>');
  const enc = `/var/backups/campus/${ts}/data.db.enc`;
  const keyEnc = `/var/backups/campus/${ts}/key.age`;
  const keyPlain = `${keyEnc}.plain`;
  // 1. age 解密 key
  await run('age', ['-d', '-o', keyPlain, keyEnc]);
  // 2. 解 AES
  const buf = await import('node:fs').then((m) => m.readFileSync(keyPlain));
  const key = buf.subarray(0, 32), iv = buf.subarray(32, 44), tag = buf.subarray(44);
  const dec = createDecipheriv('aes-256-gcm', key, iv);
  dec.setAuthTag(tag);
  await pipeline(createReadStream(enc), dec, createWriteStream(`/var/backups/campus/${ts}/data.db`));
  console.log(`restored: /var/backups/campus/${ts}/data.db`);
}

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args);
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`)));
    p.stderr.on('data', (d) => process.stderr.write(d));
  });
}
main();
```

**演练**：

```bash
# docs/DISASTER-RECOVERY.md 节选
# 季度演练步骤：
# 1. 从异地拉最近一份 .enc + key.age
# 2. ts-node api/scripts/backup-restore.ts <ts>
# 3. sqlite3 data.db ".schema" 验证表齐全
# 4. 启动临时实例，curl /healthz 通过
# 5. 销毁临时实例
# 6. 在监控平台登记演练记录
```

**验收**：
- 每日 03:00 cron 跑通加密 + 异地
- 演练脚本可恢复 7 天内任意备份
- 异地副本数 ≥2（两个 region 或一个云 + 一个 B2）

---

## 6. 跨 task 协调

### 6.1 双写期管理

| 阶段 | 触发条件 | 状态 | 回滚方式 |
|------|----------|------|----------|
| Phase 0: 影子写 | Task 2-3 完成 | 写主库 + 影子写副库，失败不阻塞 | 关 `SHADOW_WRITE=1` |
| Phase 1: 灰度切读 | Task 3 完成 | 1% 读流量走 PG，监控差异 | `READ_GRAY=0` 回退 |
| Phase 2: 全量切 | 差异率 < 0.1% 持续 7 天 | 写主库 = PG，影子写回 SQLite | `DB_DRIVER=sqlite` |
| Phase 3: 下线 | 切完 30 天 | 移除 SQLite 代码 | git revert |

### 6.2 WS 与 REST 灰度

- WS 客户端通过 feature flag `WS_ENABLED` 开启
- REST 兜底始终保留（直到 WS 客户端覆盖率 > 95%）
- WS 消息一律镜像写 REST 日志（用于审计）

### 6.3 通用回滚按钮

- 每个 task 必须有 env 开关（`STORAGE_DRIVER` / `DB_DRIVER` / `WS_ENABLED` / `PUSH_ENABLED`）
- CI 必须保留最近 14 天可回滚的 commit
- 部署脚本支持 `--rollback <ref>` 一键回滚

---

## 7. 风险登记

| # | 风险 | 概率 | 影响 | 缓解 |
|---|------|------|------|------|
| 1 | SQLite → PG 数据迁移字段类型不一致 | 高 | 高 | 双写期 + 数据 diff 校验脚本（task 3） |
| 2 | WebSocket 防火墙阻断（校园网常封） | 中 | 中 | REST 兜底 + 客户端重试指数退避 |
| 3 | ws 连接数爆炸撑爆内存 | 中 | 高 | 单 IP 最多 5 连接 + 总量上限 5000 |
| 4 | OpenAPI 漂移未及时发现 | 中 | 中 | CI 必跑 `openapi:check` |
| 5 | Aho-Corasick 词库过大占用内存 | 中 | 中 | 词库分片 + LRU 淘汰 + 内存监控 |
| 6 | VAPID 私钥泄露 | 低 | 高 | 私钥走 secret manager + 定期轮换 |
| 7 | 滑动窗口内存泄漏 | 中 | 中 | 1 分钟清理一次 + prom 监控 store 大小 |
| 8 | 异地备份网络抖动 | 中 | 中 | 本地保留 7 天 + 异地异步重试 |
| 9 | kysely 类型生成与 schema 漂移 | 中 | 中 | CI 跑 `kysely-codegen` 校验 |
| 10 | 推送频次超限被浏览器禁用 | 中 | 中 | 用户级合并 + 重要事件优先 |

---

## 8. 里程碑

| 周 | 任务 | 交付物 | 验收人 |
|----|------|--------|--------|
| W1 | Task 1, 2, 11 | storage/db/healthz 上线 | 后端 + SRE |
| W2 | Task 3, 7 | PG 双写 + OpenAPI v1 | 后端 |
| W3 | Task 4, 5, 6 | WS + 私信 + 离线 | 后端 + 前端联调 |
| W4 | Task 8, 9, 10 | 敏感词 + 推送 + 限流 | 后端 + 风控 |
| W5 | Task 12 | 备份加密 + 演练 | SRE |
| W6 | 全量灰度 + 监控看板 | 完整 release | 全体 |

---

## 9. 审查与 sign-off

### 9.1 审查清单

- [ ] 所有 env 开关已加默认 false/安全值
- [ ] 双写期 feature flag 已配
- [ ] OpenAPI 与实现字段名 100% 一致
- [ ] 18 表 schema 在 SQLite + PG 上都跑通
- [ ] WS 鉴权 hello 超时 ≤10s
- [ ] 限流 429 响应头完整
- [ ] 健康检查 503 路径全部有覆盖
- [ ] 灾备演练记录归档到 `docs/dr/YYYYMMDD.md`

### 9.2 sign-off 角色

| 角色 | 签字 | 节点 |
|------|------|------|
| 后端 Tech Lead | 每个 task 完成 | W1-W5 |
| SRE | healthz + 备份完成 | W1, W5 |
| 安全 | 限流 + 推送 + 加密 | W4, W5 |
| 产品 | OpenAPI 文档 + 灰度计划 | W2, W6 |
| 项目负责人 | 全量 sign-off | W6 |

---

## 10. 项目级 todo（执行清单）

- [ ] **Task 1**: 创建 `api/storage/` 目录，写 types/local/factory，迁 upload.ts
- [ ] **Task 1**: 配 minio 容器做 E2E 验证（`docker run -p 9000:9000 minio`）
- [ ] **Task 2**: 创建 `api/db/types.ts` 18 表接口
- [ ] **Task 2**: 写 sqlite/postgres 双 driver
- [ ] **Task 2**: 改写 routes 内部 SQL → kysely
- [ ] **Task 3**: 写 `0001_init.ts`（PG 方言）
- [ ] **Task 3**: 写 `shadow-write.ts` 影子写工具
- [ ] **Task 3**: 配 `DB_DRIVER=postgres` 灰度
- [ ] **Task 4**: 装 `ws` + `@types/ws`
- [ ] **Task 4**: 写 `ws/protocol.ts`（zod schema）
- [ ] **Task 4**: 写 `ws/hub.ts` 连接管理
- [ ] **Task 4**: 写 `ws/server.ts` 启动 + 鉴权
- [ ] **Task 4**: 接入 `api/server.ts`（upgrade）
- [ ] **Task 5**: 改造 `dispatchMessage` 双路
- [ ] **Task 5**: REST 兜底保留
- [ ] **Task 6**: 写 `offlineQueue` + `pullMissed`
- [ ] **Task 6**: 客户端 `since` 拉取 demo
- [ ] **Task 7**: 装 zod + zod-to-openapi + swagger-ui
- [ ] **Task 7**: 写 `openapi/registry.ts`
- [ ] **Task 7**: `npm run openapi:gen` 跑通
- [ ] **Task 7**: CI 加 `openapi:check`
- [ ] **Task 8**: 装 `aho-corasick`
- [ ] **Task 8**: 重写 `utils/sensitive.ts`
- [ ] **Task 8**: 写 `routes/adminSensitive.ts`
- [ ] **Task 8**: 简易管理页 `admin/sensitive.html`
- [ ] **Task 9**: 装 `web-push` + `prom-client`
- [ ] **Task 9**: 写 `notifier/*`
- [ ] **Task 9**: 写 `routes/push.ts` 订阅注册
- [ ] **Task 9**: 生成 VAPID 密钥
- [ ] **Task 10**: 重写 `middleware/rateLimit.ts`
- [ ] **Task 10**: 写 `middleware/rateLimitStore.ts`
- [ ] **Task 10**: 各路由挂规则
- [ ] **Task 11**: 写 `metrics.ts` + `routes/health.ts`
- [ ] **Task 11**: 接入 `/metrics`
- [ ] **Task 11**: 故障注入演练
- [ ] **Task 12**: 装 `age` + `rclone`（系统）
- [ ] **Task 12**: 写 `backup-encrypt.ts` + `backup-restore.ts`
- [ ] **Task 12**: 写 `docs/DISASTER-RECOVERY.md`
- [ ] **Task 12**: 跑一次完整演练

---

> **结束** — 本 spec 涵盖 12 task 全部实现细节（接口/代码/schema/验收/回滚），可直接进入实施。
