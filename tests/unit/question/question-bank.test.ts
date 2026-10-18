import { describe, expect, it } from 'vitest';
import {
  assertAnswerOptionIdsSubset,
  assertValidStatus,
  assertWeightsSumToHundred,
  nextVersionNo,
} from '@/domain/question/question';
import { toQuestion, toQuestionVersion } from '@/infra/persistence/question-mapper';

// 이슈 #46 — 도메인 불변식·버전 규칙·mapper 단위 테스트.

describe('answer_option_ids 부분집합 검증', () => {
  it('보기 id의 부분집합이면 통과한다', () => {
    expect(() => assertAnswerOptionIdsSubset(['o1', 'o3'], ['o1', 'o2', 'o3', 'o4'])).not.toThrow();
  });

  it('보기에 없는 id가 있으면 저장 전 거부한다', () => {
    expect(() => assertAnswerOptionIdsSubset(['o9'], ['o1', 'o2'])).toThrow(
      'question: answer_option_ids must be a subset of option ids',
    );
  });

  it('빈 정답 집합·정답 중복을 거부한다', () => {
    expect(() => assertAnswerOptionIdsSubset([], ['o1'])).toThrow('must not be empty');
    expect(() => assertAnswerOptionIdsSubset(['o1', 'o1'], ['o1', 'o2'])).toThrow('duplicates');
  });
});

describe('버전 번호 증가', () => {
  it('개정 없으면 1, 최대값 + 1을 부여한다', () => {
    expect(nextVersionNo([])).toBe(1);
    expect(nextVersionNo([1])).toBe(2);
    expect(nextVersionNo([1, 2, 5])).toBe(6);
  });
});

describe('영역 가중치 합(SAA-C03 시드 정책)', () => {
  it('보안 30·복원력 26·성능 24·비용 20 합 100을 통과한다', () => {
    expect(() => assertWeightsSumToHundred([30, 26, 24, 20])).not.toThrow();
  });

  it('합 100이 아니면 거부한다', () => {
    expect(() => assertWeightsSumToHundred([30, 26, 24, 19])).toThrow('must sum to 100');
    expect(() => assertWeightsSumToHundred([-10, 110])).toThrow('non-negative');
  });
});

describe('문제 상태 불변식', () => {
  it('active|inactive 외 상태를 거부한다', () => {
    expect(() => assertValidStatus('deleted')).toThrow('active|inactive');
  });
});

describe('mapper (Drizzle 행 → domain)', () => {
  it('question 행을 변환하고 잘못된 status를 거부한다', () => {
    const row = {
      id: 'q1',
      examId: 'e1',
      domainId: 'd1',
      status: 'active',
      currentVersionNo: null,
      createdAt: 1,
      updatedAt: 1,
    };
    expect(toQuestion(row)).toMatchObject({ id: 'q1', status: 'active', currentVersionNo: null });
    expect(() => toQuestion({ ...row, status: 'deleted' })).toThrow('active|inactive');
  });

  it('version 행의 JSON 컬럼을 그대로 전달한다', () => {
    const row = {
      id: 'v1',
      questionId: 'q1',
      versionNo: 1,
      stem: 'stem',
      explanation: 'exp',
      sourceUrls: ['https://docs.aws.amazon.com/x'],
      answerOptionIds: ['o1'],
      optionSetHash: 'h',
      reviewStatus: 'pending',
      createdAt: 1,
      supersededAt: null,
    };
    expect(toQuestionVersion(row)).toMatchObject({
      versionNo: 1,
      sourceUrls: ['https://docs.aws.amazon.com/x'],
      answerOptionIds: ['o1'],
    });
  });
});
