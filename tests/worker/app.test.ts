import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

// Worker 라우팅·API 계약 스모크 (ADR-0011: /api/*가 Hono로 도달)
describe('Worker /api 스모크', () => {
  it('GET /api/health → 200 {"ok":true}', async () => {
    const res = await exports.default.fetch('http://moi.test/api/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('GET /api/me → 401 + Cache-Control: no-store', async () => {
    const res = await exports.default.fetch('http://moi.test/api/me');
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
