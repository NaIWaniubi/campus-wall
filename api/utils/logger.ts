import winston from 'winston';
import { config } from '../config.js';

/**
 * 结构化日志系统
 * 使用 Winston 替代 console.log，支持日志分级、格式化和持久化
 */

// 自定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
  config.NODE_ENV === 'production'
    ? winston.format.json()
    : winston.format.printf(({ timestamp, level, message, metadata }) => {
        const meta = metadata && typeof metadata === 'object' && Object.keys(metadata).length 
          ? JSON.stringify(metadata) 
          : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message} ${meta}`;
      })
);

// 创建日志传输器
const transports: winston.transport[] = [
  // 控制台输出（开发环境彩色，生产环境纯文本）
  new winston.transports.Console({
    format: config.NODE_ENV === 'development'
      ? winston.format.combine(
          winston.format.colorize(),
          logFormat
        )
      : logFormat,
  }),
];

// 生产环境添加文件日志
if (config.NODE_ENV === 'production') {
  transports.push(
    // 错误日志单独文件
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    // 所有日志
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
    })
  );
}

/**
 * 全局日志实例
 */
export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: logFormat,
  transports,
  // 处理未捕获的异常和拒绝
  exceptionHandlers: config.NODE_ENV === 'production'
    ? [new winston.transports.File({ filename: 'logs/exceptions.log' })]
    : [],
  rejectionHandlers: config.NODE_ENV === 'production'
    ? [new winston.transports.File({ filename: 'logs/rejections.log' })]
    : [],
});

/**
 * 请求日志中间件
 */
export function requestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 将 requestId 附加到请求对象
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    
    // 记录请求开始
    logger.info('HTTP Request', {
      requestId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id,
    });
    
    // 拦截响应
    const originalSend = res.send;
    res.send = function (data: any) {
      const duration = Date.now() - start;
      
      logger.info('HTTP Response', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userId: req.user?.id,
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * 错误日志中间件
 */
export function errorLogger() {
  return (err: any, req: any, _res: any, next: any) => {
    logger.error('Request Error', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      error: err.message,
      stack: err.stack,
      userId: req.user?.id,
    });
    
    next(err);
  };
}

/**
 * 安全的 JSON 解析（带日志）
 */
export function safeJsonParse<T>(str: string, fallback: T, context?: string): T {
  try {
    return JSON.parse(str);
  } catch (error) {
    logger.warn('JSON Parse Failed', {
      context,
      error: error instanceof Error ? error.message : 'Unknown error',
      input: str.substring(0, 100), // 只记录前 100 字符
    });
    return fallback;
  }
}

/**
 * 带日志的异步函数包装器
 */
export function withLogging<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  name: string
): T {
  return (async (...args: any[]) => {
    const start = Date.now();
    try {
      const result = await fn(...args);
      const duration = Date.now() - start;
      logger.debug(`Function ${name} completed`, { duration: `${duration}ms` });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error(`Function ${name} failed`, {
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }) as T;
}

/**
 * 性能监控日志
 */
export function logPerformance(operation: string, duration: number, metadata?: Record<string, any>) {
  const level = duration > 1000 ? 'warn' : duration > 500 ? 'info' : 'debug';
  logger.log(level, `Performance: ${operation}`, {
    duration: `${duration}ms`,
    ...metadata,
  });
}

/**
 * 安全日志（过滤敏感信息）
 */
export function logSecure(level: string, message: string, data?: Record<string, any>) {
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'authorization'];
  
  const sanitized = data ? Object.entries(data).reduce((acc, [key, value]) => {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      acc[key] = '***REDACTED***';
    } else {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>) : {};
  
  logger.log(level, message, sanitized);
}
