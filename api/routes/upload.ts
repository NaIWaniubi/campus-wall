/**
 * 文件上传路由
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { authRequired } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 注意：本文件位于 api/routes/，需回退两级才到项目根的 public/uploads
// （与 app.ts 中访问路由使用的 <root>/public/uploads 保持同一目录）
// 打包为单文件时 __dirname 层级变化，回退到 cwd/public/uploads
const uploadDirCandidates = [
  path.join(__dirname, '..', '..', 'public', 'uploads'),
  path.join(process.cwd(), 'public', 'uploads'),
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
    // (a) MIME 类型白名单校验
    if (file.mimetype !== EXT_MIME[ext]) {
      return cb(new Error('文件 MIME 类型不合法') as any, false);
    }
    cb(null, true);
  },
});

// (c) 单文件限制：upload.single('file') 已确保每次仅一个文件（见下方路由）。

// 原图最长边超过该值时等比缩放重编码
const MAX_EDGE = 1600;
// 缩略图宽度
const THUMB_WIDTH = 400;

/**
 * 压缩管线：magic number 校验通过后执行
 * - 原图最长边 > MAX_EDGE 时等比缩到 MAX_EDGE 内，按原格式重编码（jpeg q80 / png 默认压缩），覆盖保存
 * - 同时生成缩略图 <原名>.thumb.webp（宽 THUMB_WIDTH）存同目录
 * 任一环节失败时保留原文件、跳过缩略图，不阻断上传
 */
async function compressImage(filePath: string, ext: string): Promise<void> {
  try {
    // 关键：以 Buffer 为输入而非文件路径。
    // sharp 直接读路径时 libvips 会 mmap 持有文件句柄，Windows 下随即覆盖原文件会报 UNKNOWN/-4094。
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

router.post('/', authRequired, upload.single('file'), async (req, res) => {
  if (!req.file) return fail(res, '请上传图片文件');
  const ext = path.extname(req.file.filename).toLowerCase();
  // (b) 真实文件类型（magic number）校验：与扩展名/MIME 不一致则删除并拒绝
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
  const url = `/uploads/${req.file.filename}`;
  await compressImage(req.file.path, ext);
  success(res, { url, thumbUrl: `${url}.thumb.webp` }, '上传成功');
});

export default router;
