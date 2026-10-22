import { describe, expect, it } from 'vitest';
import { rankConceptRecommendations, type ConceptSignal } from '@/domain/concepts/recommendations';

const NOW = Date.UTC(2026, 9, 22);

function signal(input: Partial<ConceptSignal> & Pick<ConceptSignal, 'questionId' | 'conceptIds'>): ConceptSignal {
  return {
    validWrongCount: 0,
    lastWrongAt: null,
    bookmarked: false,
    ...input,
  };
}

describe('개념 추천 점수 (#329)', () => {
  it('오답 빈도·최근성·북마크를 합치고 같은 문항 중복과 반복 가중을 제한한다', () => {
    const result = rankConceptRecommendations(
      [{ id: 'iam', title: 'IAM 권한 설계' }],
      [
        signal({ questionId: 'q-1', conceptIds: ['iam'], validWrongCount: 9, lastWrongAt: NOW - 3 * 86_400_000, bookmarked: true }),
        signal({ questionId: 'q-1', conceptIds: ['iam'], validWrongCount: 1, lastWrongAt: NOW - 3 * 86_400_000 }),
        signal({ questionId: 'q-2', conceptIds: ['iam'], validWrongCount: 1, lastWrongAt: NOW - 45 * 86_400_000 }),
        signal({ questionId: 'q-3', conceptIds: ['iam'], bookmarked: true }),
      ],
      NOW,
    );

    expect(result).toEqual([
      expect.objectContaining({
        conceptId: 'iam',
        score: 16,
        relatedQuestionCount: 3,
        wrongQuestionCount: 2,
        recentWrongQuestionCount: 1,
        bookmarkQuestionCount: 2,
      }),
    ]);
  });

  it('20개 후보에서는 결정적인 동점 규칙으로 상위 16개만, 후보 6개면 6개 모두 반환한다', () => {
    const twenty = Array.from({ length: 20 }, (_, index) => ({
      id: `concept-${String(index).padStart(2, '0')}`,
      title: `개념 ${index}`,
    }));
    const signalForAll = [signal({ questionId: 'q-1', conceptIds: twenty.map((concept) => concept.id), bookmarked: true })];

    expect(rankConceptRecommendations(twenty, signalForAll, NOW).map((item) => item.conceptId)).toEqual(
      twenty.slice(0, 16).map((concept) => concept.id),
    );
    expect(rankConceptRecommendations(twenty.slice(0, 6), signalForAll, NOW)).toHaveLength(6);
  });

  it('동점은 관련 문항 수, 그 다음 개념 ID 순으로 정렬하며 빈 근거는 숨긴다', () => {
    const concepts = [
      { id: 'z-more', title: '더 많은 관련 문항' },
      { id: 'b-tie', title: '동점 B' },
      { id: 'a-tie', title: '동점 A' },
      { id: 'unused', title: '근거 없음' },
    ];
    const signals = [
      signal({ questionId: 'q-1', conceptIds: ['z-more', 'a-tie', 'b-tie'], bookmarked: true }),
      signal({ questionId: 'q-2', conceptIds: ['z-more'], bookmarked: true }),
    ];

    expect(rankConceptRecommendations(concepts, signals, NOW).map((item) => item.conceptId)).toEqual([
      'z-more',
      'a-tie',
      'b-tie',
    ]);
  });

  it('동일 문항의 오답·북마크 신호를 합치되 알 수 없는 태그와 빈 신호를 제외한다', () => {
    const result = rankConceptRecommendations(
      [{ id: 'known', title: '검수 개념' }],
      [
        signal({ questionId: 'q-1', conceptIds: ['unknown'], validWrongCount: 3, lastWrongAt: NOW }),
        signal({ questionId: 'q-2', conceptIds: ['known'], validWrongCount: 0, lastWrongAt: null }),
      ],
      NOW,
    );

    expect(result).toEqual([]);
  });
});
