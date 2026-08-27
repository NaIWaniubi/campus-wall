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
