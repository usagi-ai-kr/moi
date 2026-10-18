import { describe, expect, it } from 'vitest';
import { checkAnswerConsistency, checkRequiredFields } from '@/domain/question-quality/rules/structure';
import { makeDraft, makeOptions } from './fixtures';

// 이슈 #48 규칙 1·2 — 필수 필드·answerOptionIds 부분집합/1개 이상(단일·복수) 양성·음성·경계.

describe('checkRequiredFields (규칙 1)', () => {
  it('양성: 완전한 정상 문제는 위반 없음', () => {
    expect(checkRequiredFields(makeDraft())).toEqual([]);
  });

  it('음성: stem 비어 있음', () => {
    const findings = checkRequiredFields(makeDraft({ stem: '   ' }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ checkId: 'required-fields', questionId: expect.any(String) });
  });

  it('음성: explanation 비어 있음', () => {
    expect(checkRequiredFields(makeDraft({ explanation: '' }))).toHaveLength(1);
  });

  it('음성: sourceUrls 누락(빈 배열)', () => {
    expect(checkRequiredFields(makeDraft({ sourceUrls: [] }))).toHaveLength(1);
  });

  it('음성: options 2개 미만(경계 1개)', () => {
    const one = makeOptions(['단일 보기']);
    expect(checkRequiredFields(makeDraft({ options: one, answerOptionIds: [one[0].id] }))).toHaveLength(1);
  });

  it('음성: option 텍스트 비어 있음', () => {
    const broken = [
      { id: 'o1', text: '보기 1' },
      { id: 'o2', text: '   ' },
    ];
    expect(checkRequiredFields(makeDraft({ options: broken, answerOptionIds: ['o1'] }))).toHaveLength(1);
  });

  it('음성: option id 중복', () => {
    const broken = [
      { id: 'same', text: '보기 1' },
      { id: 'same', text: '보기 2' },
    ];
    expect(checkRequiredFields(makeDraft({ options: broken, answerOptionIds: ['same'] }))).toHaveLength(1);
  });

  it('음성: 지원하지 않는 시험 id', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(checkRequiredFields(makeDraft({ exam: 'AZ-104' as any }))).toHaveLength(1);
  });
});

describe('checkAnswerConsistency (규칙 2)', () => {
  it('양성: 단일 선택(정답 1개, 부분집합)', () => {
    expect(checkAnswerConsistency(makeDraft())).toEqual([]);
  });

  it('양성: 복수 선택(정답 2개 이상, 부분집합)', () => {
    expect(checkAnswerConsistency(makeDraft({ answerOptionIds: ['opt-1', 'opt-3'] }))).toEqual([]);
  });

  it('음성: 정답이 option id 부분집합이 아님(미지 id 포함)', () => {
    const findings = checkAnswerConsistency(makeDraft({ answerOptionIds: ['opt-2', 'opt-99'] }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe('answer-consistency');
  });

  it('음성: 정답 0개(경계)', () => {
    expect(checkAnswerConsistency(makeDraft({ answerOptionIds: [] }))).toHaveLength(1);
  });

  it('음성: answerOptionIds 중복', () => {
    expect(checkAnswerConsistency(makeDraft({ answerOptionIds: ['opt-2', 'opt-2'] }))).toHaveLength(1);
  });

  it('복수 선택이 허용 id 내에서만 통과하는 경계: 오답 id 1개라도 섞이면 실패', () => {
    expect(checkAnswerConsistency(makeDraft({ answerOptionIds: ['opt-1', 'opt-2'] }))).toEqual([]);
    expect(checkAnswerConsistency(makeDraft({ answerOptionIds: ['opt-1', 'opt-9'] }))).toHaveLength(1);
  });
});
