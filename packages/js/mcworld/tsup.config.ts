import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  target: 'es2022',
  platform: 'node',
  external: ['@taku128/core', 'prismarine-nbt', 'leveldb-zlib', 'adm-zip'],
});
