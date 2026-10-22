export interface ConceptDocument {
  readonly id: string;
  readonly title: string;
  readonly packId: string;
  readonly reviewStatus: 'reviewed' | 'pending';
  readonly reviewedAt: string | null;
  readonly summary: string;
  readonly confusions: ReadonlyArray<{ readonly term: string; readonly with: string; readonly difference: string }>;
  readonly sourceUrls: readonly string[];
}
