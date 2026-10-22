import type { ReviewMode, ReviewSession, ReviewSessionItem, ReviewSessionStatus } from '@/domain/review/types';
import { reviewSessions } from './schema-review';

/**
 * review_sessions(#54/#51, ADR-0020/0027/0059) 행 ↔ 도메인 스냅샷 변환.
 * 도메인은 Drizzle 타입을 모르고, 이 mapper만 영속 표현을 안다.
 * queue 컬럼은 JSON text nullable(legacy null) — API DTO에는 노출하지 않는다.
 */

type SessionRow = typeof reviewSessions.$inferSelect;

function parseMode(mode: string): ReviewMode {
  if (mode !== 'wrong' && mode !== 'bookmark') throw new Error(`review_sessions.mode 값이 도메인과 일치하지 않는다: ${mode}`);
  return mode;
}

function parseStatus(status: string): ReviewSessionStatus {
  if (status !== 'active' && status !== 'ended') throw new Error(`review_sessions.status 값이 도메인과 일치하지 않는다: ${status}`);
  return status;
}

function parseItems(raw: string): ReviewSessionItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('review_sessions.items JSON 파싱에 실패했다 — 저장된 회차 스냅샷이 손상됐다');
  }
  if (!Array.isArray(parsed)) throw new Error('review_sessions.items는 배열 스냅샷이어야 한다');
  for (const entry of parsed) {
    const state = (entry as ReviewSessionItem)?.state;
    if (typeof (entry as ReviewSessionItem)?.questionId !== 'string' || state === null || typeof state !== 'object' || typeof state.kind !== 'string') {
      throw new Error('review_sessions.items 항목이 ReviewSessionItem 형태가 아니다');
    }
  }
  return parsed as ReviewSessionItem[];
}

function parseIds(raw: string | null, col: string): string[] | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`review_sessions.${col} JSON 파싱에 실패했다`);
  }
  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string')) {
    throw new Error(`review_sessions.${col}는 문자열 배열이어야 한다`);
  }
  return parsed as string[];
}

export function toDomain(row: SessionRow): ReviewSession {
  const remaining = parseIds(row.remainingQuestionIds, 'remaining_question_ids');
  const cycle = parseIds(row.cycleQuestionIds, 'cycle_question_ids');
  return {
    id: row.id,
    userId: row.userId,
    examId: row.examId,
    mode: parseMode(row.mode),
    status: parseStatus(row.status),
    createdAt: row.createdAt,
    endedAt: row.endedAt ?? undefined,
    cursor: row.cursor,
    items: parseItems(row.items),
    ...(remaining === null ? {} : { remainingQuestionIds: remaining }),
    ...(cycle === null ? {} : { cycleQuestionIds: cycle }),
  };
}

export function toInsert(session: ReviewSession) {
  return {
    id: session.id,
    userId: session.userId,
    examId: session.examId,
    mode: session.mode,
    status: session.status,
    createdAt: session.createdAt,
    endedAt: session.endedAt ?? null,
    cursor: session.cursor,
    items: JSON.stringify(session.items),
    remainingQuestionIds: session.remainingQuestionIds == null ? null : JSON.stringify(session.remainingQuestionIds),
    cycleQuestionIds: session.cycleQuestionIds == null ? null : JSON.stringify(session.cycleQuestionIds),
  };
}

export function toUpdateSet(session: ReviewSession) {
  return {
    status: session.status,
    endedAt: session.endedAt ?? null,
    cursor: session.cursor,
    items: JSON.stringify(session.items),
    remainingQuestionIds: session.remainingQuestionIds == null ? null : JSON.stringify(session.remainingQuestionIds),
    cycleQuestionIds: session.cycleQuestionIds == null ? null : JSON.stringify(session.cycleQuestionIds),
  };
}

/** 종료 회차 재저장 멱등 판정 — status·endedAt·cursor·items·queue가 동일하면 true. */
export function isSameEndedSnapshot(row: SessionRow, session: ReviewSession): boolean {
  return (
    row.status === session.status &&
    (row.endedAt ?? undefined) === session.endedAt &&
    row.cursor === session.cursor &&
    deepEqual(parseItems(row.items), session.items) &&
    deepEqual(parseIds(row.remainingQuestionIds, 'remaining_question_ids'), session.remainingQuestionIds ?? null) &&
    deepEqual(parseIds(row.cycleQuestionIds, 'cycle_question_ids'), session.cycleQuestionIds ?? null)
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (typeof a === 'object' && a !== null && b !== null && typeof b === 'object') {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}
