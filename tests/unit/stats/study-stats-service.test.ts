import { describe, expect, it } from 'vitest';
import { getStudyStats } from '@/app/stats/study-stats-service';
import type { StatsClock, StudyHistoryPort } from '@/app/stats/ports';
import type { StudyHistoryEntry } from '@/domain/stats/types';
import { EXAM, NOW, OTHER_EXAM, entry, hundredFirstSolves } from './fixtures';

// 이슈 #54 — StudyHistoryPort·StatsClock fake로 use case를 검증한다(DB/네트워크 금지).

function fakeHistory(entries: readonly StudyHistoryEntry[]): StudyHistoryPort {
  return {
    // 서버 경계 재현: 요청된 시험의 이력만 반환한다(시험별 분리, ADR-0021).
    async listByExam({ examId }) {
      return entries.filter((e) => e.examId === examId);
    },
  };
}

const fixedClock: StatsClock = { now: () => NOW };

describe('getStudyStats (use case)', () => {
  it('fake Port 이력 → 시험별 통계 반환(분모 500 기본)', async () => {
    const entries = [
      ...hundredFirstSolves(80),
      ...Array.from({ length: 3 }, (_, i) =>
        entry({ questionId: `other-${i}`, domainId: 'cost-optimization', outcome: 'wrong', examId: OTHER_EXAM, firstAttempt: true }),
      ),
    ];
    const stats = await getStudyStats({ history: fakeHistory(entries), clock: fixedClock }, { examId: EXAM });

    expect(stats.examId).toBe(EXAM);
    expect(stats.totalQuestions).toBe(500);
    expect(stats.uniqueFirstSolved).toBe(100);
    expect(stats.coverage).toBeCloseTo(0.2, 10);
    expect(stats.overallAccuracy).toBeCloseTo(0.8, 10);
  });

  it('totalQuestions 주입 시 진도율 분모를 따른다', async () => {
    const stats = await getStudyStats(
      { history: fakeHistory(hundredFirstSolves(80)), clock: fixedClock },
      { examId: EXAM, totalQuestions: 200 },
    );

    expect(stats.totalQuestions).toBe(200);
    expect(stats.coverage).toBeCloseTo(0.5, 10);
  });

  it('빈 이력でも 예외 없이 빈 통계를 반환한다', async () => {
    const stats = await getStudyStats({ history: fakeHistory([]), clock: fixedClock }, { examId: EXAM });

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
    const stats = await getStudyStats({ history: fakeHistory(entries), clock: fixedClock }, { examId: EXAM });

    expect(stats.domains[0].recentAccuracy).toBe(1);
  });
});
