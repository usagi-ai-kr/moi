import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { questions, users } from './schema';

/** `review_bookmarks`(#51): 개인별 북마크, (user_id, question_id) UNIQUE·FK. */
export const reviewBookmarks = sqliteTable(
  'review_bookmarks',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('review_bookmarks_user_question_uq').on(table.userId, table.questionId),
    index('review_bookmarks_user_idx').on(table.userId),
    index('review_bookmarks_question_idx').on(table.questionId),
  ],
);
