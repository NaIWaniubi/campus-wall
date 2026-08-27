/**
 * Storage 抽象接口
 * 隔离"写到哪里"和"业务怎么用"，便于切换 local / s3
 */
import type { Readable } from 'node:stream';

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
