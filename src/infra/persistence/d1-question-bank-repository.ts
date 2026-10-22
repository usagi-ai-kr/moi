import { and, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { CreateVersionInput, QuestionBankRepository } from '@/app/question/ports';
import { nextVersionNo } from '@/domain/question/question';
import { toExam, toExamDomain, toQuestion, toQuestionOption, toQuestionVersion } from './question-mapper';
import {
  auditLogs,
  examDomains,
  exams,
  questionOptions,
  questionVersions,
  questions,
} from './schema';

/**
 * D1 문제은행 어댑터 (이슈 #46, ADR-0019).
 * - 읽기/버전 생성/비활성화 최소 집합. 버전 번호는 기존 최대값 + 1로 부여한다.
 * - 정답 부분집합 검증은 app 유스케이스가 저장 전에 수행한다.
 * - 물리 삭제 API를 제공하지 않는다(풀이 이력 문제는 비활성화만).
 */
export function createD1QuestionBankRepository(db: D1Database): QuestionBankRepository {
  const d1 = drizzle(db);

  return {
    async insertExam({ id, code, name, now }) {
      await d1.insert(exams).values({ id, code, name, createdAt: now });
      return { id };
    },

    async insertDomain({ id, examId, code, name, weight }) {
      await d1.insert(examDomains).values({ id, examId, code, name, weight });
      return { id };
    },

    async insertQuestion({ id, examId, domainId, now }) {
      await d1
        .insert(questions)
        .values({ id, examId, domainId, status: 'active', currentVersionNo: null, createdAt: now, updatedAt: now });
      return { id };
    },

    async insertVersion(input: CreateVersionInput) {
      const existing = await d1
        .select({ versionNo: questionVersions.versionNo })
        .from(questionVersions)
        .where(eq(questionVersions.questionId, input.questionId));
      const versionNo = nextVersionNo(existing.map((r) => r.versionNo));
      const now = input.now;
      await d1.batch([
        d1.insert(questionVersions).values({
          id: input.id,
          questionId: input.questionId,
          versionNo,
          stem: input.stem,
          explanation: input.explanation,
          sourceUrls: input.sourceUrls,
          answerOptionIds: input.answerOptionIds,
          optionSetHash: input.optionSetHash,
          reviewStatus: 'pending',
          createdAt: now,
          supersededAt: null,
        }),
        ...input.options.map((o) =>
          d1.insert(questionOptions).values({
            id: o.id,
            questionVersionId: input.id,
            optionKey: o.optionKey,
            text: o.text,
          }),
        ),
        d1
          .update(questions)
          .set({ currentVersionNo: versionNo, updatedAt: now })
          .where(eq(questions.id, input.questionId)),
      ]);
      return { id: input.id, versionNo };
    },

    async deactivateQuestion({ questionId, now }) {
      await d1
        .update(questions)
        .set({ status: 'inactive', updatedAt: now })
        .where(and(eq(questions.id, questionId), eq(questions.status, 'active')));
    },

    async findQuestion({ questionId }) {
      const rows = await d1.select().from(questions).where(eq(questions.id, questionId)).limit(1);
      return rows[0] !== undefined ? toQuestion(rows[0]) : null;
    },

    async findVersion({ questionId, versionNo }) {
      const where =
        versionNo === undefined
          ? eq(questionVersions.questionId, questionId)
          : and(eq(questionVersions.questionId, questionId), eq(questionVersions.versionNo, versionNo));
      const rows = await d1
        .select()
        .from(questionVersions)
        .where(where)
        .orderBy(desc(questionVersions.versionNo))
        .limit(1);
      return rows[0] !== undefined ? toQuestionVersion(rows[0]) : null;
    },

    async findOptionsByVersion({ questionVersionId }) {
      const rows = await d1
        .select()
        .from(questionOptions)
        .where(eq(questionOptions.questionVersionId, questionVersionId));
      return rows.map(toQuestionOption);
    },

    async listActiveQuestions({ examId }) {
      const rows = await d1
        .select()
        .from(questions)
        .where(and(eq(questions.examId, examId), eq(questions.status, 'active')))
        .orderBy(questions.createdAt);
      return rows.map(toQuestion);
    },

    async listDomains({ examId }) {
      const rows = await d1.select().from(examDomains).where(eq(examDomains.examId, examId));
      return rows.map(toExamDomain);
    },

    async findExam({ examId }) {
      const rows = await d1.select().from(exams).where(eq(exams.id, examId)).limit(1);
      return rows[0] !== undefined ? toExam(rows[0]) : null;
    },

    async appendAuditLog({ id, actor, action, targetType, targetId, requestId, now }) {
      await d1
        .insert(auditLogs)
        .values({ id, actor, action, targetType, targetId, requestId, createdAt: now });
    },
  };
}
