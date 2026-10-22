import { describe, expect, it } from 'vitest';
import { getStudyStats } from '@/app/stats/study-stats-service';
import type { StatsClock, StudyHistoryPort, StudyQuestionCountPort } from '@/app/stats/ports';
import type { StudyHistoryEntry } from '@/domain/stats/types';
import { EXAM, NOW, OTHER_EXAM, entry, hundredFirstSolves } from './fixtures';

// 이슈 #54 — StudyHistoryPort·StatsClock fake로 use case를 검증한다(DB/네트워크 금지).

function fakeHistory(entries: readonly StudyHistoryEntry[]): StudyHistoryPort {
  return {
    // 서버 경계 재현: 요청된 사용자/시험의 이력만 반환한다(사용자·시험별 분리, ADR-0021).
    async load({ userId: _userId, examId }) {
      void _userId;
      return entries.filter((e) => e.examId === examId);
    },
  };
}

function fakeQuestionCounts(counts: Readonly<Record<string, number>>): StudyQuestionCountPort {
  return { async loadByDomain() { return counts; } };
}

const fixedClock: StatsClock = { now: () => NOW };
const USER = 'u-1';

describe('getStudyStats (use case)', () => {
  it('고유 첫 풀이 통계와 현재 문제 풀 분모를 함께 반환한다', async () => {
    const entries = [
      ...hundredFirstSolves(80),
      ...Array.from({ length: 3 }, (_, i) =>
        entry({ questionId: `other-${i}`, domainId: 'cost-optimization', outcome: 'wrong', examId: OTHER_EXAM, firstAttempt: true }),
      ),
    ];
    const stats = await getStudyStats(
      { history: fakeHistory(entries), questionCounts: fakeQuestionCounts({ security: 400, resilience: 100 }), clock: fixedClock },
      { userId: USER, examId: EXAM },
    );

    expect(stats.examId).toBe(EXAM);
    expect(stats.totalQuestions).toBe(500);
    expect(stats.domainQuestionCounts).toEqual({ security: 400, resilience: 100 });
    expect(stats.uniqueFirstSolved).toBe(100);
    expect(stats.coverage).toBeCloseTo(0.2, 10);
    expect(stats.overallAccuracy).toBeCloseTo(0.8, 10);
  });

  it('활성 문제가 없으면 0 분모·유한 coverage를 반환한다', async () => {
    const stats = await getStudyStats(
      { history: fakeHistory(hundredFirstSolves(80)), questionCounts: fakeQuestionCounts({}), clock: fixedClock },
      { userId: USER, examId: EXAM },
    );

    expect(stats.totalQuestions).toBe(0);
    expect(stats.coverage).toBe(0);
    expect(Number.isFinite(stats.coverage)).toBe(true);
  });

  it('빈 이력でも 예외 없이 빈 통계를 반환한다', async () => {
    const stats = await getStudyStats(
      { history: fakeHistory([]), questionCounts: fakeQuestionCounts({ security: 500 }), clock: fixedClock },
      { userId: USER, examId: EXAM },
    );

    expect(stats.uniqueFirstSolved).toBe(0);
    expect(stats.overallAccuracy).toBeNull();
    expect(stats.domains).toEqual([]);
  });

  it('clock fake로 "최근" 판정이 결정적으로 고정된다', async () => {
    // 기준 시각 기준 3일 전 정답 + 30일 전 오답 → 최근 창(14일) 내 정답률 1.
    const entries = [
      entry({ questionId: 'q1', domainId: 'security', outcome: 'wrong', daysAgo: 30 }),
      entry({ questionId: 'q1', domainId: 'security', outcome: 'correct', daysAgo: 3 }),
    ];
    const stats = await getStudyStats(
      { history: fakeHistory(entries), questionCounts: fakeQuestionCounts({ security: 500 }), clock: fixedClock },
      { userId: USER, examId: EXAM },
    );

    expect(stats.domains[0].recentAccuracy).toBe(1);
  });
});
