import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // 集成测试共享同一个 SQLite 文件（api/data.db，WAL 模式），文件级并行会互相踩踏：
    // 一个用例删表/删行时另一个用例正在读，偶发出现「单跑绿、全量红」。
    // 测试量很小（149 个用例约 20s），串行执行换取确定性，避免 CI 偶发红。
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'api',
          environment: 'node',
          include: ['api/tests/**/*.test.ts'],
          pool: 'threads',
          poolOptions: { threads: { singleThread: true } },
        },
      },
      {
        plugins: [vue()],
        resolve: {
          alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
          },
        },
        test: {
          name: 'web',
          environment: 'happy-dom',
          include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
          pool: 'threads',
        },
      },
      {
        test: {
          name: 'mini',
          environment: 'node',
          include: ['tests/miniprogram/**/*.test.ts'],
          pool: 'threads',
        },
      },
    ],
    // 覆盖率（@vitest/coverage-v8）：只统计三端业务源码，测试文件与入口不计入
    coverage: {
      provider: 'v8',
      include: ['api/**/*.ts', 'src/**/*.{ts,vue}'],
      exclude: [
        'api/tests/**',
        'api/env.ts',
        'api/seed-demo.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/vite-env.d.ts',
      ],
      reporter: ['text', 'html'],
    },
  },
});
