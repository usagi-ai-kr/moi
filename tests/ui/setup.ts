import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// 테스트 간 DOM 정리 — vitest globals 미사용이므로 RTL cleanup을 명시 등록 (이슈 #40)
afterEach(() => {
  cleanup();
});

// --- 빌드 주입값 테스트 픽스처 ---
// __APP_VERSION__ 은 vite define 이 주입하는 전역이다(마일스톤 단일 소스).
// 프로덕트 코드에는 기본값이 없고(마일스톤 단일 소스), 테스트 환경에서만 고정 픽스처를 제공한다.
{
  const g = globalThis as unknown as { __APP_VERSION__: string };
  g.__APP_VERSION__ = '0.2.4';
}

// --- jsdom 폴리필 (AntD 6) ---
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window.ResizeObserver === 'undefined') {
  Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
}
