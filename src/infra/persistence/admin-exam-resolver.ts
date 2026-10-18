import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { AdminExamResolver } from '@/app/admin/ports';
import { examDomains, exams } from './schema';

/**
 * 시험·영역 코드 해석기 (이슈 #47, ADR-0019).
 * 관리 API payload는 사람이 읽는 코드(exam_code/domain_code)로 참조하고,
 * 서버가 내부 id로 변환한다. 모르는 코드는 422(저장 없음).
 */
export function createD1AdminExamResolver(db: D1Database): AdminExamResolver {
  const d1 = drizzle(db);

  return {
    async resolve({ examCode, domainCode }) {
      const examRows = await d1.select().from(exams).where(eq(exams.code, examCode)).limit(1);
      const exam = examRows[0];
      if (!exam) return null;
      const domainRows = await d1
        .select()
        .from(examDomains)
        .where(and(eq(examDomains.examId, exam.id), eq(examDomains.code, domainCode)))
        .limit(1);
      const domain = domainRows[0];
      if (!domain) return null;
      return { examId: exam.id, domainId: domain.id };
    },
  };
}
