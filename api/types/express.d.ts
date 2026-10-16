/**
 * Express 类型扩展
 * 为 Request 对象添加自定义属性的类型声明
 */
import 'express';

declare global {
  namespace Express {
    interface Request {
      /**
       * 当前已认证用户信息（由 authRequired/authOptional 中间件注入）
       */
      currentUser?: {
        id: number;
        studentId: string;
        role: 'user' | 'admin';
      };
      
      /**
       * 请求唯一标识符（用于日志追踪）
       */
      id?: string;
      requestId?: string;
    }
  }
}
