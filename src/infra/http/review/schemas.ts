import { z } from 'zod';

/**
 * 복습 HTTP 경계 스키마 (#51/#130).
 * - Zod는 HTTP 경계에서만 검증한다. userId는 세션에서 얻는다(IDOR 금지).
 * - 채점 입력은 answered/pass만 허용한다(unanswered는 이력용, 채점 입력 아님).
 */
const modeSchema = z.enum(['wrong', 'bookmark']);

export const candidatesQuerySchema = z.object({
  examId: z.string().min(1).max(128),
  mode: modeSchema,
});

export const startSessionBodySchema = z.object({
  examId: z.string().min(1).max(128),
  mode: modeSchema,
});

export const currentQuerySchema = z.object({
  examId: z.string().min(1).max(128),
  mode: modeSchema,
});

const reviewResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('answered'), optionIds: z.array(z.string().min(1).max(128)).min(1).max(20) }),
  z.object({ kind: z.literal('pass') }),
]);

export const answerBodySchema = z.object({
  examId: z.string().min(1).max(128),
  mode: modeSchema,
  questionId: z.string().min(1).max(128),
  response: reviewResponseSchema,
});

export const endBodySchema = z.object({
  examId: z.string().min(1).max(128),
  mode: modeSchema,
});

export const bookmarkQuerySchema = z.object({
  examId: z.string().min(1).max(128),
});

export const bookmarkBodySchema = z.object({
  examId: z.string().min(1).max(128),
  questionId: z.string().min(1).max(128),
  bookmarked: z.boolean(),
});
