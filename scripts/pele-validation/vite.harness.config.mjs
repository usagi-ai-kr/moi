// #179 독립 검증 하네스용 Vite 설정 (제품 vite.config.ts와 분리).
// - root = scripts/pele-validation/harness → 하네스 콘텐츠가 public/·제품 번들에 들어가지 않는다.
// - 제품 소스(src/ui/study/Explanation 등)는 실제 앱과 동일하게 import 한다.
// 사용: PELE_VALIDATION_OUT=<outDir> vite build --config scripts/pele-validation/vite.harness.config.mjs
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = import.meta.dirname;
const harness = resolve(here, 'harness');
const outDir = process.env.PELE_VALIDATION_OUT ?? resolve(here, '../../../pele-validation-build');

export default defineConfig({
  root: harness,
  base: './',
  publicDir: false,
  logLevel: 'warn',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      input: resolve(harness, 'index.html'),
    },
  },
  preview: {
    port: Number(process.env.PELE_VALIDATION_PORT ?? 4195),
    strictPort: true,
  },
});
