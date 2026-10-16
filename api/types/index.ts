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
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
      requestId?: string;
    }
  }
}
