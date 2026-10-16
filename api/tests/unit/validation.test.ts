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

    it('rejects invalid student ID format', () => {
      expect(() => commonSchemas.studentId.parse('1234')).toThrow();
      expect(() => commonSchemas.studentId.parse('abcdefgh')).toThrow();
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
