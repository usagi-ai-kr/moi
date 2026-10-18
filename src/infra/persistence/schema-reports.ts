import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { questions, questionVersions, users } from './schema';

/** `question_reports`(#53): 버전별 신고, 같은 계정 중복 신고 방지(버전·계정 UNIQUE). */
export const questionReports = sqliteTable(
  'question_reports',
  {
    id: text('id').primaryKey(),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    questionVersionId: text('question_version_id')
      .notNull()
      .references(() => questionVersions.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('question_reports_version_user_uq').on(table.questionVersionId, table.userId),
    index('question_reports_version_id_idx').on(table.questionVersionId),
    index('question_reports_user_id_idx').on(table.userId),
  ],
);

/** `question_recheck_queue`(#53): 문제 버전별 재검수 상태(버전과 1:1), attempts·lastAttemptAt·startedAt. */
export const questionRecheckQueue = sqliteTable('question_recheck_queue', {
  questionVersionId: text('question_version_id')
    .primaryKey()
    .references(() => questionVersions.id),
  status: text('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  lastAttemptAt: integer('last_attempt_at'),
  startedAt: integer('started_at'),
  updatedAt: integer('updated_at').notNull(),
});
