/**
 * 统一响应工具
 */
import type { Response } from 'express';

export function success(res: Response, data: any = null, message: string = '操作成功') {
  res.json({ code: 200, message, data });
}

export function fail(res: Response, message: string, code: number = 400, status: number = 200) {
  res.status(status).json({ code, message, data: null });
}

export function unauthorized(res: Response, message: string = '未登录或登录已过期') {
  res.status(200).json({ code: 401, message, data: null });
}

export function forbidden(res: Response, message: string = '无权限访问') {
  res.status(200).json({ code: 403, message, data: null });
}

/**
 * 把对象/数组里形如 student_id/credit_score/created_at 的 snake_case key
 * 统一转成 camelCase（studentId/creditScore/createdAt）。
 * 嵌套对象（author/section 等）会递归处理。
 * 若值是 `Date` 实例，递归前先 `.toISOString()`，确保响应体里时间字段统一是 ISO 字符串。
 * 用于 auth/users 系列接口响应序列化，与全站其它已 camelCase 的接口保持一致。
 */
export function toCamel<T = any>(input: any): T {
  if (input == null) return input;
  if (Array.isArray(input)) {
    return input.map((v) => toCamel(v)) as unknown as T;
  }
  if (typeof input !== 'object') return input;
  // Date -> ISO 字符串；Buffer/RegExp 保留原样
  if (input instanceof Date) {
    return input.toISOString() as unknown as T;
  }
  if (input instanceof RegExp || input instanceof Buffer) {
    return input as unknown as T;
  }
  const out: Record<string, any> = {};
  for (const k of Object.keys(input)) {
    const camel = k.replace(/_([a-z0-9])/g, (_m, c) => String(c).toUpperCase());
    out[camel] = toCamel(input[k]);
  }
  return out as T;
}
