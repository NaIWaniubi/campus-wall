import { describe, it, expect, vi } from 'vitest';
import { commonSchemas, userSchemas, postSchemas, commentSchemas, validate } from '../../utils/validation.js';
import type { Request, Response, NextFunction } from 'express';

describe('Validation Schemas & Middleware', () => {
  describe('commonSchemas.studentId', () => {
    it('accepts 8-digit student ID', () => {
      expect(commonSchemas.studentId.parse('20240001')).toBe('20240001');
    });

    it('accepts special admin identifier', () => {
      expect(commonSchemas.studentId.parse('admin')).toBe('admin');
    });

    it('accepts non-numeric accounts (no longer forced to be a student ID)', () => {
      expect(commonSchemas.studentId.parse('1234')).toBe('1234');
      expect(commonSchemas.studentId.parse('abcdefgh')).toBe('abcdefgh');
    });

    it('enforces the generic account rule: 3-32 chars, ASCII, no spaces', () => {
      expect(commonSchemas.account.parse('chenxiaobei')).toBe('chenxiaobei');
      expect(commonSchemas.account.parse('13800138000')).toBe('13800138000');
      expect(commonSchemas.account.parse('chen.xb@campus')).toBe('chen.xb@campus');
      expect(() => commonSchemas.account.parse('ab')).toThrow();          // 太短
      expect(() => commonSchemas.account.parse('a'.repeat(33))).toThrow(); // 太长
      expect(() => commonSchemas.account.parse('张三')).toThrow();        // 非 ASCII
      expect(() => commonSchemas.account.parse('a b')).toThrow();         // 含空格
    });
  });

  describe('commonSchemas.password', () => {
    it('accepts strong password meeting complexity requirements', () => {
      const valid = 'Pass1234!';
      expect(commonSchemas.password.parse(valid)).toBe(valid);
    });

    it('rejects password without uppercase letter', () => {
      expect(() => commonSchemas.password.parse('password123')).toThrow();
    });

    it('rejects password without number', () => {
      expect(() => commonSchemas.password.parse('PasswordABC')).toThrow();
    });

    it('rejects password shorter than 8 characters', () => {
      expect(() => commonSchemas.password.parse('P1a')).toThrow();
    });
  });

  describe('userSchemas', () => {
    it('validates user registration payload', () => {
      const valid = {
        studentId: '20240001',
        password: 'Password123!',
        nickname: ' 测试小明 ',
        college: '计算机学院',
      };
      const res = userSchemas.register.parse(valid);
      expect(res.studentId).toBe('20240001');
      expect(res.nickname).toBe('测试小明');
      expect(res.college).toBe('计算机学院');
    });

    it('registers with a plain account and no college (学号不再必填)', () => {
      const res = userSchemas.register.parse({
        account: 'chenxiaobei',
        password: 'abc123',
        nickname: '小北',
      });
      expect(res.account).toBe('chenxiaobei');
      expect(res.studentId).toBe('chenxiaobei'); // 兼容字段同步
      expect(res.college).toBeUndefined();
    });

    it('accepts phone number as account, rejects short password', () => {
      expect(userSchemas.register.parse({
        account: '13800138000', password: 'abc123', nickname: '手机用户',
      }).account).toBe('13800138000');
      expect(() => userSchemas.register.parse({
        account: 'chenxiaobei', password: 'abc', nickname: '小北',
      })).toThrow();
    });

    it('login accepts account without studentId', () => {
      const res = userSchemas.login.parse({ account: 'chen.xb', password: 'whatever' });
      expect(res.account).toBe('chen.xb');
      expect(res.studentId).toBe('chen.xb');
    });

    it('validates user login payload', () => {
      const valid = {
        studentId: 'admin',
        password: 'adminPassword1',
      };
      const res = userSchemas.login.parse(valid);
      expect(res.studentId).toBe('admin');
      expect(res.password).toBe('adminPassword1');
    });
  });

  describe('postSchemas.create', () => {
    it('validates and trims title & content', () => {
      const result = postSchemas.create.parse({
        sectionId: 1,
        title: '  测试标题  ',
        content: '  测试内容  ',
        isAnonymous: false,
      });
      expect(result.title).toBe('测试标题');
      expect(result.content).toBe('测试内容');
      expect(result.isAnonymous).toBe(false);
    });

    it('rejects invalid sectionId out of range', () => {
      expect(() => postSchemas.create.parse({
        sectionId: 99,
        title: '标题',
        content: '内容',
      })).toThrow();
    });

    it('rejects empty title or content', () => {
      expect(() => postSchemas.create.parse({
        sectionId: 1,
        title: '',
        content: '内容',
      })).toThrow();
    });
  });

  describe('commentSchemas.create', () => {
    it('validates comment content', () => {
      const result = commentSchemas.create.parse({
        content: ' 这是评论内容 ',
        isAnonymous: true,
      });
      expect(result.content).toBe('这是评论内容');
      expect(result.isAnonymous).toBe(true);
    });

    it('rejects empty comment', () => {
      expect(() => commentSchemas.create.parse({ content: '   ' })).toThrow();
    });
  });

  describe('validate middleware', () => {
    it('calls next() when body passes schema', () => {
      const middleware = validate({ body: postSchemas.create });
      const req = {
        body: {
          sectionId: 1,
          title: '合法标题',
          content: '合法内容',
        },
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 400 when body fails schema validation', () => {
      const middleware = validate({ body: postSchemas.create });
      const req = {
        body: {
          sectionId: 999, // 非法板块
          title: '',
        },
      } as unknown as Request;
      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = {
        status: statusMock,
        json: jsonMock,
      } as unknown as Response;
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res, next);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 400,
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});
