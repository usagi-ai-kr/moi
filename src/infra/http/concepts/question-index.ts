import questionIndexJson from '../../../../content/concepts/saa-c03/question-index.json';

export interface ConceptQuestionTag {
  readonly sourceQuestionId: string;
  readonly examCode: string;
  readonly domainCode: string;
  readonly conceptId: string;
}

export const CONCEPT_QUESTION_INDEX = questionIndexJson as Readonly<Record<string, ConceptQuestionTag>>;

export function normalizeConceptStem(stem: string): string {
  return stem.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function findConceptQuestionTag(stem: string): Promise<ConceptQuestionTag | null> {
  const bytes = new TextEncoder().encode(normalizeConceptStem(stem));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return CONCEPT_QUESTION_INDEX[key] ?? null;
}
