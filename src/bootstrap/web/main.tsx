import { createRoot } from 'react-dom/client';
import { Root } from './routes'; // StrictMode·라우트 경계는 Root(routes.tsx)에만 둔다 (이슈 #121)
import { typography } from '@/ui/tokens';

// BrowserRouter는 /licenses 공개 고지 페이지(Root 내 경계)에서 최소한으로만 사용한다 (이슈 #121).

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
