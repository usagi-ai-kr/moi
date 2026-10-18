import { Hono } from 'hono';

// Hono 앱 조립 — 라우트 등록 (DI/조립은 src/bootstrap/worker) [ADR-0001/0011]
export function createApp() {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true }));

  // 0.1.3(#4)에서 실제 PASETO 세션 검증으로 대체. 지금은 미인증 응답 계약만 고정.
  app.get('/api/me', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ error: 'unauthorized' }, 401);
  });

  return app;
}
