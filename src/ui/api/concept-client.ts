import type { ApiClient } from './client';

export interface ConceptRecommendationItem {
  readonly conceptId: string;
  readonly title: string;
  readonly relatedQuestionCount: number;
  readonly reason: string;
}

export interface ConceptRecommendationsResponse {
  readonly examId: string;
  readonly total: number;
  readonly reviewedContentAvailable: boolean;
  readonly items: readonly ConceptRecommendationItem[];
}

export interface ConceptDetailResponse {
  readonly conceptId: string;
  readonly title: string;
  readonly summary: string;
  readonly confusions: ReadonlyArray<{ readonly term: string; readonly with: string; readonly difference: string }>;
  readonly sourceUrls: readonly string[];
  readonly relatedQuestions: ReadonlyArray<{
    readonly stem: string;
    readonly hasWrongHistory: boolean;
    readonly bookmarked: boolean;
  }>;
}

export async function getConceptRecommendations(client: ApiClient, examId: string): Promise<ConceptRecommendationsResponse> {
  const query = new URLSearchParams({ examId });
  return client.get(`api/concepts/recommendations?${query}`).json<ConceptRecommendationsResponse>();
}

export async function getConceptDetail(
  client: ApiClient,
  examId: string,
  conceptId: string,
): Promise<ConceptDetailResponse> {
  const query = new URLSearchParams({ examId });
  return client.get(`api/concepts/${encodeURIComponent(conceptId)}?${query}`).json<ConceptDetailResponse>();
}
