import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { questionVersions, questions, studySets } from './schema';

/**
 * `study_corrections`(#53 정정 이벤트): 완료 세트에서 재검수로 판정이 바뀐 문제를 감사 기록한다.
 * (set_id, question_version_id) UNIQUE로 같은 세트·버전의 중복 정정을 막는다. 재계산·적용은 범위 밖.
 */
export const studyCorrections = sqliteTable(
  'study_corrections',
  {
    id: text('id').primaryKey(),
    setId: text('set_id')
      .notNull()
      .references(() => studySets.id),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    questionVersionId: text('question_version_id')
      .notNull()
      .references(() => questionVersions.id),
    reason: text('reason').notNull(),
    source: text('source').notNull(),
    actor: text('actor').notNull().default('system'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('study_corrections_set_version_uq').on(table.setId, table.questionVersionId),
    index('study_corrections_set_id_idx').on(table.setId),
    index('study_corrections_question_version_idx').on(table.questionVersionId),
  ],
);
