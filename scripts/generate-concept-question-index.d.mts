interface ConceptQuestionPack {
  readonly file: string;
  readonly pack: {
    readonly packId: string;
    readonly examCode: string;
    readonly items: ReadonlyArray<{ readonly questionId: string; readonly stem: string; readonly domainCode: string }>;
  };
}

interface ConceptIndexCatalog {
  readonly examCode: string;
  readonly concepts: ReadonlyArray<{
    readonly id: string;
    readonly packId: string;
    readonly title: string;
    readonly reviewStatus?: string;
    readonly reviewedAt?: string | null;
    readonly summary?: string;
    readonly confusions?: ReadonlyArray<{ readonly term: string; readonly with: string; readonly difference: string }>;
    readonly sourceUrls?: readonly string[];
  }>;
}

export function buildConceptQuestionIndex(
  packs: readonly ConceptQuestionPack[],
  catalog: ConceptIndexCatalog,
): Record<string, { sourceQuestionId: string; examCode: string; domainCode: string; conceptId: string }>;
