import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { getConceptDetail, getConceptRecommendations } from '@/app/concepts';
import { authenticateSession } from '@/app/session/authenticate-session';
import { createSessionRuntime, type SessionRuntime } from '@/infra/auth/session/runtime';
import { createD1ConceptRecommendationSource } from '@/infra/persistence/concept-recommendation-repository';
import { createD1ReviewExamResolver } from '@/infra/persistence/review-exam-resolver';
import { parseSessionCookieValue } from '@/infra/http/session/cookie';
import { conceptsForExam, findConceptDocument } from './catalog';

const querySchema = z.object({ examId: z.string().trim().min(1).max(128) });
const conceptIdSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);

export interface ConceptRouteOptions {
  readonly createSessionRuntime?: (env: Env, requestId: string) => SessionRuntime;
}

function validationIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({ field: issue.path.map(String).join('.'), code: issue.code }));
}

async function authenticate(c: Context<{ Bindings: Env }>, createSession: NonNullable<ConceptRouteOptions['createSessionRuntime']>) {
  const session = createSession(c.env, crypto.randomUUID());
  const token = parseSessionCookieValue(c.req.header('cookie'));
  const auth = await authenticateSession(session.authenticate, { token, now: Math.floor(Date.now() / 1000) });
  return { session, auth };
}

export function registerConceptRoutes(app: Hono<{ Bindings: Env }>, options?: ConceptRouteOptions): void {
  const createSession = options?.createSessionRuntime ?? ((env, requestId) => createSessionRuntime(env, requestId));

  app.get('/api/concepts/recommendations', async (c) => {
    c.header('Cache-Control', 'no-store');
    const { session, auth } = await authenticate(c, createSession);
    if (auth.outcome !== 'authenticated') {
      session.logger.warn('concept_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'validation_failed', issues: validationIssues(parsed.error) }, 422);
    try {
      const exam = await createD1ReviewExamResolver(c.env.DB).resolve(parsed.data.examId);
      if (!exam) return c.json({ error: 'not_found' }, 404);
      const concepts = conceptsForExam(exam.code);
      const recommendations = await getConceptRecommendations(
        { source: createD1ConceptRecommendationSource(c.env.DB) },
        { userId: auth.userId, examCode: exam.code },
        concepts,
        Date.now(),
      );
      return c.json({
        examId: exam.code,
        total: recommendations.length,
        reviewedContentAvailable: concepts.length > 0,
        items: recommendations.map(({ conceptId, title, relatedQuestionCount, reason }) => ({ conceptId, title, relatedQuestionCount, reason })),
      }, 200);
    } catch {
      session.logger.error('concept_recommendations_failed', 'lookup_failed');
      return c.json({ error: 'internal' }, 500);
    }
  });

  app.get('/api/concepts/:conceptId', async (c) => {
    c.header('Cache-Control', 'no-store');
    const { session, auth } = await authenticate(c, createSession);
    if (auth.outcome !== 'authenticated') {
      session.logger.warn('concept_auth_rejected', 'unauthenticated');
      return c.json({ error: 'unauthorized' }, 401);
    }
    const parsed = querySchema.safeParse(c.req.query());
    const conceptId = conceptIdSchema.safeParse(c.req.param('conceptId'));
    if (!parsed.success || !conceptId.success) {
      const issues = parsed.success ? [{ field: 'conceptId', code: 'invalid_format' }] : validationIssues(parsed.error);
      return c.json({ error: 'validation_failed', issues }, 422);
    }
    try {
      const exam = await createD1ReviewExamResolver(c.env.DB).resolve(parsed.data.examId);
      if (!exam) return c.json({ error: 'not_found' }, 404);
      const concept = findConceptDocument(exam.code, conceptId.data);
      if (!concept) return c.json({ error: 'not_found' }, 404);
      const detail = await getConceptDetail(
        { source: createD1ConceptRecommendationSource(c.env.DB) },
        { userId: auth.userId, examCode: exam.code },
        concept,
      );
      return c.json(detail, 200);
    } catch {
      session.logger.error('concept_detail_failed', 'lookup_failed');
      return c.json({ error: 'internal' }, 500);
    }
  });
}
