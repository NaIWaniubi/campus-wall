/**
 * 类型定义统一导出
 */

export * from './database.js';
export * from './api.js';

export interface CurrentUser {
  id: number;
  studentId: string;
  role: string;
  nickname: string;
  creditScore: number;
  status: string;
  /** 微信 openid：小程序登录用户才有，用于 msgSecCheck；Web 用户为空 */
  openid?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
      requestId?: string;
    }
  }
}
