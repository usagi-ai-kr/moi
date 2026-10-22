import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import { resolveVersion } from './scripts/resolve-version.mjs';

// 단일 Worker 배포 단위: SPA 정적 자산 + Hono API (ADR-0001/0011)
// 버전·빌드 메타는 마일스톤 단일 소스와 HEAD git 로그에서 빌드 시 주입한다.
// 고정값·기본값은 두지 않으며 조회 실패는 fail-closed 로 빌드를 막는다.
export default defineConfig(async () => {
  const { version, pullRequest, buildTime } = await resolveVersion();
  return {
    plugins: [react(), tailwindcss(), cloudflare()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __BUILD_PR__: JSON.stringify(pullRequest),
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
  };
});
