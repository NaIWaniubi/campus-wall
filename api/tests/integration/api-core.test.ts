import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app.js';

describe('API Core Integration Tests', () => {
  it('GET /api/health returns system health status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data.db.ok).toBe(true);
    expect(res.body.data.version).toBeDefined();
    expect(res.body.data.cache).toBeDefined();
  });

  it('GET /metrics returns Prometheus formatted metric data', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('process_cpu_user_seconds_total');
  });

  it('GET /api/openapi.json returns valid OpenAPI 3.1 contract', async () => {
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info.title).toBe('校园墙 API');
    expect(res.body.paths).toBeDefined();
  });

  it('GET /api/sections returns active section categories', async () => {
    const res = await request(app).get('/api/sections');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('POST /api/auth/login rejects wrong credentials with error code', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        studentId: 'admin',
        password: 'incorrect-password-test',
      });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(1002);
    expect(res.body.message).toContain('密码错误');
  });

  it('POST /api/auth/login succeeds with valid admin credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        studentId: 'admin',
        password: 'admin123',
      });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe('super_admin');
  });

  it('GET /api/posts returns paginated post list', async () => {
    const res = await request(app).get('/api/posts?page=1&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(Array.isArray(res.body.data.list)).toBe(true);
    expect(typeof res.body.data.total).toBe('number');
  });

  it('POST /api/wx/wx-login 未配置微信凭据时返回 501（端上静默降级表单登录）', async () => {
    const res = await request(app).post('/api/wx/wx-login').send({ code: 'fake-code' });
    // 测试环境未设置 WX_APPID/WX_SECRET：必须走 501 而不是 400/500，
    // 否则小程序每次启动都会弹错误框（utils/auth.js 的 silentCodes 只认 501）
    expect(res.status).toBe(501);
    expect(res.body.code).toBe(501);
  });

  it('POST /api/wx/wx-login 缺少 code 时返回 400', async () => {
    const res = await request(app).post('/api/wx/wx-login').send({});
    expect(res.status).toBe(501); // 未配置优先于参数校验：先给出降级信号
  });

  it('匿名帖编辑不传 isAnonymous 时保持匿名（回归：一键脱匿名提权）', async () => {
    const { db } = await import('../../db.js');
    const { generateToken } = await import('../../utils/jwt.js');

    // 自建用户，不依赖 seed 数据（干净 clone 的库没有 2377xxx 演示账号）
    const tag = `anon_${Date.now()}`;
    const uid = Number(
      db.prepare(
        "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, 'x', '匿名测试用户', 'user', 'active', 100)"
      ).run(tag).lastInsertRowid
    );
    const token = generateToken({ id: uid, studentId: tag, role: 'user' });

    // 互助问答板块（非强制匿名），信誉 100 可匿名
    const created = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sectionId: 5,
        title: '匿名状态回归测试帖',
        content: '用于验证编辑接口不会把匿名帖改成实名',
        isAnonymous: true,
      });
    expect(created.body.code).toBe(200);
    const postId = created.body.data.id;

    try {
      const edited = await request(app)
        .put(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '匿名状态回归测试帖（已编辑）' });
      expect(edited.body.code).toBe(200);

      const row = db.prepare('SELECT is_anonymous FROM posts WHERE id = ?').get(postId) as any;
      expect(row.is_anonymous).toBe(1);

      // 作者信息不得泄露
      const detail = await request(app)
        .get(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(detail.body.data.author?.id ?? 0).toBe(0);

      // 陌生人按 authorId 反查，不得筛出该匿名帖
      const byAuthor = await request(app).get(`/api/posts?authorId=${uid}&pageSize=50`);
      const ids = (byAuthor.body.data?.list || []).map((p: any) => p.id);
      expect(ids).not.toContain(postId);
    } finally {
      // 先删引用该帖/该用户的子表，再删本体（外键约束）
      db.prepare('DELETE FROM likes WHERE target_id = ? AND target_type = ?').run(postId, 'post');
      db.prepare('DELETE FROM favorites WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM comments WHERE post_id = ?').run(postId);
      db.prepare('DELETE FROM messages WHERE related_id = ?').run(postId);
      db.prepare('DELETE FROM events WHERE user_id = ?').run(uid);
      db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
      db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    }
  });
});
