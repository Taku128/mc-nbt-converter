import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: __dirname,
  publicDir: false,
  resolve: {
    alias: {
      '@taku128/mcworld-browser': resolve(__dirname, '../src/index.ts'),
    },
  },
  server: { port: 5174, host: true },
});
