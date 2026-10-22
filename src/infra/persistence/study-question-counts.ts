import type { StudyQuestionCountPort } from '@/app/stats/ports';

interface QuestionCountRow {
  readonly domain_id: string;
  readonly total: number;
}

/** 현재 버전이 있는 활성 문제를 시험·영역별로 세는 읽기 전용 D1 어댑터 (#330). */
export function createD1StudyQuestionCountPort(db: D1Database): StudyQuestionCountPort {
  return {
    async loadByDomain({ examId }): Promise<Readonly<Record<string, number>>> {
      const result = await db
        .prepare(
          'SELECT q.domain_id AS domain_id, COUNT(DISTINCT q.id) AS total ' +
            'FROM questions q ' +
            'JOIN exams e ON e.id = q.exam_id ' +
            'JOIN question_versions v ON v.question_id = q.id AND v.version_no = q.current_version_no ' +
            'WHERE (e.id = ?1 OR e.code = ?1) AND q.status = ?2 ' +
            'GROUP BY q.domain_id',
        )
        .bind(examId, 'active')
        .all<QuestionCountRow>();
      return Object.fromEntries((result.results ?? []).map((row) => [row.domain_id, Number(row.total)]));
    },
  };
}
