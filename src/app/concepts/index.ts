import { rankConceptRecommendations, type ConceptRecommendation } from '@/domain/concepts/recommendations';
import type { ConceptDocument } from '@/domain/concepts/types';
import type { ConceptDeps } from './ports';

export async function getConceptRecommendations(
  deps: ConceptDeps,
  input: { readonly userId: string; readonly examCode: string },
  concepts: readonly ConceptDocument[],
  now: number,
): Promise<ConceptRecommendation[]> {
  const signals = await deps.source.listUserSignals(input);
  return rankConceptRecommendations(concepts, signals, now);
}

export async function getConceptDetail(
  deps: ConceptDeps,
  input: { readonly userId: string; readonly examCode: string },
  concept: ConceptDocument,
) {
  const signals = await deps.source.listUserSignals(input);
  const relatedQuestions = signals
    .filter((signal) => signal.conceptIds.includes(concept.id))
    .map((signal) => ({
      stem: signal.stem,
      hasWrongHistory: signal.validWrongCount > 0,
      bookmarked: signal.bookmarked,
    }));
  return {
    conceptId: concept.id,
    title: concept.title,
    summary: concept.summary,
    confusions: concept.confusions,
    sourceUrls: concept.sourceUrls,
    relatedQuestions,
  };
}
