import { describe, expect, it } from 'vitest';
import { checkAnswerPositionBias, checkBatchDuplication, checkDomainDistribution } from '@/domain/question-quality/rules/batch';
import { domainFor, makeDraft, makeOptions, rotateAnswerIndex } from './fixtures';

// 이슈 #48 규칙 5·8·9 — 배치 검사: 정답 위치 편향·SAA 영역 분포(150/130/120/100)·배치 중복.

describe('checkAnswerPositionBias (규칙 5)', () => {
  it('양성: 정답 위치가 순환되는 배치(편향 없음)', () => {
    const drafts = rotateAnswerIndex(
      Array.from({ length: 8 }, (_, i) => makeDraft({ id: `q-pos-${i}`, stem: `가용성 문제 ${i}번` })),
    );
    expect(checkAnswerPositionBias(drafts)).toBeNull();
  });

  it('음성: 정답이 특정 위치에 몰림(40% 초과)', () => {
    const drafts = Array.from({ length: 10 }, (_, i) => makeDraft({ id: `q-bias-${i}`, stem: `문제 ${i}번` }));
    // 모든 정답이 0번 인덱스 — 100% 편향
    const allFirst = drafts.map((d) => ({ ...d, answerOptionIds: [d.options[0]?.id ?? 'opt-1'] }));
    const finding = checkAnswerPositionBias(allFirst);
    expect(finding).not.toBeNull();
    expect(finding?.checkId).toBe('answer-position-bias');
    expect(finding?.questionIds).toHaveLength(10);
  });

  it('경계: 단일 선택 표본이 최소 샘플(8) 미만이면 판정하지 않는다', () => {
    const drafts = Array.from({ length: 5 }, (_, i) => makeDraft({ id: `q-small-${i}` }));
    const allFirst = drafts.map((d) => ({ ...d, answerOptionIds: [d.options[0]?.id ?? 'opt-1'] }));
    expect(checkAnswerPositionBias(allFirst)).toBeNull();
  });

  it('복수 정답 문제는 위치 편향 표본에서 제외된다', () => {
    const singles = rotateAnswerIndex(
      Array.from({ length: 8 }, (_, i) => makeDraft({ id: `q-s-${i}`, stem: `문제 ${i}번` })),
    );
    const multi = Array.from({ length: 10 }, (_, i) =>
      makeDraft({ id: `q-m-${i}`, stem: `복수 문제 ${i}번`, answerOptionIds: ['opt-1', 'opt-2'] }),
    );
    expect(checkAnswerPositionBias([...singles, ...multi])).toBeNull();
  });
});

describe('checkDomainDistribution (규칙 8)', () => {
  it('양성: 500문제 전량 배치가 150/130/120/100 정확 일치', () => {
    const drafts = Array.from({ length: 500 }, (_, i) =>
      makeDraft({ id: `q-full-${i}`, stem: `문제 ${i}`, domain: domainFor(i, 500) }),
    );
    expect(checkDomainDistribution(drafts)).toBeNull();
  });

  it('음성: 500문제 배치의 영역 수가 목표와 다르면 실패', () => {
    const drafts = Array.from({ length: 500 }, (_, i) =>
      makeDraft({ id: `q-off-${i}`, stem: `문제 ${i}`, domain: domainFor(i, 500) }),
    );
    // 보안 영역 1문제를 복원력으로 바꿔 149/131/120/100이 되게 한다
    const swapped = drafts.map((d, i) => (i === 0 ? { ...d, domain: 'resilience' as const } : d));
    const finding = checkDomainDistribution(swapped);
    expect(finding).not.toBeNull();
    expect(finding?.checkId).toBe('domain-distribution');
  });

  it('부분 배치: 목표 비중에 비례하면 통과(15/13/12/10)', () => {
    const drafts = [
      ...Array.from({ length: 15 }, (_, i) => makeDraft({ id: `q-part-s-${i}`, domain: 'security' as const })),
      ...Array.from({ length: 13 }, (_, i) => makeDraft({ id: `q-part-r-${i}`, domain: 'resilience' as const })),
      ...Array.from({ length: 12 }, (_, i) => makeDraft({ id: `q-part-p-${i}`, domain: 'performance' as const })),
      ...Array.from({ length: 10 }, (_, i) => makeDraft({ id: `q-part-c-${i}`, domain: 'cost-optimization' as const })),
    ];
    expect(checkDomainDistribution(drafts)).toBeNull();
  });

  it('부분 배치: 영역 누락(비중 0)은 실패', () => {
    const drafts = Array.from({ length: 50 }, (_, i) =>
      makeDraft({ id: `q-part-${i}`, domain: 'security' as const }),
    );
    const finding = checkDomainDistribution(drafts);
    expect(finding).not.toBeNull();
  });
});

describe('checkBatchDuplication (규칙 9)', () => {
  it('양성: 서로 다른 문제들', () => {
    const drafts = rotateAnswerIndex(
      Array.from({ length: 6 }, (_, i) => makeDraft({ id: `q-dup-${i}`, stem: `서로 다른 문제 ${i}번 질문` })),
    );
    expect(checkBatchDuplication(drafts)).toEqual([]);
  });

  it('음성: 배치 내 동일 stem(정규화 일치) 실패', () => {
    const a = makeDraft({ id: 'q-a', stem: 'VPC 엔드포인트의 용도는?' });
    const b = makeDraft({ id: 'q-b', stem: '  vpc 엔드포인트의   용도는?  ' });
    const c = makeDraft({ id: 'q-c', stem: '다른 질문이다.' });
    const findings = checkBatchDuplication([a, b, c]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.questionIds).toEqual(['q-a', 'q-b']);
  });

  it('음성: 배치 내 유사 option set(정규화된 보기 텍스트 집합 일치) 실패', () => {
    const opts = makeOptions(['보기 알파', '보기 베타', '보기 감마', '보기 델타']);
    const a = makeDraft({ id: 'q-sa', stem: '첫 번째 질문', options: opts });
    const b = makeDraft({ id: 'q-sb', stem: '두 번째 질문', options: makeOptions(['보기 베타', '보기 알파', '보기 델타', '보기 감마']) });
    const c = makeDraft({ id: 'q-sc', stem: '세 번째 질문' });
    const findings = checkBatchDuplication([a, b, c]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.questionIds).toEqual(['q-sa', 'q-sb']);
  });
});
