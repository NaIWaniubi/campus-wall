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
