import { z } from 'zod';

/**
 * 신고 HTTP 경계 스키마 (이슈 #53).
 * - Zod는 HTTP 경계에서만 검증한다. userId는 세션에서 얻고 body 값은 무시한다(IDOR 금지).
 * - reason은 허용 4개 외부 입력을 422로 막는다.
 */

export const reportBodySchema = z.object({
  questionId: z.string().min(1),
  questionVersionId: z.string().min(1),
  reason: z.enum(['answer', 'explanation', 'ambiguous', 'typo']),
});

export type ReportBody = z.infer<typeof reportBodySchema>;
