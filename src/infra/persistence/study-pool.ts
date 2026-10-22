import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { PoolEntry, QuestionPool } from '@/app/study/ports';
import { examDomains, exams, questionOptions, questionVersions, questions, studySets } from './schema';
import { studyAttempts } from './schema-attempts';
import { collectCompletedAttemptedQuestionIds, type StudyPoolAttemptHistoryEntry } from './study-pool-history';

/**
 * D1 문제 풀 어댑터 (이슈 #49·#311, ADR-0087).
 * - 시험별 활성 문제 + 현재 개정 + 보기 + 영역 가중치를 조회한다.
 * - 제출된 같은 계정·시험 세트의 채점 정답·오답만 questionId 기준으로 기풀이 표시한다.
 * - wrongCount 누적 가중은 별도 범위로 유지한다.
 * - D1 bound parameter 상한(100)을 넘지 않도록 inArray 조회는 청크로 나눈다.
 */
const IN_ARRAY_CHUNK_SIZE = 90;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
export function createD1QuestionPool(db: D1Database, examIdOrCode: string): QuestionPool {
  const d1 = drizzle(db);

  return {
    async listPool(input: { userId: string }): Promise<readonly PoolEntry[]> {
      const examRows = await d1
        .select()
        .from(exams)
        .where(or(eq(exams.id, examIdOrCode), eq(exams.code, examIdOrCode)))
        .limit(1);
      const exam = examRows[0];
      if (!exam) return [];
      const active = await d1
        .select()
        .from(questions)
        .where(and(eq(questions.examId, exam.id), eq(questions.status, 'active')));
      if (active.length === 0) return [];
      const questionIds = active.map((q) => q.id);
      const attemptHistory: StudyPoolAttemptHistoryEntry[] = [];
      for (const ids of chunk(questionIds, IN_ARRAY_CHUNK_SIZE)) {
        const rows = await d1
          .select({
            userId: studyAttempts.userId,
            examId: studyAttempts.examId,
            questionId: studyAttempts.questionId,
            outcome: studyAttempts.outcome,
            source: studyAttempts.source,
            setStatus: studySets.status,
          })
          .from(studyAttempts)
          .innerJoin(studySets, eq(studyAttempts.sourceId, studySets.id))
          .where(
            and(
              eq(studyAttempts.userId, input.userId),
              eq(studyAttempts.examId, examIdOrCode),
              isNull(studyAttempts.excludedAt),
              eq(studyAttempts.source, 'set'),
              eq(studySets.userId, input.userId),
              eq(studySets.examId, examIdOrCode),
              eq(studySets.status, 'submitted'),
              inArray(studyAttempts.questionId, ids),
            ),
          );
        attemptHistory.push(...rows);
      }
      const attemptedQuestionIds = collectCompletedAttemptedQuestionIds(attemptHistory, {
        userId: input.userId,
        examId: examIdOrCode,
      });
      const domains = await d1.select().from(examDomains).where(eq(examDomains.examId, exam.id));
      const weightByDomain = new Map(domains.map((d) => [d.id, d.weight]));
      const versions: Array<typeof questionVersions.$inferSelect> = [];
      for (const ids of chunk(questionIds, IN_ARRAY_CHUNK_SIZE)) {
        const rows = await d1
          .select()
          .from(questionVersions)
          .where(inArray(questionVersions.questionId, ids));
        versions.push(...rows);
      }
      const versionByQuestion = new Map<string, (typeof versions)[number]>();
      for (const v of versions) {
        const q = active.find((item) => item.id === v.questionId);
        if (q && q.currentVersionNo !== null && v.versionNo === q.currentVersionNo) {
          versionByQuestion.set(v.questionId, v);
        }
      }
      const versionIds = [...versionByQuestion.values()].map((v) => v.id);
      const options: Array<typeof questionOptions.$inferSelect> = [];
      for (const ids of chunk(versionIds, IN_ARRAY_CHUNK_SIZE)) {
        const rows = await d1
          .select()
          .from(questionOptions)
          .where(inArray(questionOptions.questionVersionId, ids));
        options.push(...rows);
      }
      const optionIdsByVersion = new Map<string, string[]>();
      const optionsByVersion = new Map<string, Array<{ optionId: string; text: string }>>();
      for (const o of options) {
        const ids = optionIdsByVersion.get(o.questionVersionId) ?? [];
        ids.push(o.id);
        optionIdsByVersion.set(o.questionVersionId, ids);
        const list = optionsByVersion.get(o.questionVersionId) ?? [];
        list.push({ optionId: o.id, text: o.text });
        optionsByVersion.set(o.questionVersionId, list);
      }
      const pool: PoolEntry[] = [];
      for (const q of active) {
        const version = versionByQuestion.get(q.id);
        if (!version) continue;
        pool.push({
          questionId: q.id,
          domainId: q.domainId,
          domainWeight: weightByDomain.get(q.domainId) ?? 0,
          attempted: attemptedQuestionIds.has(q.id),
          wrongCount: 0, // 누적 오답 가중은 별도 범위
          version: {
            questionVersionId: version.id,
            versionNo: version.versionNo,
            optionIds: optionIdsByVersion.get(version.id) ?? [],
            answerOptionIds: version.answerOptionIds,
            stem: version.stem,
            options: optionsByVersion.get(version.id) ?? [],
            explanation: version.explanation,
            sourceUrls: version.sourceUrls,
          },
        });
      }
      return pool;
    },
  };
}
