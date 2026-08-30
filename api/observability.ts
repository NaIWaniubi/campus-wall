/**
 * 可观测性初始化（Sentry，凭据门控）：
 * - SENTRY_DSN 未配置 → 完全 no-op（本地开发/未上线零负担）
 * - 配置后自动捕获未处理异常；HTTP 5xx 另在 app.ts 错误中间件显式 captureException
 * 需在所有业务模块导入前执行（本文件由 server.ts 首行导入）。
 */
import * as Sentry from '@sentry/node';

export function initObservability(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    // 只收错误，不开性能采样（需要时再加 tracesSampleRate）
    tracesSampleRate: 0,
  });
  console.log('[sentry] 已启用错误上报');
}

/** 便捷导出：错误中间件/异步任务里直接调用，未启用时静默跳过 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN?.trim()) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
