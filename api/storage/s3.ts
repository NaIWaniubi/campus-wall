/**
 * S3 兼容 Storage 实现（AWS SDK v3）
 * - 需配置：S3_ENDPOINT / S3_REGION / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
 * - 切换方式：STORAGE_DRIVER=s3
 * 注：本实现仅在 driver 显式选用时动态 import，避免无 S3 配置时也加载 SDK
 */
import { Readable } from 'node:stream';
import type { Storage, PutObjectOpts, StorageObject, SignedUrlOpts } from './types.js';

interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBase?: string;   // CDN/public URL 前缀
  forcePathStyle?: boolean;
}

export class S3Storage implements Storage {
  // SDK 在 initSdk() 中加载
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mod: any = null;
  private bucket: string;
  private publicBase: string;

  constructor(private cfg: S3Config) {
    this.bucket = cfg.bucket;
    this.publicBase = cfg.publicBase ?? `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getMod(): Promise<any> {
    if (this.mod) return this.mod;
    // 动态 import：未装 SDK 时不抛（生产部署再装）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.mod = await (import('@aws-sdk/client-s3' as any).catch(() => null));
    if (!this.mod) {
      throw new Error('S3 driver 需先安装 @aws-sdk/client-s3：npm i @aws-sdk/client-s3');
    }
    return this.mod;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    const mod = await this.getMod();
    this.client = new mod.S3Client({
      region: this.cfg.region,
      endpoint: this.cfg.endpoint,
      forcePathStyle: this.cfg.forcePathStyle ?? !!this.cfg.endpoint,
      credentials: {
        accessKeyId: this.cfg.accessKeyId,
        secretAccessKey: this.cfg.secretAccessKey,
      },
    });
    return this.client;
  }

  async put(opts: PutObjectOpts): Promise<StorageObject> {
    const mod = await this.getMod();
    const client = await this.getClient();
    const body = Buffer.isBuffer(opts.body) ? opts.body : await streamToBuffer(opts.body as Readable);
    const out = await client.send(new mod.PutObjectCommand({
      Bucket: this.bucket,
      Key: opts.key,
      Body: body,
      ContentType: opts.contentType,
      CacheControl: opts.cacheControl,
      Metadata: opts.metadata,
    }));
    return {
      key: opts.key,
      size: body.length,
      etag: out.ETag?.replaceAll('"', ''),
      lastModified: new Date(),
    };
  }

  async get(key: string): Promise<Readable> {
    const mod = await this.getMod();
    const client = await this.getClient();
    const out = await client.send(new mod.GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return out.Body as Readable;
  }

  async head(key: string): Promise<StorageObject | null> {
    const mod = await this.getMod();
    const client = await this.getClient();
    try {
      const out = await client.send(new mod.HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        key,
        size: Number(out.ContentLength ?? 0),
        etag: out.ETag?.replaceAll('"', ''),
        lastModified: out.LastModified,
      };
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    const mod = await this.getMod();
    const client = await this.getClient();
    await client.send(new mod.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async signedUrl(opts: SignedUrlOpts): Promise<string> {
    const mod = await this.getMod();
    const client = await this.getClient();
    const cmd = new mod.GetObjectCommand({ Bucket: this.bucket, Key: opts.key });
    return await new mod.getSignedUrl(client, cmd, { expiresIn: opts.expiresInSec });
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }
}

async function streamToBuffer(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of body) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
