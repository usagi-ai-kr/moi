import { describe, expect, it } from 'vitest';
import type { StudyStats } from '../../src/ui/api/client';
import { studyStatsQueryKey } from '../../src/ui/stats/useStudyStats';
import { getScopeProgress } from '../../src/ui/study/scope-progress';

const stats: StudyStats = {
  examId: 'saa-c03',
  totalQuestions: 500,
  domainQuestionCounts: { security: 150, resilience: 130 },
  uniqueFirstSolved: 50,
  coverage: 0.1,
  overallAccuracy: 0.7,
  domains: [
    { domainId: 'security', uniqueFirstSolved: 30, gradedAttempts: 32, cumulativeAccuracy: 0.7, recentAccuracy: 0.7, status: 'ok' },
    { domainId: 'resilience', uniqueFirstSolved: 12, gradedAttempts: 13, cumulativeAccuracy: 0.7, recentAccuracy: 0.7, status: 'ok' },
  ],
  weakDomains: [],
};

describe('학습 범위 진척도 계산 (#330 AC-1~4)', () => {
  it('전체와 선택 영역은 각자 실제 분모를 사용한다', () => {
    expect(getScopeProgress(stats, 'all', 'security')).toEqual({ completed: 50, total: 500, percent: 10, label: 'learning' });
    expect(getScopeProgress(stats, 'domain', 'security')).toEqual({ completed: 30, total: 150, percent: 20, label: 'learning' });
    expect(getScopeProgress(stats, 'domain', 'resilience')).toEqual({ completed: 12, total: 130, percent: 9.2, label: 'learning' });
  });

  it('취약 영역 모드는 실제 시험 전체 풀의 진도를 시험 전체 라벨로 표시한다', () => {
    expect(getScopeProgress(stats, 'weak', 'security')).toEqual({ completed: 50, total: 500, percent: 10, label: 'exam' });
  });

  it('stats query identity includes both exam and user', () => {
    expect(studyStatsQueryKey('saa-c03', 'user-a')).toEqual(['study', 'stats', 'saa-c03', 'user-a']);
    expect(studyStatsQueryKey('sap-c02', 'user-a')).not.toEqual(studyStatsQueryKey('saa-c03', 'user-a'));
    expect(studyStatsQueryKey('saa-c03', 'user-b')).not.toEqual(studyStatsQueryKey('saa-c03', 'user-a'));
  });

  it('분모가 없거나 0이면 이용 불가로 처리하고, 분자는 분모를 넘지 않는다', () => {
    expect(getScopeProgress({ ...stats, domainQuestionCounts: { security: 0 } }, 'domain', 'security')).toBeNull();
    expect(getScopeProgress({ ...stats, totalQuestions: 0 }, 'all', 'security')).toBeNull();
    expect(getScopeProgress({ ...stats, uniqueFirstSolved: 800 }, 'all', 'security')).toMatchObject({ completed: 500, percent: 100 });
  });
});
