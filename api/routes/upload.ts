/**
 * 文件上传路由
 * - multer 内存存储接收 multipart，校验 magic number 后再落盘（防止扩展名与内容不符绕过）
 * - sharp 解码校验 + 限制解码像素上限（防解压炸弹）
 * - 文件名带随机后缀（同毫秒多次上传不会互相覆盖）
 * - 异步写盘（不阻塞事件循环）
 * - 图片处理失败直接拒绝，不再把未经解码校验的原图落盘
 * - 文件名/key 走 Storage 抽象（STORAGE_DRIVER=local|s3 切换）
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { authRequired } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { success, fail } from '../utils/response.js';
import { getStorage } from '../storage/factory.js';
import { logger } from '../utils/logger.js';
import { isWxContentEnabled, submitImageCheck } from '../utils/wx-content.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 落盘目录：仅 local storage 时使用；s3 模式压缩/缩略图全部走内存
// 云部署通过 UPLOAD_DIR 指到持久化目录，避免写进只读的发布包
const uploadDirCandidates = [
  ...(process.env.UPLOAD_DIR ? [path.resolve(process.env.UPLOAD_DIR)] : []),
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

/**
 * sharp 是可选能力：本地/云上装了就用（压缩 + 缩略图），
 * 加载失败时降级为原图直出，保证上传功能不整体不可用。
 */
type SharpFactory = ((input?: unknown, options?: unknown) => any) & { [k: string]: any };
let sharpPromise: Promise<SharpFactory | null> | undefined;
function getSharp(): Promise<SharpFactory | null> {
  if (!sharpPromise) {
    sharpPromise = import('sharp')
      .then((mod: any) => (mod.default ?? mod) as SharpFactory)
      .catch(() => null);
  }
  return sharpPromise;
}

/** 允许的扩展名 -> 期望的 MIME */
const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

/** 期望的 magic number（文件头字节） */
const MAGIC: Record<string, number[]> = {
  '.jpg': [0xff, 0xd8, 0xff],       // JPEG: FFD8FF
  '.jpeg': [0xff, 0xd8, 0xff],
  '.png': [0x89, 0x50, 0x4e, 0x47], // PNG: 89504E47
};

/**
 * 解码像素上限：5000 万像素。
 * 5MB 的压缩图片可以解压成数亿像素（decompression bomb），
 * 不限制会让 sharp 吃满内存拖垮进程。
 */
const MAX_INPUT_PIXELS = 50_000_000;

/** 读取 buffer 前 N 字节，比对 magic number（落盘前调用，防扩展名伪造） */
function verifyMagicNumber(buf: Buffer, ext: string): boolean {
  const expected = MAGIC[ext];
  if (!expected) return false;
  for (let i = 0; i < expected.length; i++) {
    if (buf[i] !== expected[i]) return false;
  }
  return true;
}

/** multer 内存存储：先校验 magic 再写盘，避免伪造扩展名落地文件占用磁盘 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
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

/**
 * 解码 + 压缩 + 缩略图。失败即抛错（由调用方拒绝上传）。
 * 刻意不再「失败就保留原图」：那会把未经解码校验的文件直接对外提供，
 * 且跳过尺寸/像素上限检查。
 */
async function processImage(
  srcBuf: Buffer,
  ext: string,
  filePath: string,
  persistToDisk: boolean
): Promise<{ mainBuf: Buffer; thumbBuf: Buffer | null }> {
  const sharp = await getSharp();

  // 降级路径：没有 sharp 时不做解码校验/压缩，直接原图落盘（前端会回落到原图）
  if (!sharp) {
    if (persistToDisk) await fs.promises.writeFile(filePath, srcBuf);
    return { mainBuf: srcBuf, thumbBuf: null };
  }

  // limitInputPixels 必须在首次解码前指定
  const pipeline = sharp(srcBuf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
  const meta = await pipeline.metadata();

  // 只接受真实 JPEG/PNG，且必须有有效尺寸
  const format = (meta.format || '').toLowerCase();
  if (format !== 'jpeg' && format !== 'png') {
    throw new Error(`unsupported image format: ${format || 'unknown'}`);
  }
  if (!meta.width || !meta.height) {
    throw new Error('invalid image dimensions');
  }

  const tooLarge = Math.max(meta.width, meta.height) > MAX_EDGE;
  let mainBuf: Buffer = srcBuf;
  if (tooLarge) {
    mainBuf =
      ext === '.png'
        ? await sharp(srcBuf, { limitInputPixels: MAX_INPUT_PIXELS })
            .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer()
        : await sharp(srcBuf, { limitInputPixels: MAX_INPUT_PIXELS })
            .rotate()
            .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
  }

  const thumbBuf = await sharp(srcBuf, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(THUMB_WIDTH, null, { withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();

  // 异步写盘：writeFileSync 会阻塞事件循环，单次大图可感知为接口卡顿
  if (persistToDisk) {
    await fs.promises.writeFile(filePath, mainBuf);
    await fs.promises.writeFile(`${filePath}.thumb.webp`, thumbBuf);
  }

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

  // 文件名：<userId>_<timestamp>_<6位随机>.<ext>
  // 加随机后缀是因为同一毫秒内的两次上传会拿到相同 timestamp，导致后写覆盖先写
  const userId = req.currentUser?.id ?? 0;
  const rand = crypto.randomBytes(4).toString('hex').slice(0, 6);
  const filename = `${userId}_${Date.now()}_${rand}${ext}`;
  const filePath = path.join(uploadDir, filename);

  let mainBuf: Buffer;
  let thumbBuf: Buffer | null;
  try {
    const out = await processImage(buffer, ext, filePath, PERSIST_TO_DISK);
    mainBuf = out.mainBuf;
    thumbBuf = out.thumbBuf;
  } catch (err) {
    logger.warn('图片解码/压缩失败，拒绝上传', {
      error: err instanceof Error ? err.message : String(err),
      ext,
      size: buffer.length,
    });
    return fail(res, '图片无法解析，请更换图片后重试');
  }

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
    logger.error('Storage 写入失败', { error: err instanceof Error ? err.message : String(err) });
    return fail(res, '存储服务写入失败，请稍后重试');
  }

  const url = storageIface.publicUrl(key);

  // 异步提交微信图片检测（仅小程序用户 + 配置了公网基址时；不阻塞上传，结果由微信回调）
  if (isWxContentEnabled() && req.currentUser?.openid) {
    const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    if (base) {
      void submitImageCheck(req.currentUser.openid, `${base}${url}`);
    }
  }

  success(res, { url, thumbUrl: thumbBuf ? storageIface.publicUrl(thumbKey) : url }, '上传成功');
});

export default router;
