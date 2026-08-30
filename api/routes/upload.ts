/**
 * 文件上传路由
 * - multer 仍负责接收 multipart + 写临时文件（保留现有压缩管线 sharp）
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// multer 临时目录：与 storage root 同（local 时同目录；s3 时为 /tmp）
const uploadDirCandidates = [
  path.join(__dirname, '..', '..', 'public', 'uploads'),
  path.join(process.cwd(), 'public', 'uploads'),
  path.join(process.cwd(), 'tmp', 'uploads'),
];
const uploadDir =
  uploadDirCandidates.find((p) => fs.existsSync(path.dirname(p))) || uploadDirCandidates[0];
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${req.currentUser!.id}_${Date.now()}${ext}`;
    cb(null, filename);
  },
});

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

// 读取文件头前 4 字节，比对 magic number
function verifyMagicNumber(filePath: string, ext: string): boolean {
  const expected = MAGIC[ext];
  if (!expected) return false;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(expected.length);
    fs.readSync(fd, buf, 0, expected.length, 0);
    return expected.every((b, i) => buf[i] === b);
  } finally {
    fs.closeSync(fd);
  }
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
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

async function compressImage(filePath: string, ext: string): Promise<void> {
  try {
    const srcBuf = await fs.promises.readFile(filePath);
    const meta = await sharp(srcBuf).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (Math.max(width, height) > MAX_EDGE) {
      const resized =
        ext === '.png'
          ? await sharp(srcBuf).resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
          : await sharp(srcBuf).rotate().resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      fs.writeFileSync(filePath, resized);
    }
    await sharp(srcBuf)
      .rotate()
      .resize(THUMB_WIDTH, null, { withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(`${filePath}.thumb.webp`);
  } catch (err) {
    console.error('[upload] 压缩/缩略图生成失败，保留原图:', err);
  }
}

const router = Router();

router.post('/', authRequired, uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) return fail(res, '请上传图片文件');
  const ext = path.extname(req.file.filename).toLowerCase();

  let valid = false;
  try {
    valid = verifyMagicNumber(req.file.path, ext);
  } catch {
    valid = false;
  }
  if (!valid) {
    fs.unlink(req.file.path, () => {});
    return fail(res, '文件内容与扩展名不符，拒绝上传');
  }

  await compressImage(req.file.path, ext);

  // 走 Storage 抽象：把原图 + 缩略图都 put 进去（local 时仍是同目录；s3 时推到 S3）
  const storageIface = getStorage();
  const contentType = EXT_MIME[ext] ?? 'application/octet-stream';
  const key = req.file.filename; // <userId>_<timestamp>.<ext>
  const thumbKey = `${key}.thumb.webp`;

  try {
    const buf = await fs.promises.readFile(req.file.path);
    await storageIface.put({ key, body: buf, contentType, cacheControl: 'public, max-age=31536000' });
    if (fs.existsSync(req.file.path + '.thumb.webp')) {
      const thumbBuf = await fs.promises.readFile(req.file.path + '.thumb.webp');
      await storageIface.put({ key: thumbKey, body: thumbBuf, contentType: 'image/webp', cacheControl: 'public, max-age=31536000' });
    }
  } catch (err: any) {
    // 写 storage 失败：local 时写回磁盘本身（路径已在），s3 时无法恢复；返回错误
    console.error('[upload] storage.put 失败:', err);
    if (process.env.STORAGE_DRIVER === 's3') {
      return fail(res, '存储服务写入失败');
    }
  }

  const url = storageIface.publicUrl(key);
  success(res, { url, thumbUrl: storageIface.publicUrl(thumbKey) }, '上传成功');
});

export default router;
