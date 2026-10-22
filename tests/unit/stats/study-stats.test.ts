import { describe, expect, it } from 'vitest';
import { computeStudyStats } from '@/domain/stats/study-stats';
import {
  MAX_WEAK_RECOMMENDATIONS,
  MIN_DOMAIN_SAMPLE,
  WEAK_ACCURACY_THRESHOLD,
} from '@/domain/stats/thresholds';
import { DAY_MS, EXAM, NOW, OTHER_EXAM, entry, hundredFirstSolves } from './fixtures';

// 이슈 #54 — 학습 현황·취약 영역 순수 계산 (ADR-0021 "결정 — 학습 현황").
const opts = { examId: EXAM, totalQuestions: 500, now: NOW };

describe('computeStudyStats — 진도·정답률', () => {
  it('빈 이력 → coverage 0·정답률 null·영역/추천 없음', () => {
    const stats = computeStudyStats([], opts);

    expect(stats.examId).toBe(EXAM);
    expect(stats.uniqueFirstSolved).toBe(0);
    expect(stats.coverage).toBe(0);
    expect(stats.overallAccuracy).toBeNull();
    expect(stats.domains).toEqual([]);
    expect(stats.weakDomains).toEqual([]);
  });

  it('최초 풀이 100/500·정답률 80%', () => {
    const stats = computeStudyStats(hundredFirstSolves(80), opts);

    expect(stats.uniqueFirstSolved).toBe(100);
    expect(stats.coverage).toBe(100 / 500);
    expect(stats.overallAccuracy).toBeCloseTo(0.8, 10);
    expect(stats.domains).toHaveLength(1);
    expect(stats.domains[0]).toMatchObject({
      domainId: 'security',
      uniqueFirstSolved: 100,
      cumulativeAccuracy: expect.closeTo(0.8, 10),
      status: 'ok',
    });
  });

  it('영역별 정답률을 각각 계산한다(영역 혼합 금지)', () => {
    const entries = [
      ...hundredFirstSolves(80, 'security'),
      ...Array.from({ length: 10 }, (_, i) =>
        entry({ questionId: `r${i}`, domainId: 'resilience', outcome: i < 5 ? 'correct' : 'wrong', firstAttempt: true }),
      ),
    ];
    const stats = computeStudyStats(entries, opts);

    const domains = Object.fromEntries(stats.domains.map((d) => [d.domainId, d.cumulativeAccuracy]));
    expect(domains.security).toBeCloseTo(0.8, 10);
    expect(domains.resilience).toBeCloseTo(0.5, 10);
    expect(stats.uniqueFirstSolved).toBe(110);
  });
});

describe('computeStudyStats — 취약 영역 추천', () => {
  const wrongDomain = (domainId: string, count: number, daysAgo = 2) =>
    Array.from({ length: count }, (_, i) =>
      entry({ questionId: `${domainId}-${i}`, domainId, outcome: 'wrong', daysAgo, firstAttempt: true }),
    );

  it('표본 부족 영역(MIN_DOMAIN_SAMPLE 미만)은 insufficient-data로 표시하고 추천하지 않는다', () => {
    const stats = computeStudyStats(wrongDomain('performance', MIN_DOMAIN_SAMPLE - 1), opts);

    expect(stats.domains[0]).toMatchObject({ domainId: 'performance', status: 'insufficient-data' });
    expect(stats.weakDomains).toEqual([]);
  });

  it('표본 충족·정답률 0이면 취약 추천에 오른다', () => {
    const stats = computeStudyStats(wrongDomain('performance', MIN_DOMAIN_SAMPLE), opts);

    expect(stats.domains[0].status).toBe('ok');
    expect(stats.weakDomains).toEqual([
      expect.objectContaining({ domainId: 'performance', cumulativeAccuracy: 0, score: 0 }),
    ]);
  });

  it('결합 점수가 임계치와 정확히 같으면(0.6) 추천하지 않는다(strict)', () => {
    // 5문제 중 3정답 → 누적 0.6, 최근 채점 시도 없음 → 결합 점수 0.6.
    const entries = Array.from({ length: 5 }, (_, i) =>
      entry({ questionId: `boundary-${i}`, domainId: 'cost-optimization', outcome: i < 3 ? 'correct' : 'wrong', daysAgo: 30, firstAttempt: true }),
    );
    const stats = computeStudyStats(entries, opts);

    expect(stats.domains[0].cumulativeAccuracy).toBeCloseTo(WEAK_ACCURACY_THRESHOLD, 10);
    expect(stats.weakDomains).toEqual([]);
  });

  it('최근 성과가 좋으면 누적만 낮아도 추천하지 않는다(결합 점수 상승)', () => {
    // 5문제 모두 과거 오답 + 최근 정답 → 누적 0.5, 최근 1.0 → 결합 0.75 ≥ 0.6.
    const entries = Array.from({ length: 5 }, (_, i) => [
      entry({ questionId: `recover-${i}`, domainId: 'resilience', outcome: 'wrong', daysAgo: 30 }),
      entry({ questionId: `recover-${i}`, domainId: 'resilience', outcome: 'correct', daysAgo: 3 }),
    ]).flat();
    const stats = computeStudyStats(entries, opts);

    const domain = stats.domains.find((d) => d.domainId === 'resilience');
    expect(domain?.cumulativeAccuracy).toBeCloseTo(0.5, 10);
    expect(domain?.recentAccuracy).toBeCloseTo(1, 10);
    expect(stats.weakDomains).toEqual([]);
  });

  it('최근 성과가 나빠지면 누적만으로도 추천에 오른다(결합 점수 하락)', () => {
    // 5문제 모두 과거 정답 + 최근 오답 → 누적 0.5, 최근 0 → 결합 0.25 < 0.6.
    const entries = Array.from({ length: 5 }, (_, i) => [
      entry({ questionId: `regress-${i}`, domainId: 'security', outcome: 'correct', daysAgo: 30 }),
      entry({ questionId: `regress-${i}`, domainId: 'security', outcome: 'wrong', daysAgo: 3 }),
    ]).flat();
    const stats = computeStudyStats(entries, opts);

    const weak = stats.weakDomains.find((w) => w.domainId === 'security');
    expect(weak).toBeDefined();
    expect(weak?.cumulativeAccuracy).toBeCloseTo(0.5, 10);
    expect(weak?.effectiveRecentAccuracy).toBeCloseTo(0, 10);
  });

  it('추천은 결합 점수 오름차순 상한(MAX_WEAK_RECOMMENDATIONS)까지', () => {
    // 4개 영역 모두 취약(10문제 중 정답 0/1/2/3 → 점수 0/0.1/0.2/0.3)이면 상한 3개까지만, 오름차순으로.
    const correctCounts = [0, 1, 2, 3];
    const entries = correctCounts.flatMap((correct, di) =>
      Array.from({ length: 10 }, (_, i) =>
        entry({
          questionId: `d${di}-${i}`,
          domainId: `d${di}`,
          outcome: i < correct ? 'correct' : 'wrong',
          daysAgo: 2,
          firstAttempt: true,
        }),
      ),
    );
    const stats = computeStudyStats(entries, opts);

    expect(stats.domains).toHaveLength(4);
    expect(stats.weakDomains).toHaveLength(MAX_WEAK_RECOMMENDATIONS);
    expect(stats.weakDomains.map((w) => w.domainId)).toEqual(['d0', 'd1', 'd2']);
    const scores = stats.weakDomains.map((w) => w.score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });
});

describe('computeStudyStats — 반복·시험별 분리', () => {
  it('누적 정답률은 모든 유효 시도 기준이다(문제당 평균이 아님)', () => {
    // 한 문제 3회(정답 1·오답 2) + 다른 문제 1회 정답 → 2/4=0.5 (문제당 평균 (1/3+1)/2≈0.667이 아님).
    const entries = [
      entry({ questionId: 'q-a', domainId: 'security', outcome: 'correct', daysAgo: 2, attemptId: 'a-1' }),
      entry({ questionId: 'q-a', domainId: 'security', outcome: 'wrong', daysAgo: 1, attemptId: 'a-2' }),
      entry({ questionId: 'q-a', domainId: 'security', outcome: 'wrong', daysAgo: 0, attemptId: 'a-3' }),
      entry({ questionId: 'q-b', domainId: 'security', outcome: 'correct', daysAgo: 0, attemptId: 'a-4' }),
    ];
    const stats = computeStudyStats(entries, opts);

    expect(stats.domains[0].gradedAttempts).toBe(4);
    expect(stats.domains[0].cumulativeAccuracy).toBeCloseTo(0.5, 10);
    expect(stats.overallAccuracy).toBeCloseTo(0.5, 10);
  });

  it('취약 추천은 반복 제한(문제당 최근 3회·동일 가중) 로직을 유지한다', () => {
    // 5문제: 각 문제 과거 정답 1회 + 최근 오답 3회.
    // 표시 누적은 모든 시도 기준 5/20=0.25지만, 추천 누적은 반복 제한 평균 0(최근 3회만)을 쓴다.
    const entries = Array.from({ length: 5 }, (_, i) => [
      entry({ questionId: `capped-${i}`, domainId: 'security', outcome: 'correct', daysAgo: 30, attemptId: `c-${i}-old` }),
      ...[3, 2, 1].map((d, k) =>
        entry({ questionId: `capped-${i}`, domainId: 'security', outcome: 'wrong', daysAgo: d, attemptId: `c-${i}-new-${k}` }),
      ),
    ]).flat();
    const stats = computeStudyStats(entries, opts);

    expect(stats.domains[0].cumulativeAccuracy).toBeCloseTo(0.25, 10);
    expect(stats.domains[0].gradedAttempts).toBe(20);
    const weak = stats.weakDomains.find((w) => w.domainId === 'security');
    expect(weak).toBeDefined();
    expect(weak?.cumulativeAccuracy).toBeCloseTo(0, 10);
    expect(weak?.score).toBeCloseTo(0, 10);
  });

  it('같은 문제 반복 오답은 누적에 전부 반영된다(반복 상한은 추천·최근용)', () => {
    // 6문제: 5문제 정답 1회 + 1문제 정답 후 오답 10회 반복.
    // 모든 시도 기준: 정답 6 / 유효 16 = 0.375 (문제당 평균 5/6≈0.833이 아님).
    const entries = [
      ...Array.from({ length: 5 }, (_, i) =>
        entry({ questionId: `ok-${i}`, domainId: 'security', outcome: 'correct', daysAgo: 5, attemptId: `a-ok-${i}` }),
      ),
      entry({ questionId: 'repeat', domainId: 'security', outcome: 'correct', daysAgo: 10, attemptId: 'a-repeat-0' }),
      ...Array.from({ length: 10 }, (_, i) =>
        entry({ questionId: 'repeat', domainId: 'security', outcome: 'wrong', daysAgo: 9 - i, attemptId: `a-repeat-${i + 1}` }),
      ),
    ];
    const stats = computeStudyStats(entries, opts);

    expect(stats.domains[0].gradedAttempts).toBe(16); // 반복 상한 없이 전부
    expect(stats.overallAccuracy).toBeCloseTo(6 / 16, 10);
  });

  it('동일 attemptId 중복 기록은 1회로 병합한다', () => {
    const entries = [
      entry({ questionId: 'dup', domainId: 'security', outcome: 'correct', attemptId: 'same', firstAttempt: true }),
      entry({ questionId: 'dup', domainId: 'security', outcome: 'wrong', attemptId: 'same' }),
    ];
    const stats = computeStudyStats(entries, opts);

    expect(stats.uniqueFirstSolved).toBe(1);
    expect(stats.overallAccuracy).toBe(1);
    expect(stats.domains[0].gradedAttempts).toBe(1);
  });

  it('명시적 firstAttempt=true가 가장 이른 시도보다 우선한다', () => {
    const entries = [
      entry({ questionId: 'flagged', domainId: 'security', outcome: 'correct', daysAgo: 10 }),
      entry({ questionId: 'flagged', domainId: 'security', outcome: 'wrong', daysAgo: 1, firstAttempt: true }),
    ];
    const stats = computeStudyStats(entries, opts);

    // 최초 시도가 오답 → 첫 풀이로는 세지만 정답률에는 두 시도 모두 반영(각 0.5).
    expect(stats.uniqueFirstSolved).toBe(1);
    expect(stats.overallAccuracy).toBeCloseTo(0.5, 10);
  });

  it('첫 시도가 비채점(pass/unanswered)이면 첫 풀이로 세지 않는다', () => {
    const entries = [
      entry({ questionId: 'p1', domainId: 'security', outcome: 'pass', firstAttempt: true }),
      entry({ questionId: 'p2', domainId: 'security', outcome: 'unanswered', firstAttempt: true }),
      entry({ questionId: 'p3', domainId: 'security', outcome: 'correct', firstAttempt: true }),
    ];
    const stats = computeStudyStats(entries, opts);

    expect(stats.uniqueFirstSolved).toBe(1);
    expect(stats.overallAccuracy).toBe(1); // 비채점은 분모 제외
  });

  it('다른 시험 이력은 통계에 섞이지 않는다(시험별 분리)', () => {
    const entries = [
      ...hundredFirstSolves(80),
      ...Array.from({ length: 10 }, (_, i) =>
        entry({ questionId: `other-${i}`, domainId: 'cost-optimization', outcome: 'wrong', examId: OTHER_EXAM, firstAttempt: true }),
      ),
    ];
    const stats = computeStudyStats(entries, opts);

    expect(stats.uniqueFirstSolved).toBe(100);
    expect(stats.domains.map((d) => d.domainId)).toEqual(['security']);
    expect(stats.overallAccuracy).toBeCloseTo(0.8, 10);
  });

  it('미래 시각 이력(now 이후)은 최근·누적 계산에서 제외한다', () => {
    const entries = [
      entry({ questionId: 'future', domainId: 'security', outcome: 'wrong', firstAttempt: true }),
      { ...entry({ questionId: 'future', domainId: 'security', outcome: 'correct' }), occurredAt: NOW + DAY_MS },
    ];
    const stats = computeStudyStats(entries, opts);

    expect(stats.overallAccuracy).toBe(0);
    expect(stats.domains[0].recentAccuracy).toBe(0);
  });
});
