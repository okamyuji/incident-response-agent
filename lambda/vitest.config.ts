import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)\.js$/, replacement: path.resolve(__dirname, 'src/$1.ts') },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, 'src/$1') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/index.ts',
        'src/shared/bedrock.ts',
        'src/shared/logs.ts',
        'src/shared/types.ts',
      ],
      thresholds: { branches: 70, functions: 80, lines: 80, statements: 80 },
    },
  },
});
