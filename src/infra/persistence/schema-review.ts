import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './schema';

/**
 * `review_sessions`(#54/#51, ADR-0020/0027): 오답·북마크 복습 회차 스냅샷.
 * - 회차 원본(대상·보기 순서·개정·채점 상태)은 `items` JSON 스냅샷 한 컬럼으로 저장한다(원자적 roundtrip).
 * - `review_sessions_active_uq`: 부분 UNIQUE로 (user_id, exam_id, mode)당 활성 1개만 허용한다.
 *   종료(status='ended') 회차는 대상에서 제외되어 종료 후 같은 축의 새 회차 시작을 막지 않는다.
 */
export const reviewSessions = sqliteTable(
  'review_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    examId: text('exam_id').notNull(),
    mode: text('mode').notNull(),
    status: text('status').notNull(),
    createdAt: integer('created_at').notNull(),
    endedAt: integer('ended_at'),
    cursor: integer('cursor').notNull(),
    items: text('items').notNull(),
  },
  (table) => [
    uniqueIndex('review_sessions_active_uq')
      .on(table.userId, table.examId, table.mode)
      .where(sql`${table.status} = 'active'`),
    index('review_sessions_user_created_idx').on(table.userId, table.createdAt),
  ],
);
