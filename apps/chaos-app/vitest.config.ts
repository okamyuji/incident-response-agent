import { defineConfig } from 'vitest/config';
import path from 'node:path';

// ハマりポイント:
// 1. vite-tsconfig-paths プラグイン単体では、TS のソース内に書いた `@/foo.js`
//    スタイル（ESM 用の .js 拡張子付き）を解決できませんでした。テスト実行時に
//    "Failed to load url @/app.js" で全 suite が fail します。
// 2. 解決策として Vitest の resolve.alias を直接書き、`@/xxx.js` と `@/xxx` の
//    両パターンを src 内の .ts へマップします（先に .js → .ts の変換を入れないと
//    プロダクションビルド用の import 文と両立できない）。
// 3. Vitest 4 は peer dependency で vite ^6 | ^7 | ^8 を要求するため、vite を
//    devDependency として明示的に入れる必要があります。
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\/(.*)\.js$/,
        replacement: path.resolve(__dirname, 'src/$1.ts'),
      },
      {
        find: /^@\/(.*)$/,
        replacement: path.resolve(__dirname, 'src/$1'),
      },
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
      exclude: ['src/index.ts'],
      thresholds: {
        branches: 65,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
