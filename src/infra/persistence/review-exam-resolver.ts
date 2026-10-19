import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { exams } from './schema';

export interface ResolvedReviewExam {
  readonly id: string;
  readonly code: string;
}

/** HTTP가 받은 시험 ID 또는 공개 code를 내부 ID와 응답용 code로 정규화한다. */
export function createD1ReviewExamResolver(db: D1Database) {
  const d1 = drizzle(db);

  return {
    async resolve(examIdOrCode: string): Promise<ResolvedReviewExam | null> {
      const byId = await d1
        .select({ id: exams.id, code: exams.code })
        .from(exams)
        .where(eq(exams.id, examIdOrCode))
        .limit(1);
      if (byId[0]) return byId[0];

      const byCode = await d1
        .select({ id: exams.id, code: exams.code })
        .from(exams)
        .where(eq(exams.code, examIdOrCode))
        .limit(1);
      return byCode[0] ?? null;
    },
  };
}
