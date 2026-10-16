/**
 * 文件上传路由
 * - multer 内存存储接收 multipart，校验 magic number 后再落盘（防止扩展名与内容不符绕过）
 * - 文件名/key 走 Storage 抽象（STORAGE_DRIVER=local|s3 切换）
 * - 响应形状 {url, thumbUrl} 保持不变
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { authRequired } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { success, fail } from '../utils/response.js';
import sharp from 'sharp';
import { getStorage } from '../storage/factory.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 落盘目录：仅 local storage 时使用；s3 模式压缩/缩略图全部走内存（os.tmpdir 也不留痕）
const uploadDirCandidates = [
  path.join(__dirname, '..', '..', 'public', 'uploads'),
  path.join(process.cwd(), 'public', 'uploads'),
  path.join(process.cwd(), 'tmp', 'uploads'),
];
const uploadDir =
  uploadDirCandidates.find((p) => fs.existsSync(path.dirname(p))) ?? uploadDirCandidates[0]!;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const STORAGE_DRIVER = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
const PERSIST_TO_DISK = STORAGE_DRIVER !== 's3';

// 允许的扩展名 -> 期望的 MIME
const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

// 期望的 magic number（文件头字节）
const MAGIC: Record<string, number[]> = {
  '.jpg': [0xff, 0xd8, 0xff],       // JPEG: FFD8FF
  '.jpeg': [0xff, 0xd8, 0xff],
  '.png': [0x89, 0x50, 0x4e, 0x47], // PNG: 89504E47
};

// 读取 buffer 前 N 字节，比对 magic number（在 multer 解析后、落盘前调用，防止扩展名伪造）
function verifyMagicNumber(buf: Buffer, ext: string): boolean {
  const expected = MAGIC[ext];
  if (!expected) return false;
  for (let i = 0; i < expected.length; i++) {
    if (buf[i] !== expected[i]) return false;
  }
  return true;
}

// multer 内存存储：先校验 magic 再写盘，避免伪造扩展名落地文件占用磁盘
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png'];
    if (!allowed.includes(ext)) {
      return cb(new Error('仅支持 JPG/PNG 格式图片') as any, false);
    }
    if (file.mimetype !== EXT_MIME[ext]) {
      return cb(new Error('文件 MIME 类型不合法') as any, false);
    }
    cb(null, true);
  },
});

const MAX_EDGE = 1600;
const THUMB_WIDTH = 400;

// 压缩与缩略图生成：传入 buffer + 目标文件路径 + 是否持久化
// persistToDisk=false 时（s3 模式）跳过 fs.writeFileSync，避免本地磁盘泄漏
async function compressImage(
  srcBuf: Buffer,
  ext: string,
  filePath: string,
  persistToDisk: boolean
): Promise<{ mainBuf: Buffer; thumbBuf: Buffer | null }> {
  const meta = await sharp(srcBuf).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  let mainBuf: Buffer = srcBuf;
  if (Math.max(width, height) > MAX_EDGE) {
    mainBuf =
      ext === '.png'
        ? await sharp(srcBuf).resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
        : await sharp(srcBuf).rotate().resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  }
  if (persistToDisk) fs.writeFileSync(filePath, mainBuf);
  const thumbBuf = await sharp(srcBuf)
    .rotate()
    .resize(THUMB_WIDTH, null, { withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
  if (persistToDisk) fs.writeFileSync(`${filePath}.thumb.webp`, thumbBuf);
  return { mainBuf, thumbBuf };
}

const router = Router();

router.post('/', authRequired, uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) return fail(res, '请上传图片文件');
  const ext = path.extname(req.file.originalname).toLowerCase();
  const buffer = Buffer.from(req.file.buffer);

  if (!verifyMagicNumber(buffer, ext)) {
    return fail(res, '文件内容与扩展名不符，拒绝上传');
  }

  // 文件名格式 <userId>_<timestamp>.<ext>（与 app.ts UPLOAD_NAME_RE 白名单一致）
  const userId = req.currentUser?.id ?? 0;
  const filename = `${userId}_${Date.now()}${ext}`;
  const filePath = path.join(uploadDir, filename);

  let mainBuf: Buffer = buffer;
  let thumbBuf: Buffer | null = null;
  try {
    // s3 模式不落盘（直接拿 buffer 推 s3）；local 模式压缩后写盘供 express.static 访问
    const compressed = await compressImage(buffer, ext, filePath, PERSIST_TO_DISK);
    mainBuf = compressed.mainBuf;
    thumbBuf = compressed.thumbBuf;
  } catch (err) {
    logger.error('图片压缩/缩略图生成失败，保留原图', { error: err instanceof Error ? err.message : String(err) });
  }

  // 走 Storage 抽象：把原图 + 缩略图都 put 进去（local 时仍是同目录；s3 时推到 S3）
  const storageIface = getStorage();
  const contentType = EXT_MIME[ext] ?? 'application/octet-stream';
  const key = filename;
  const thumbKey = `${filename}.thumb.webp`;

  try {
    await storageIface.put({ key, body: mainBuf, contentType, cacheControl: 'public, max-age=31536000' });
    if (thumbBuf) {
      await storageIface.put({ key: thumbKey, body: thumbBuf, contentType: 'image/webp', cacheControl: 'public, max-age=31536000' });
    }
  } catch (err: any) {
    // 写 storage 失败：local 时写回磁盘本身（路径已在），s3 时无法恢复；返回错误
    logger.error('Storage 写入失败', { error: err instanceof Error ? err.message : String(err) });
    if (process.env.STORAGE_DRIVER === 's3') {
      return fail(res, '存储服务写入失败');
    }
  }

  const url = storageIface.publicUrl(key);
  success(res, { url, thumbUrl: storageIface.publicUrl(thumbKey) }, '上传成功');
});

export default router;
