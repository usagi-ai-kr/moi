import { describe, expect, it } from 'vitest';
import { buildConceptQuestionIndex } from '../../../scripts/generate-concept-question-index.mjs';

describe('개념 문항 인덱스 생성기 (#329)', () => {
  it('검수 상태가 없는 정적 문서는 문항 추천 인덱스에 포함하지 않는다', () => {
    const index = buildConceptQuestionIndex(
      [{ file: 'pack.json', pack: { packId: 'pack-1', examCode: 'saa-c03', items: [{ questionId: 'q-1', stem: 'stem', domainCode: 'security' }] } }],
      {
        examCode: 'saa-c03',
        concepts: [{ id: 'pending-concept', packId: 'pack-1', title: '검수 대기 개념', reviewStatus: 'pending', reviewedAt: null }],
      },
    );

    expect(index).toEqual({});
  });
});
