import { z } from 'zod';

/**
 * 학습 세트 HTTP 경계 스키마 (이슈 #49 후속, ADR-0020).
 * - Zod는 HTTP 경계에서만 검증한다. userId는 세션에서 얻고 body 값은 무시한다(IDOR 금지).
 */

const modeSchema = z.enum(['all', 'domain', 'weak']);

export const startSetBodySchema = z.object({
  examId: z.string().min(1).max(128),
  mode: modeSchema,
  domainId: z.string().min(1).max(128).optional(),
});

const responseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('answered'), optionIds: z.array(z.string().min(1).max(128)).min(1).max(20) }),
  z.object({ kind: z.literal('pass') }),
  z.object({ kind: z.literal('unanswered') }),
]);

export const answerBodySchema = z.object({
  questionId: z.string().min(1).max(128),
  response: responseSchema,
});

export const submitBodySchema = z.object({
  confirmUnanswered: z.boolean(),
});

export const abandonBodySchema = z.object({
  confirm: z.boolean(),
});

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** 현재 활성 세트 조회 — 빈 값·누락 모두 422로 거부한다(#148). */
export const currentSetQuerySchema = z.object({
  examId: z.string().min(1).max(128),
});

export type StartSetBody = z.infer<typeof startSetBodySchema>;
export type AnswerBody = z.infer<typeof answerBodySchema>;
