import { describe, it, expect } from 'vitest';
import {
  register,
  httpRequestsTotal,
  activeConnections,
  measureDbQuery,
  measureDbQueryAsync,
} from '../../utils/metrics.js';

describe('Prometheus Metrics Utility', () => {
  it('registers metrics in the Prometheus registry', async () => {
    const metricsText = await register.metrics();
    expect(metricsText).toContain('http_requests_total');
    expect(metricsText).toContain('active_connections');
    expect(metricsText).toContain('db_query_duration_seconds');
  });

  it('increments and decrements connection gauges and request counters', async () => {
    activeConnections.inc();
    activeConnections.dec();

    httpRequestsTotal.labels('GET', '/api/test', '200').inc();
    const metricsText = await register.metrics();
    expect(metricsText).toContain('http_requests_total{method="GET",route="/api/test",status_code="200"} 1');
  });

  it('measures synchronous database queries accurately', () => {
    const result = measureDbQuery('test_select', () => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
      return sum;
    });

    expect(result).toBe(499500);
  });

  it('measures asynchronous database queries accurately', async () => {
    const result = await measureDbQueryAsync('test_async_select', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 'done';
    });

    expect(result).toBe('done');
  });

  it('increments errorCount counter when query throws', () => {
    expect(() => {
      measureDbQuery('failing_query', () => {
        throw new Error('Database connection failed');
      });
    }).toThrow('Database connection failed');
  });
});
