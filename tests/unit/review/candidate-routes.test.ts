import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

// #268 — 복습 회차 시작 거절 사유를 HTTP 로 구분해 노출한다.
// app 계층을 스텁해 infra 라우트의 매핑만 검증한다(도메인 판정은 use-cases.test.ts 가 담당).
const mocks = vi.hoisted(() => ({
  startReviewSession: vi.fn(),
  getReviewCandidatesView: vi.fn(),
}));

vi.mock('@/app/review', () => ({
  startReviewSession: mocks.startReviewSession,
  getReviewCandidatesView: mocks.getReviewCandidatesView,
}));

const { registerReviewCandidateRoutes } = await import('@/infra/http/review/candidate-routes');

const TOKEN = 'test-token';

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  registerReviewCandidateRoutes(app, {
    createRuntime: () =>
      ({
        logger: { info: () => {}, warn: () => {}, error: () => {} },
        resolveExam: async () => ({ id: 'e-1', code: 'saa-c03' }),
        createDeps: () => ({}),
      }) as never,
    createSessionRuntime: () =>
      ({
        authenticate: {
          tokenVerifier: {
            verify: async () => ({
              outcome: 'valid',
              claims: { sub: 'u1', jti: 'j1', iat: 1700000000, exp: 4102444800 },
            }),
          },
          sessionRepository: {
            findActive: async () => ({ userId: 'u1', expiresAt: 4102444800 }),
          },
          logger: { info: () => {}, warn: () => {} },
        },
      }) as never,
  });
  return app;
}

function start(body: unknown) {
  // 라우트가 c.env.DB 를 읽으므로 env 바인딩을 넘긴다(라우트는 스텁이라 값은 쓰이지 않는다).
  return buildApp().request(
    '/api/review/sessions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `__Host-moi_session=${TOKEN}` },
      body: JSON.stringify(body),
    },
    { DB: {} as D1Database },
  );
}

describe('복습 회차 시작 거절 사유 매핑 (#268)', () => {
  it('invalid_size 는 422 invalid_size 로 노출한다(no_candidates 와 구분)', async () => {
    mocks.startReviewSession.mockResolvedValueOnce({ outcome: 'rejected', reason: 'invalid_size' });
    const res = await start({ examId: 'saa-c03', mode: 'wrong', size: 4 });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'invalid_size' });
  });

  it('no_candidates 는 422 no_candidates 로 노출한다', async () => {
    mocks.startReviewSession.mockResolvedValueOnce({ outcome: 'rejected', reason: 'no_candidates' });
    const res = await start({ examId: 'saa-c03', mode: 'wrong', size: 4 });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'no_candidates' });
  });

  it('active_session_exists 는 409 로 노출한다', async () => {
    mocks.startReviewSession.mockResolvedValueOnce({ outcome: 'rejected', reason: 'active_session_exists' });
    const res = await start({ examId: 'saa-c03', mode: 'wrong', size: 4 });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'active_session_exists' });
  });

  it('Zod 는 size 를 4·8 로 제한한다 — 9 는 도메인에 닿지 않고 422 validation_failed 다', async () => {
    mocks.startReviewSession.mockResolvedValueOnce({ outcome: 'rejected', reason: 'invalid_size' });
    const res = await start({ examId: 'saa-c03', mode: 'wrong', size: 9 });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('validation_failed');
    // Zod 가 먼저 막았다 → app 계층 호출 없음.
    expect(mocks.startReviewSession).not.toHaveBeenCalled();
  });
});
