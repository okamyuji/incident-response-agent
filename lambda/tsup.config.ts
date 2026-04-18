import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'triage-haiku': 'src/triage-haiku/index.ts',
    'investigate-sonnet': 'src/investigate-sonnet/index.ts',
    'rca-opus': 'src/rca-opus/index.ts',
  },
  format: ['esm'],
  target: 'node22',
  // Lambda runtimes currently go up to nodejs22.x; tsup target tracks that,
  // even though our local dev/build uses Node 24.
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  minify: false,
  bundle: true,
  platform: 'node',
  noExternal: [/(.*)/],
});
