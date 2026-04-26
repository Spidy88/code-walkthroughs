import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@cw/web',
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
