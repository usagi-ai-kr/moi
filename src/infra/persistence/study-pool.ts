import { and, eq, inArray, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { PoolEntry, QuestionPool } from '@/app/study/ports';
import { examDomains, exams, questionOptions, questionVersions, questions } from './schema';

/**
 * D1 문제 풀 어댑터 (이슈 #49 후속, ADR-0020).
 * - #46 스키마에서 시험별 활성 문제 + 현재 개정 + 보기 + 영역 가중치를 조회한다.
 * - 시험 식별은 id·code 모두 받는다(UI는 안정적인 코드를 사용).
 * - 풀이 이력 기반 attempted/wrongCount는 #51/#52 전까지 0/false로 둔다(TODO).
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
    async listPool(): Promise<readonly PoolEntry[]> {
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
          attempted: false, // TODO(#51/#52): 풀이 이력에서 계산
          wrongCount: 0, // TODO(#51/#52): 유효 누적 오답에서 계산
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
