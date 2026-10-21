import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// BDD 포트 — 평행 BDD 가 5173 을 공유하지 않게 하려고 PORT 로 지정한다(#268 Slice 2C).
//   · 기본값 5173 = 기존 동작 그대로(PORT 미지정 시 완전 동일).
//   · 사용: PORT=5198 pnpm test:bdd  → baseURL·webServer 가 5198 로 함께 이동.
//   · CI 기본 동작 유지: CI=1 이면 reuseExistingServer=false(항상 새 서버) — CI 는 PORT 를 지정하지 않는다.
const PORT = Number.parseInt(process.env.PORT ?? '5173', 10) || 5173;
const BASE_URL = `http://localhost:${PORT}`;

// BDD 시나리오 (0.1.0: 홈/health/API smoke — #1/#10). 실패 시 아티팩트 보존, 재시도 0.
const testDir = defineBddConfig({
  features: 'e2e/features/**/*.feature',
  steps: 'e2e/steps/**/*.ts',
});

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm exec vite dev --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
