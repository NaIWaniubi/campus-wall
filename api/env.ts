/**
 * 环境变量加载：必须早于任何「在模块顶层读取 process.env」的模块。
 *
 * ESM 会先把整个 import 图求值完再执行入口文件正文，所以把 dotenv.config()
 * 写在 app.ts 的正文里（route import 之后）是不够的：utils/jwt.ts 等模块早已
 * 在 .env 生效前读完 NODE_ENV / JWT_SECRET —— 生产配置被静默忽略并回退到
 * 开发默认密钥（可伪造 token），或反之在缺少真实环境变量时拒绝启动。
 *
 * 因此单独成模块，由入口（app.ts / server.ts / index.ts）与关键模块（utils/jwt.ts）
 * 显式 import，避免依赖脆弱的 import 书写顺序。
 * dotenv 不覆盖已存在的真实环境变量，重复调用是安全的。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// .env 固定位于仓库根（api/ 的上一级）：按进程 cwd 查找在 pm2 等启动方式下会漏读
const repoEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

dotenv.config(fs.existsSync(repoEnv) ? { path: repoEnv } : undefined);
