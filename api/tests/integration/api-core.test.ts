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
});
