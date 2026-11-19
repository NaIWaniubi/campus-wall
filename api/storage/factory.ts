/**
 * Storage 工厂：按 env 选 driver
 * - STORAGE_DRIVER=local (默认) → LocalStorage
 * - STORAGE_DRIVER=s3           → S3Storage（需 S3_* 环境变量）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Storage } from './types.js';
import { LocalStorage } from './local.js';
import { S3Storage } from './s3.js';

let _storage: Storage | null = null;

export function getStorage(): Storage {
  if (_storage) return _storage;
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (driver === 's3') {
    // R3 审查 P2：STORAGE_DRIVER=s3 但凭据缺失时原构造会静默用空 bucket，
    // 上传全部失败而健康检查（读 root）对 S3 恒报 ok —— 监控绿、用户挂。
    // 生产环境直接拒启，把配置错误挡在部署期而不是首个上传请求。
    const missing: string[] = [];
    if (!process.env.S3_BUCKET?.trim()) missing.push('S3_BUCKET');
    if (!process.env.S3_ACCESS_KEY_ID?.trim()) missing.push('S3_ACCESS_KEY_ID');
    if (!process.env.S3_SECRET_ACCESS_KEY?.trim()) missing.push('S3_SECRET_ACCESS_KEY');
    if (missing.length && process.env.NODE_ENV === 'production') {
      throw new Error(`S3 存储配置缺失：${missing.join(', ')}（STORAGE_DRIVER=s3 需要完整凭据）`);
    }
    _storage = new S3Storage({
      region: process.env.S3_REGION ?? 'us-east-1',
      bucket: process.env.S3_BUCKET ?? '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      endpoint: process.env.S3_ENDPOINT,
      publicBase: process.env.S3_PUBLIC_BASE,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === '1',
    });
  } else {
    // local 默认指向 <project>/public/uploads
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const root = process.env.STORAGE_LOCAL_ROOT
      ? path.resolve(process.env.STORAGE_LOCAL_ROOT)
      : path.join(__dirname, '..', '..', 'public', 'uploads');
    const publicBase = process.env.STORAGE_PUBLIC_BASE ?? '/uploads';
    _storage = new LocalStorage(root, publicBase);
  }
  return _storage;
}

export function resetStorageForTest(): void {
  _storage = null;
}
