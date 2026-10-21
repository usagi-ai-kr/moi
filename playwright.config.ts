import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// BDD 포트 — 평행 BDD 가 5173 을 공유하지 않게 하려고 PORT 로 지정한다(#268 Slice 2C).
//   · 기본값 5173 = 기존 동작 그대로(PORT 미지정 시 완전 동일).
//   · 사용: PORT=5198 pnpm test:bdd  → baseURL·webServer 가 5198 로 함께 이동.
//   · CI 기본 동작 유지: CI=1 이면 reuseExistingServer=false(항상 새 서버) — CI 는 PORT 를 지정하지 않는다.
export const DEFAULT_BDD_PORT = 5173;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

/**
 * PORT 환경변수를 BDD 포트로 해석한다(#268 Slice 2C fix r1).
 * 숫자만 허용하고 1024~65535 범위 안일 때만 그대로 쓴다.
 * 그 외(미지정·빈 값·문자열·부분 숫자·범위 밖·음수)는 DEFAULT_BDD_PORT(5173) 로 떨어뜨린다.
 * 순수 함수 — process.env 의존은 호출부에서 주입한다(테스트 가능).
 */
export function resolvePort(raw: string | undefined): number {
  if (typeof raw !== 'string') return DEFAULT_BDD_PORT;
  if (!/^\d+$/.test(raw)) return DEFAULT_BDD_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) return DEFAULT_BDD_PORT;
  return port;
}

const PORT = resolvePort(process.env.PORT);
const BASE_URL = `http://localhost:${PORT}`;

// 해석 결과도 노출한다 — 설정 배선이 단위 테스트로 검증되도록(#268 Slice 2C fix r1).
export const BDD_PORT = PORT;
export const BDD_BASE_URL = BASE_URL;

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
