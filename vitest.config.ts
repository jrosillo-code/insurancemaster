import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'tests/security/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
