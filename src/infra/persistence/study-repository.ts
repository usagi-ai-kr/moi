import { and, count, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ConcurrentSetConflictError, type StudySetRepository } from '@/app/study/ports';
import { toStudySet } from './study-mapper';
import { studySetItems, studySets } from './schema';

/**
 * D1 학습 세트 어댑터 (이슈 #49 후속, ADR-0020).
 * - set+items를 D1 batch로 원자 저장한다(upsert set + items 교체).
 * - 동시 시작 경합: 부분 UNIQUE(user_id, exam_id WHERE active)가 batch를 거부하면
 *   ConcurrentSetConflictError로 변환한다(라우트는 409 active_set_exists).
 * - 결과 JSON 왕복. 포기 세트는 result 없이 저장한다.
 */
export function createD1StudySetRepository(db: D1Database): StudySetRepository {
  const d1 = drizzle(db);

  return {
    async findActive({ userId, examId }) {
      const rows = await d1
        .select()
        .from(studySets)
        .where(and(eq(studySets.userId, userId), eq(studySets.examId, examId), eq(studySets.status, 'active')))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return toStudySet(row, await listItems(row.id));
    },

    async save({ set }) {
      const items = set.items.map((item) => ({
        setId: set.id,
        questionId: item.questionId,
        questionVersionId: item.questionVersionId,
        versionNo: item.versionNo,
        optionOrder: [...item.optionOrder],
        answerOptionIds: [...item.answerOptionIds],
        stem: item.stem,
        options: item.options.map((o) => ({ optionId: o.optionId, text: o.text })),
        explanation: item.explanation,
        sourceUrls: [...item.sourceUrls],
        responseKind: item.response.kind,
        selectedOptionIds: item.response.kind === 'answered' ? [...item.response.optionIds] : [],
      }));
      try {
        await d1.batch([
          d1
            .insert(studySets)
            .values({
              id: set.id,
              userId: set.userId,
              examId: set.examId,
              mode: set.mode,
              domainId: set.domainId ?? null,
              status: set.status,
              createdAt: set.createdAt,
              submittedAt: set.submittedAt ?? null,
              resultJson: set.result ?? null,
            })
            .onConflictDoUpdate({
              target: studySets.id,
              set: {
                status: set.status,
                submittedAt: set.submittedAt ?? null,
                resultJson: set.result ?? null,
              },
            }),
          d1.delete(studySetItems).where(eq(studySetItems.setId, set.id)),
          ...items.map((item) => d1.insert(studySetItems).values(item)),
        ]);
      } catch (err) {
        if (err instanceof Error && /UNIQUE constraint failed: study_sets/.test(err.message)) {
          throw new ConcurrentSetConflictError();
        }
        throw err;
      }
    },

    async findById({ id }) {
      const rows = await d1.select().from(studySets).where(eq(studySets.id, id)).limit(1);
      const row = rows[0];
      if (!row) return null;
      return toStudySet(row, await listItems(row.id));
    },

    async submit({ set }) {
      // 조건부 전이: active일 때만 submitted로 갱신한다. 세트 items는 이미 저장된 스냅샷을 그대로 둔다.
      const result = await db
        .prepare(
          "UPDATE study_sets SET status = 'submitted', submitted_at = ?1, result_json = ?2 WHERE id = ?3 AND status = 'active'",
        )
        .bind(set.submittedAt ?? null, set.result !== undefined ? JSON.stringify(set.result) : null, set.id)
        .run();
      const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0;
      return changes === 1;
    },

    async listCompleted({ userId, page, pageSize }) {
      const offset = (Math.max(page, 1) - 1) * Math.max(pageSize, 1);
      const rows = await d1
        .select()
        .from(studySets)
        .where(and(eq(studySets.userId, userId), eq(studySets.status, 'submitted')))
        .orderBy(desc(studySets.submittedAt))
        .limit(Math.max(pageSize, 1))
        .offset(offset);
      const sets = [];
      for (const row of rows) {
        sets.push(toStudySet(row, await listItems(row.id)));
      }
      const [{ total }] = await d1
        .select({ total: count() })
        .from(studySets)
        .where(and(eq(studySets.userId, userId), eq(studySets.status, 'submitted')));
      return { items: sets, total };
    },
  };

  async function listItems(setId: string) {
    return d1.select().from(studySetItems).where(eq(studySetItems.setId, setId));
  }
}
