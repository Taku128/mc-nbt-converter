import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // Inline mapping JSON into the bundle so browsers don't need fs access.
  loader: {
    '.json': 'json',
  },
  target: 'es2022',
  platform: 'neutral',
  external: ['deepslate'],
});
