/**
 * Prometheus 监控指标
 */
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';

// 创建注册表并收集系统默认指标
export const register = new Registry();
collectDefaultMetrics({ register });

// HTTP 请求总数
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// HTTP 请求响应时间
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// 当前活跃连接数
export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register],
});

// 数据库查询时间
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

// 缓存命中率
export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  registers: [register],
});

// 错误计数
export const errorCount = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type'],
  registers: [register],
});

/**
 * Prometheus 指标中间件
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    
    // 增加活跃连接
    activeConnections.inc();
    
    // 响应完成时记录指标
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path;
      const statusCode = res.statusCode.toString();
      
      // 记录请求总数
      httpRequestsTotal.labels(req.method, route, statusCode).inc();
      
      // 记录响应时间
      httpRequestDuration.labels(req.method, route, statusCode).observe(duration);
      
      // 减少活跃连接
      activeConnections.dec();
      
      // 记录慢请求
      if (duration > 1) {
        logger.warn('Slow request detected', {
          method: req.method,
          route,
          duration: `${duration.toFixed(3)}s`,
        });
      }
    });
    
    next();
  };
}

/**
 * 数据库查询计时器
 */
export function measureDbQuery<T>(operation: string, query: () => T): T {
  const start = Date.now();
  try {
    const result = query();
    const duration = (Date.now() - start) / 1000;
    dbQueryDuration.labels(operation).observe(duration);
    
    if (duration > 0.1) {
      logger.warn('Slow database query', {
        operation,
        duration: `${duration.toFixed(3)}s`,
      });
    }
    
    return result;
  } catch (error) {
    errorCount.labels('database').inc();
    throw error;
  }
}

/**
 * 异步数据库查询计时器
 */
export async function measureDbQueryAsync<T>(operation: string, query: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await query();
    const duration = (Date.now() - start) / 1000;
    dbQueryDuration.labels(operation).observe(duration);
    
    if (duration > 0.1) {
      logger.warn('Slow database query', {
        operation,
        duration: `${duration.toFixed(3)}s`,
      });
    }
    
    return result;
  } catch (error) {
    errorCount.labels('database').inc();
    throw error;
  }
}

/**
 * 记录缓存指标
 */
export function recordCacheMetrics(hit: boolean) {
  if (hit) {
    cacheHits.inc();
  } else {
    cacheMisses.inc();
  }
}
