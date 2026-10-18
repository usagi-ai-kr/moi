import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

// 단일 Worker 배포 단위: SPA 정적 자산 + Hono API (ADR-0001/0011)
export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // 디스플레이 폰트(대용량·서브셋 금지)는 CSS에 base64로 내장 — 별도 요청 제거 (ADR-0012)
    assetsInlineLimit: (filePath: string) => (filePath.endsWith('.woff') ? true : undefined),
  },
});
