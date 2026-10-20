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

// 라우터는 로그인 후 트리에만 지연 주입하여 비로그인 홈 초기 번들을 축소한다 (이슈 #132).
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

// 디스플레이 폰트(KoddiUD)는 첫 페인트·LCP 이후 지연 주입 — 대용량 폰트를 임계 경로와
// 초기 측정 구간에서 제외한다. `font-display:optional`이라 첫 로드에서는 Inter/시스템
// 폴백을 유지하고(늦은 font swap으로 LCP가 흔들리지 않음), 캐시된 이후 로드에서 KoddiUD를
// 사용한다(점진적 향상). 폰트는 저장소에 재배포하지 않고 눈누가 제공하는 공식
// 웹폰트 경로(tokens.ts)만 사용한다 (라이선스: 형태 그대로·수정 금지, ADR-0014).
// preload·임계 경로 편입 금지 (ADR-0014, ADR-0022).
const DISPLAY_FONT_DELAY_MS = 1200;
window.addEventListener('load', () => {
  const inject = () => {
    window.setTimeout(() => {
      const style = document.createElement('style');
      style.textContent = `@font-face{font-family:'${typography.displayFontFamily}';src:url('${typography.displayFontUrl}') format('woff');font-weight:700;font-display:optional;}`;
      document.head.appendChild(style);
    }, DISPLAY_FONT_DELAY_MS);
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(inject, { timeout: 3000 });
  } else {
    inject();
  }
});
