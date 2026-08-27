import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'api',
          environment: 'node',
          include: ['api/tests/**/*.test.ts'],
          pool: 'threads',
        },
      },
      {
        test: {
          name: 'web',
          environment: 'happy-dom',
          include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
          pool: 'threads',
        },
      },
    ],
  },
});
