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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
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

const router = Router();

router.post('/', authRequired, upload.single('file'), (req, res) => {
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
  success(res, { url }, '上传成功');
});

export default router;
