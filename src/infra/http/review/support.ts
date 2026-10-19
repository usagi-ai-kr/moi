import type { Context } from 'hono';
import { authenticateSession } from '@/app/session/authenticate-session';
import type { SessionRuntime } from '@/infra/auth/session/runtime';
import { parseSessionCookieValue } from '@/infra/http/session/cookie';
import type { ReviewRuntime } from './runtime';

export interface ReviewRouteOptions {
  readonly createRuntime?: (env: Env, requestId: string) => ReviewRuntime;
  readonly createSessionRuntime?: (env: Env, requestId: string) => SessionRuntime;
}

export interface ReviewRouteRuntimeOptions {
  readonly createRuntime: (env: Env, requestId: string) => ReviewRuntime;
  readonly createSessionRuntime: (env: Env, requestId: string) => SessionRuntime;
}

export async function authedUser(c: Context<{ Bindings: Env }>, createSession: ReviewRouteRuntimeOptions['createSessionRuntime']) {
  const session = createSession(c.env, crypto.randomUUID());
  const token = parseSessionCookieValue(c.req.header('cookie'));
  const auth = await authenticateSession(session.authenticate, { token, now: Math.floor(Date.now() / 1000) });
  return { session, auth };
}

export function matchesSnapshot(
  items: readonly { questionId: string; questionVersionId: string }[],
  contents: ReadonlyMap<string, { questionId: string }>,
): boolean {
  return items.every((item) => contents.get(item.questionVersionId)?.questionId === item.questionId);
}
