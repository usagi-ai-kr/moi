import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig, type Plugin } from 'vite';

// #132 LCP: 정적 셸(index.html)이 첫 페인트가 되도록 엔트리 실행을 load 이후로 미룬다.
// 모듈 스크립트가 초기 HTML에 있으면 Lighthouse(Lantern)가 FCP/LCP 의존성으로 계산해
// 셸 페인트가 JS 전송·실행 뒤로 밀린다. 로더는 classic inline(즉시 실행·비차단)이고,
// load 후 엔트리를 module script로 주입한다. React createRoot가 #root의 셸을 교체한다.
function deferEntryAfterLoad(): Plugin {
  return {
    name: 'moi-defer-entry-after-load',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<script type="module" crossorigin src="([^"]+)"><\/script>/,
          (_match, src: string) =>
            `<script>window.addEventListener('load',function(){var s=document.createElement('script');s.type='module';s.src='${src}';document.body.appendChild(s);});</script>`,
        );
      },
    },
  };
}

// 단일 Worker 배포 단위: SPA 정적 자산 + Hono API (ADR-0001/0011)
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), deferEntryAfterLoad()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
