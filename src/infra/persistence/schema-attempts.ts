import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { questions, questionVersions, users } from './schema';

/** `study_attempts`(#54, ADR-0025): 풀이 1회 기록. (source, sourceId, questionId) UNIQUE로 세트/복습 단위 중복 삽입을 막는다. */
export const studyAttempts = sqliteTable(
  'study_attempts',
  {
    attemptId: text('attempt_id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    examId: text('exam_id').notNull(),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    questionVersionId: text('question_version_id')
      .notNull()
      .references(() => questionVersions.id),
    outcome: text('outcome').notNull(),
    occurredAt: integer('occurred_at').notNull(),
    source: text('source').notNull(),
    sourceId: text('source_id').notNull(),
    excludedAt: integer('excluded_at'),
    firstAttempt: integer('first_attempt', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (table) => [
    uniqueIndex('study_attempts_source_source_question_uq').on(table.source, table.sourceId, table.questionId),
    index('study_attempts_user_exam_occurred_idx').on(table.userId, table.examId, table.occurredAt),
    index('study_attempts_user_exam_question_idx').on(table.userId, table.examId, table.questionId),
    index('study_attempts_question_version_idx').on(table.questionVersionId),
  ],
);
