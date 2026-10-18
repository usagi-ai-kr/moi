import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource-variable/inter/index.css';
import '@/ui/styles.css';
import { applyTokens } from '@/ui/tokens';
import { App } from '@/ui/App';

// 토큰 → CSS 변수 주입 후 렌더 (ADR-0012: 스타일 값의 단일 소스)
applyTokens();

const root = document.getElementById('root');
if (!root) throw new Error('#root 엘리먼트가 없습니다');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// 디스플레이 폰트(KoddiUD)는 첫 페인트·로드 이후 지연 로드 — 대용량 폰트를 임계 경로와
// 초기 측정 구간에서 제외하고, 렌더 차단 스타일시트를 만들지 않도록 <style> 주입 방식을 쓴다 (ADR-0012)
const DISPLAY_FONT_DELAY_MS = 1200;
window.addEventListener('load', () => {
  window.setTimeout(() => {
    void import('@/ui/display-font.css?inline').then((mod) => {
      const style = document.createElement('style');
      style.textContent = mod.default;
      document.head.appendChild(style);
    });
  }, DISPLAY_FONT_DELAY_MS);
});
