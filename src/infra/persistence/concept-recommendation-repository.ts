import type { ConceptEvidence, ConceptRecommendationSource } from '@/app/concepts/ports';
import { createD1ReviewExamResolver } from './review-exam-resolver';
import { findConceptQuestionTag } from './concept-question-index';

interface ActiveQuestionRow {
  readonly questionId: string;
  readonly examId: string;
  readonly versionId: string;
  readonly stem: string;
  readonly domainCode: string;
}

interface AttemptRow {
  readonly questionId: string;
  readonly versionId: string;
  readonly outcome: string;
  readonly occurredAt: number;
  readonly rowId: number;
}

/** 인증 계정·선택 시험의 현재 활성 문제만 개인화 신호로 읽는다. D1 쓰기는 없다. */
export function createD1ConceptRecommendationSource(db: D1Database): ConceptRecommendationSource {
  const examResolver = createD1ReviewExamResolver(db);

  return {
    async listUserSignals({ userId, examCode }): Promise<readonly ConceptEvidence[]> {
      const exam = await examResolver.resolve(examCode);
      if (!exam) return [];
      const questions = await db
        .prepare(
          'SELECT q.id AS questionId, q.exam_id AS examId, v.id AS versionId, v.stem AS stem, d.code AS domainCode ' +
            'FROM questions q JOIN question_versions v ON v.question_id = q.id AND v.version_no = q.current_version_no ' +
            'JOIN exam_domains d ON d.id = q.domain_id ' +
            "WHERE q.exam_id = ?1 AND q.status = 'active' ORDER BY q.id",
        )
        .bind(exam.id)
        .all<ActiveQuestionRow>();
      const active = questions.results ?? [];
      if (active.length === 0) return [];

      const attemptRows = await db
        .prepare(
          'SELECT question_id AS questionId, question_version_id AS versionId, outcome, occurred_at AS occurredAt, rowid AS rowId ' +
            'FROM study_attempts WHERE user_id = ?1 AND exam_id IN (?2, ?3, ?4) AND excluded_at IS NULL ORDER BY occurred_at, rowid',
        )
        .bind(userId, examCode, exam.id, exam.code)
        .all<AttemptRow>();
      const attemptsByQuestion = new Map<string, AttemptRow[]>();
      for (const attempt of attemptRows.results ?? []) {
        const rows = attemptsByQuestion.get(attempt.questionId) ?? [];
        rows.push(attempt);
        attemptsByQuestion.set(attempt.questionId, rows);
      }

      const bookmarkRows = await db
        .prepare('SELECT question_id AS questionId FROM review_bookmarks WHERE user_id = ?1')
        .bind(userId)
        .all<{ readonly questionId: string }>();
      const bookmarkIds = new Set((bookmarkRows.results ?? []).map((row) => row.questionId));
      const output: ConceptEvidence[] = [];

      for (const question of active) {
        const tag = await findConceptQuestionTag(question.stem);
        if (!tag || tag.examCode !== exam.code || tag.domainCode !== question.domainCode) continue;
        const history = attemptsByQuestion.get(question.questionId) ?? [];
        const currentHistory = history.filter((attempt) => attempt.versionId === question.versionId);
        const latestCurrent = currentHistory.at(-1);
        const latestLegacy = history.filter((attempt) => attempt.versionId !== question.versionId).at(-1);
        const latestOutcome = latestCurrent?.outcome;
        const hasWrongSource = latestOutcome !== undefined ? latestOutcome !== 'correct' : history.length > 0;
        const validWrongCount = latestOutcome === 'correct'
          ? 0
          : currentHistory.filter((attempt) => attempt.outcome === 'wrong' || attempt.outcome === 'pass' || attempt.outcome === 'unanswered').length;
        const legacyLastWrongAt = latestCurrent ? null : latestLegacy && latestLegacy.outcome !== 'correct' ? latestLegacy.occurredAt : null;
        const lastWrongAt = latestOutcome === 'correct'
          ? null
          : [...currentHistory].reverse().find((attempt) => attempt.outcome === 'wrong' || attempt.outcome === 'pass' || attempt.outcome === 'unanswered')?.occurredAt ?? legacyLastWrongAt;
        const bookmarked = bookmarkIds.has(question.questionId);
        if (!hasWrongSource && !bookmarked) continue;
        output.push({
          sourceQuestionId: tag.sourceQuestionId,
          questionId: question.questionId,
          stem: question.stem,
          conceptIds: [tag.conceptId],
          validWrongCount: hasWrongSource ? validWrongCount : 0,
          lastWrongAt: hasWrongSource ? lastWrongAt : null,
          bookmarked,
        });
      }
      return output.sort((left, right) =>
        left.sourceQuestionId < right.sourceQuestionId ? -1 : left.sourceQuestionId > right.sourceQuestionId ? 1 : 0,
      );
    },
  };
}
