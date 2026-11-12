/**
 * better-sqlite3 -> node:sqlite 兼容层（仅用于云部署打包）
 *
 * 云运行时是 Linux x64 + Node 24，better-sqlite3 需要在目标机器编译，
 * 而 node:sqlite 是 Node 24 内置模块，零原生依赖。这里补齐业务代码实际用到的差异：
 *   - pragma()      -> exec('PRAGMA ...')
 *   - transaction() -> BEGIN/COMMIT/ROLLBACK（嵌套用 SAVEPOINT）
 *   - backup()      -> wal_checkpoint + 文件复制
 *
 * 业务代码只 import { db } from './db.js'，不直接依赖驱动，故只需在打包时 alias。
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

type AnyFn = (...args: any[]) => any;

/** 布尔值统一转 0/1：SQLite 无布尔类型，node:sqlite 会直接抛 TypeError */
function normalize(args: any[]): any[] {
  const isPlainObject = (v: any) =>
    v !== null &&
    typeof v === 'object' &&
    !Buffer.isBuffer(v) &&
    !(v instanceof Uint8Array);
  if (args.length === 1 && isPlainObject(args[0])) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(args[0] as Record<string, any>)) {
      out[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
    }
    return [out];
  }
  return args.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v));
}

class CompatStatement {
  constructor(private readonly stmt: any) {}

  run(...args: any[]) {
    return this.stmt.run(...normalize(args));
  }
  get(...args: any[]) {
    return this.stmt.get(...normalize(args));
  }
  all(...args: any[]) {
    return this.stmt.all(...normalize(args));
  }
  iterate(...args: any[]) {
    return this.stmt.iterate(...normalize(args));
  }
  columns() {
    return this.stmt.columns();
  }
}

export default class Database {
  private readonly db: any;
  private readonly file: string;
  private txDepth = 0;

  constructor(file: string, options?: any) {
    this.file = file;
    // node:sqlite 不接受显式的 undefined options（会抛 TypeError）
    this.db = options === undefined ? new DatabaseSync(file) : new DatabaseSync(file, options);
  }

  prepare(sql: string) {
    return new CompatStatement(this.db.prepare(sql));
  }

  exec(sql: string) {
    return this.db.exec(sql);
  }

  pragma(source: string) {
    this.db.exec(`PRAGMA ${source}`);
  }

  function(name: string, fn: AnyFn) {
    this.db.function(name, fn);
  }

  aggregate(name: string, options: any) {
    this.db.aggregate(name, options);
  }

  transaction(fn: AnyFn) {
    return (...args: any[]) => {
      const depth = this.txDepth++;
      const savepoint = `sp_${depth}`;
      if (depth === 0) this.db.exec('BEGIN');
      else this.db.exec(`SAVEPOINT ${savepoint}`);
      try {
        const result = fn(...args);
        if (result && typeof result.then === 'function') {
          throw new Error('node:sqlite 兼容层不支持异步事务');
        }
        if (depth === 0) this.db.exec('COMMIT');
        else this.db.exec(`RELEASE ${savepoint}`);
        return result;
      } catch (err) {
        try {
          if (depth === 0) this.db.exec('ROLLBACK');
          else {
            this.db.exec(`ROLLBACK TO ${savepoint}`);
            this.db.exec(`RELEASE ${savepoint}`);
          }
        } catch {
          /* 回滚失败时保留原始异常 */
        }
        throw err;
      } finally {
        this.txDepth--;
      }
    };
  }

  /** better-sqlite3 的在线备份：WAL checkpoint 后整文件复制，足够演示环境使用 */
  async backup(dest: string): Promise<void> {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      /* 非 WAL 模式忽略 */
    }
    fs.copyFileSync(this.file, dest);
  }

  close() {
    this.db.close();
  }

  get open() {
    return true;
  }
}
