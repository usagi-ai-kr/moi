import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter/index.css';
import '@/ui/styles.css';
import '@/ui/widgets.css';
import { applyTokens, typography } from '@/ui/tokens';
import { App } from '@/ui/App';
import { createApiClient } from '@/ui/api/client';

// 토큰 → CSS 변수 주입 후 렌더 (ADR-0012: 스타일 값의 단일 소스)
applyTokens();

// BrowserRouter는 Route가 생길 때 추가한다 — 현재 라우팅이 없어 초기 번들에서 제외한다 (perf).
function Root() {
  const [queryClient] = useState(() => new QueryClient());
  const [apiClient] = useState(() => createApiClient());
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App client={apiClient} />
      </QueryClientProvider>
    </StrictMode>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('#root 엘리먼트가 없습니다');

createRoot(root).render(<Root />);

// 디스플레이 폰트(KoddiUD)는 첫 페인트·로드 이후 지연 주입 — 대용량 폰트를 임계 경로와
// 초기 측정 구간에서 제외한다. 폰트는 저장소에 재배포하지 않고 눈누가 제공하는 공식
// 웹폰트 경로(tokens.ts)만 사용한다 (라이선스: 형태 그대로·수정 금지, ADR-0014)
const DISPLAY_FONT_DELAY_MS = 1200;
window.addEventListener('load', () => {
  window.setTimeout(() => {
    const style = document.createElement('style');
    style.textContent = `@font-face{font-family:'${typography.displayFontFamily}';src:url('${typography.displayFontUrl}') format('woff');font-weight:700;font-display:swap;}`;
    document.head.appendChild(style);
  }, DISPLAY_FONT_DELAY_MS);
});
