import { z } from 'zod';

/**
 * 관리 API HTTP 경계 스키마 (이슈 #47, ADR-0019).
 * - Zod는 HTTP 경계에서만 검증한다. 도메인 불변식과 구분한다(스킬 규칙).
 * - 422: 스키마·검증 실패. 토큰 원문·payload 원문은 오류에 포함하지 않는다.
 */

const optionSchema = z.object({
  optionKey: z.string().min(1).max(64),
  text: z.string().min(1).max(2000),
});

const sourceUrlsSchema = z.array(z.string().url().max(2048)).max(10).default([]);

export const bulkItemSchema = z.object({
  examCode: z.string().min(1).max(64),
  domainCode: z.string().min(1).max(64),
  stem: z.string().min(1).max(4000),
  explanation: z.string().min(1).max(8000),
  sourceUrls: sourceUrlsSchema,
  answerOptionKeys: z.array(z.string().min(1).max(64)).min(1).max(20),
  optionSetHash: z.string().min(1).max(128),
  options: z.array(optionSchema).min(2).max(20),
});

export const bulkBodySchema = z.object({
  items: z.array(bulkItemSchema).min(1).max(100),
});

export const singleBodySchema = bulkItemSchema;

export const patchBodySchema = z
  .object({
    stem: z.string().min(1).max(4000).optional(),
    explanation: z.string().min(1).max(8000).optional(),
    sourceUrls: z.array(z.string().url().max(2048)).max(10).optional(),
    answerOptionKeys: z.array(z.string().min(1).max(64)).min(1).max(20).optional(),
    optionSetHash: z.string().min(1).max(128).optional(),
    options: z.array(optionSchema).min(2).max(20).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'patch body must not be empty' });

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type BulkBody = z.infer<typeof bulkBodySchema>;
export type SingleBody = z.infer<typeof singleBodySchema>;
export type PatchBody = z.infer<typeof patchBodySchema>;
