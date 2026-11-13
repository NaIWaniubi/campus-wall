/**
 * OpenAPI 文档单测（spec-C T7 裁剪版守门）：
 * 1. 文档可构建且为 OpenAPI 3.1
 * 2. 四域路径齐全（漏登端点时此用例红）
 * 3. 请求 schema 与后端实际校验语义一致（以登录/发帖/草稿为例做正反用例）
 * 4. 每个 operation 都有 responses
 */
import { describe, it, expect } from 'vitest';
import { buildOpenApiDocument } from '../../openapi/document.js';
import { LoginBody, PostBody, DraftBody } from '../../openapi/schemas.js';

const doc = buildOpenApiDocument();

describe('openapi 文档结构', () => {
  it('OpenAPI 3.1 且带契约源说明', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toContain('校园墙');
  });

  it('五域 13 个端点全部登记', () => {
    const paths = Object.keys(doc.paths);
    for (const p of [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/me',
      '/api/auth/password',
      '/api/posts',
      '/api/posts/{id}',
      '/api/conversations',
      '/api/conversations/{id}/messages',
      '/api/drafts',
      '/api/drafts/{id}',
      '/api/push/public-key',
      '/api/push/subscribe',
      '/api/push/unsubscribe',
    ]) {
      expect(paths, `缺路径 ${p}`).toContain(p);
    }
    // 四个 operation 方法抽查
    expect(doc.paths['/api/posts']).toHaveProperty('post');
    expect(doc.paths['/api/posts']).toHaveProperty('get');
    expect(doc.paths['/api/drafts']).toHaveProperty('put');
    expect(doc.paths['/api/drafts']).toHaveProperty('delete');
    // V5：push 域的 501 语义（未配置 VAPID 不骗订阅）必须写进契约
    expect(doc.paths['/api/push/subscribe'].post.responses).toHaveProperty('501');
  });

  it('每个 operation 都声明 responses', () => {
    for (const [path, ops] of Object.entries<any>(doc.paths)) {
      for (const [method, op] of Object.entries<any>(ops)) {
        expect(op.responses, `${method.toUpperCase()} ${path} 缺 responses`).toBeTruthy();
      }
    }
  });
});

describe('契约 schema 语义（与后端校验一致）', () => {
  it('登录：学号+密码必填', () => {
    expect(LoginBody.safeParse({ studentId: '23770001', password: 'demo1234' }).success).toBe(true);
    expect(LoginBody.safeParse({ studentId: '23770001' }).success).toBe(false);
  });

  it('发帖：标题上限 50、sectionId 必须为正整数', () => {
    const base = { title: '正常标题', content: '正常内容' };
    expect(PostBody.safeParse({ ...base, sectionId: 5 }).success).toBe(true);
    expect(PostBody.safeParse({ ...base, sectionId: 0 }).success).toBe(false);
    expect(PostBody.safeParse({ ...base, sectionId: 5, title: 'x'.repeat(51) }).success).toBe(false);
  });

  it('草稿：全字段可选（自动保存空表单不上云由调用方保证）', () => {
    expect(DraftBody.safeParse({}).success).toBe(true);
    expect(DraftBody.safeParse({ sectionId: 1, title: 't' }).success).toBe(true);
  });
});
