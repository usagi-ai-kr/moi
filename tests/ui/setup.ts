import '@testing-library/jest-dom/vitest';

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
