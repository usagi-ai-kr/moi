import catalogJson from '../../../../content/concepts/saa-c03/catalog.json';
import type { ConceptDocument } from '@/domain/concepts/types';

export const CONCEPT_CATALOG = catalogJson.concepts as readonly ConceptDocument[];

function hasReviewRecord(concept: ConceptDocument): boolean {
  if (concept.reviewStatus !== 'reviewed' || !concept.reviewedAt || !/^\d{4}-\d{2}-\d{2}$/.test(concept.reviewedAt)) return false;
  const date = new Date(concept.reviewedAt);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === concept.reviewedAt;
}

export function conceptsForExam(examCode: string): readonly ConceptDocument[] {
  return examCode === catalogJson.examCode
    ? CONCEPT_CATALOG.filter(hasReviewRecord)
    : [];
}

export function findConceptDocument(examCode: string, conceptId: string): ConceptDocument | null {
  return conceptsForExam(examCode).find((concept) => concept.id === conceptId) ?? null;
}
