import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { ReviewSessionRepository } from '@/app/review/ports';
import type { ReviewSession } from '@/domain/review/types';
import { isSameEndedSnapshot, toDomain, toInsert, toUpdateSet } from './review-session-mapper';
import { reviewSessions } from './schema-review';

/**
 * ReviewSessionRepository D1 어댑터(#54/#51, ADR-0020/0027).
 * - 활성 회차 1개는 부분 UNIQUE(review_sessions_active_uq)가 D1에서 강제한다.
 * - save 허용 범위: ① 신규 활성 회차(INSERT) ② 활성 회차의 진행 갱신 ③ 종료 회차의 동일 스냅샷 재저장(멱등, 쓰기 없음).
 * - 종료는 end({session, expectedCursor}) 전용 CAS로만 수행한다.
 * - 신규 활성이 같은 (userId, examId, mode)의 다른 활성 회차와 충돌하면 부분 UNIQUE 위반으로 실패한다.
 * - 소유자(userId/examId/mode) 변경·다른 회차 덮어쓰기·종료 회차 이력 수정·종료 회차 부활은 거부한다.
 * - save 갱신 UPDATE의 WHERE에 status='active'+소유축을 넣어 SELECT~UPDATE 사이 종료 경합에서의 부활을 막는다.
 * - 종료 UPDATE는 status='active'+소유축+expectedCursor CAS를 적용해 답안 commit과 경합한다(ADR-0041).
 */
export function createD1ReviewSessionRepository(db: D1Database): ReviewSessionRepository {
  const d1 = drizzle(db);

  return {
    async findActive({ userId, examId, mode }): Promise<ReviewSession | null> {
      const rows = await d1
        .select()
        .from(reviewSessions)
        .where(
          and(
            eq(reviewSessions.userId, userId),
            eq(reviewSessions.examId, examId),
            eq(reviewSessions.mode, mode),
            eq(reviewSessions.status, 'active'),
          ),
        )
        .limit(1);
      return rows[0] ? toDomain(rows[0]) : null;
    },

    async save({ session }: { session: ReviewSession }): Promise<void> {
      const rows = await d1.select().from(reviewSessions).where(eq(reviewSessions.id, session.id)).limit(1);
      const existing = rows[0];
      if (!existing) {
        if (session.status !== 'active') throw new Error(`복습 회차는 활성 상태로만 새로 시작한다: ${session.id}`);
        // 다른 활성 회차가 같은 (userId, examId, mode)를 이미 점유하면 부분 UNIQUE가 거부한다.
        await d1.insert(reviewSessions).values(toInsert(session));
        return;
      }
      if (existing.userId !== session.userId || existing.examId !== session.examId || existing.mode !== session.mode) {
        throw new Error(`복습 회차 ${session.id}의 소유자·시험·모드는 변경할 수 없다`);
      }
      if (existing.status === 'active' && session.status === 'ended') {
        throw new Error(`복습 회차 ${session.id} 종료는 expectedCursor CAS를 사용해야 한다`);
      }
      if (existing.status === 'ended') {
        if (session.status !== 'ended') throw new Error(`종료된 복습 회차 ${session.id}는 활성으로 되돌릴 수 없다`);
        if (!isSameEndedSnapshot(existing, session)) {
          throw new Error(`종료된 복습 회차 ${session.id}는 이력을 바꾸지 않고 동일 스냅샷으로만 다시 저장한다`);
        }
        return; // 동일 스냅샷 — 쓰기 자체를 생략해 경합 여지를 없앤다.
      }
      const res = await d1
        .update(reviewSessions)
        .set(toUpdateSet(session))
        .where(
          and(
            eq(reviewSessions.id, session.id),
            eq(reviewSessions.status, 'active'),
            eq(reviewSessions.userId, session.userId),
            eq(reviewSessions.examId, session.examId),
            eq(reviewSessions.mode, session.mode),
          ),
        );
      const changes = (res.meta as { changes?: number } | undefined)?.changes ?? 0;
      if (changes === 0) {
        throw new Error(`복습 회차 ${session.id} 저장이 충돌했다 — 다른 요청이 먼저 상태를 바꿨다`);
      }
    },

    async end({ session, expectedCursor }): Promise<boolean> {
      if (session.status !== 'ended' || !Number.isInteger(expectedCursor) || expectedCursor < 0 || session.cursor !== expectedCursor) return false;
      const rows = await d1.select().from(reviewSessions).where(eq(reviewSessions.id, session.id)).limit(1);
      const existing = rows[0];
      if (!existing) return false;
      if (existing.userId !== session.userId || existing.examId !== session.examId || existing.mode !== session.mode) return false;
      if (existing.status === 'ended') return isSameEndedSnapshot(existing, session);

      const res = await d1
        .update(reviewSessions)
        .set(toUpdateSet(session))
        .where(
          and(
            eq(reviewSessions.id, session.id),
            eq(reviewSessions.status, 'active'),
            eq(reviewSessions.userId, session.userId),
            eq(reviewSessions.examId, session.examId),
            eq(reviewSessions.mode, session.mode),
            eq(reviewSessions.cursor, expectedCursor),
          ),
        );
      return ((res.meta as { changes?: number } | undefined)?.changes ?? 0) === 1;
    },
  };
}
