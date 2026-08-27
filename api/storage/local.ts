/**
 * Local 文件系统 Storage 实现
 * - 写：磁盘（默认 public/uploads/）
 * - 读：磁盘流
 * - signedUrl：本地无真签名，返回与 publicUrl 相同的相对路径（由路由层用 JWT 控制访问）
 */
import { createReadStream, existsSync, statSync, mkdirSync, promises as fsp } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import type { Storage, PutObjectOpts, StorageObject, SignedUrlOpts } from './types.js';

export class LocalStorage implements Storage {
  constructor(
    private root: string,                    // e.g. <project>/public/uploads
    private publicBase: string               // e.g. /uploads
  ) {
    if (!existsSync(root)) {
      // 不存在则自动建（兼容首次启动）
      mkdirSync(root, { recursive: true });
    }
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
    // 本地无真签名：返回 publicUrl（受控访问由 app.ts 的 /uploads/* 路由 + JWT 限制）
    return this.publicUrl(opts.key);
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
