import type { ConceptSignal } from '@/domain/concepts/recommendations';

export interface ConceptEvidence extends ConceptSignal {
  /** 문항 UUID와 콘텐츠 ID는 서버 내부 조인에만 쓴다. API DTO로 보내지 않는다. */
  readonly sourceQuestionId: string;
  readonly stem: string;
}

export interface ConceptRecommendationSource {
  listUserSignals(input: { readonly userId: string; readonly examCode: string }): Promise<readonly ConceptEvidence[]>;
}

export interface ConceptDeps {
  readonly source: ConceptRecommendationSource;
}
