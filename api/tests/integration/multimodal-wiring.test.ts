/**
 * 多模态接线回归（此前 analyzeAndSave 全仓零生产调用点 → 整条链是死代码）：
 * 发帖带图片 → 异步触发图片理解 → post_image_meta 落库
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import app from '../../app.js';
import { db } from '../../db.js';
import { getMeta } from '../../multimodal/store.js';
import { generateToken } from '../../utils/jwt.js';

let uid = 0;
let token = '';
let tmpDir = '';
let uploadDir = '';
const createdPosts: number[] = [];

beforeAll(async () => {
  const bcrypt = (await import('bcryptjs')).default;
  const sid = 'mm' + String(Date.now()).slice(-6);
  uid = Number(
    db
      .prepare(
        "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, ?, '多模态测试', 'user', 'active', 100)"
      )
      .run(sid, bcrypt.hashSync('pass12345', 10)).lastInsertRowid
  );
  token = generateToken({ id: uid, studentId: sid, role: 'user', ver: 0 });

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-test-'));
  uploadDir = path.join(process.cwd(), 'public', 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  // 造一张 8x8 蓝色 png
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 30, g: 90, b: 200 } },
  })
    .png()
    .toFile(path.join(tmpDir, 'blue.png'));
  fs.copyFileSync(path.join(tmpDir, 'blue.png'), path.join(uploadDir, 'mm_test_img.png'));
});

afterAll(() => {
  // 测试库开着外键：清理顺序 post_image_meta → posts → 其他子表 → users
  const clean = (sql: string, ...args: any[]) => {
    try { db.prepare(sql).run(...args); } catch { /* 忽略 */ }
  };
  for (const id of createdPosts) {
    clean('DELETE FROM post_image_meta WHERE post_id = ?', id);
    clean('DELETE FROM comments WHERE post_id = ?', id);
    clean('DELETE FROM notifications WHERE post_id = ?', id);
    clean('DELETE FROM posts WHERE id = ?', id);
  }
  clean('DELETE FROM comments WHERE user_id = ?', uid);
  clean('DELETE FROM notifications WHERE user_id = ?', uid);
  clean('DELETE FROM posts WHERE user_id = ?', uid);
  clean('DELETE FROM users WHERE id = ?', uid);
  try { fs.unlinkSync(path.join(uploadDir, 'mm_test_img.png')); } catch { /* 忽略 */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

describe('多模态接线', () => {
  // 共享 SQLite 全量并发跑时偶发锁等待，5s 默认余量不够 → 提到 30s（单跑实测 ~4s）
  it('发帖带图片后，图片理解结果写入 post_image_meta', { timeout: 30_000 }, async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: 2,
        title: '多模态接线测试贴',
        content: '这是一个用于验证图片理解接线的测试帖子，内容足够长以通过校验。',
        images: ['/uploads/mm_test_img.png'],
      });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    const postId = Number(res.body.data?.id);
    expect(Number.isFinite(postId)).toBe(true);
    createdPosts.push(postId);

    // 异步分析：轮询等待落库（最多 ~8s）
    let meta = null as any;
    for (let i = 0; i < 40; i++) {
      meta = getMeta(postId);
      if (meta) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(meta).not.toBeNull();
    // 语义：解析成功与否用 parsed 表达，safe 只在真正判定时有值
    expect(typeof meta!.parsed).toBe('boolean');
    expect(Array.isArray(meta!.labels)).toBe(true);
    expect(meta!.summary.length).toBeGreaterThan(0);
  });
});
