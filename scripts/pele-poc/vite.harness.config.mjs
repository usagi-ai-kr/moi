// #168 Pele PoC 하네스 vite 설정 (임시 PoC, 커밋 대상 아님)
// 사용: POC_OUT=<outDir> vite build --config scripts/pele-poc/vite.harness.config.mjs
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const here = import.meta.dirname;
const harness = resolve(here, 'harness');
const outDir = process.env.POC_OUT ?? resolve(here, '../../../pele-poc/build');

export default defineConfig({
  root: harness,
  base: '/',
  logLevel: 'warn',
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
    port: Number(process.env.POC_PORT ?? 4176),
    strictPort: true,
  },
});
