import type { Context, Hono } from 'hono';
import { authenticateSession } from '@/app/session/authenticate-session';
import { createSessionRuntime, type SessionRuntime } from '@/infra/auth/session/runtime';
import { parseSessionCookieValue } from '@/infra/http/session/cookie';
import { createD1CorrectionRepository } from '@/infra/persistence/study-correction-repository';
import { createD1StudySetRepository } from '@/infra/persistence/study-repository';
import { recomputeCorrectedResult } from '@/domain/study/correction';

/**
 * 완료 세트 정정 이력 조회 API (이슈 #53).
 * - 인증: `__Host-moi_session` 쿠키를 세션 런타임으로 검증한다. 미인증 401.
 * - 세트 없음·타인 소유는 404로 동일 응답한다(존재 여부 비노출).
 * - 200 `{items: CorrectionRecord[], corrected: CorrectedSetResult}` (items는 createdAt asc, id asc).
 *   corrected는 원본 result 불변·유효 분모 재계산(정정 0건이면 원본과 동일).
 * - `Cache-Control: no-store`. 로그에 본문·토큰 원문 금지.
 */

export interface CorrectionListRouteOptions {
  readonly createSessionRuntime?: (env: Env, requestId: string) => SessionRuntime;
}

export function registerCorrectionListRoutes(app: Hono<{ Bindings: Env }>, options?: CorrectionListRouteOptions): void {
  const createSession = options?.createSessionRuntime ?? ((env: Env, requestId: string) => createSessionRuntime(env, requestId));

  app.get('/api/study/sets/:id/corrections', async (c: Context<{ Bindings: Env }>): Promise<Response> => {
    c.header('Cache-Control', 'no-store');
    const session = createSession(c.env, crypto.randomUUID());
    const token = parseSessionCookieValue(c.req.header('cookie'));
    const auth = await authenticateSession(session.authenticate, { token, now: Math.floor(Date.now() / 1000) });
    if (auth.outcome !== 'authenticated') {
      session.logger.warn('correction_list_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    try {
      const setId = c.req.param('id');
      if (!setId) return c.json({ error: 'not_found' }, 404);
      const set = await createD1StudySetRepository(c.env.DB).findById({ id: setId });
      if (!set || set.userId !== auth.userId) return c.json({ error: 'not_found' }, 404);
      const items = await createD1CorrectionRepository(c.env.DB).listBySet(setId);
      const corrected = recomputeCorrectedResult(
        set,
        items.map((item) => item.questionVersionId),
      );
      return c.json({ items, corrected }, 200);
    } catch (err) {
      void err;
      session.logger.error('correction_list_internal', 'unexpected');
      return c.json({ error: 'internal' }, 500);
    }
  });
}
