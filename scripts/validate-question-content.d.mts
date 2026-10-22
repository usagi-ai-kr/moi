// #134 — scripts/validate-question-content.mjs의 타입 표면 (typecheck용).
export const ALLOWED_SOURCE_PREFIX: string;
export const SAA_DOMAIN_CODES: string[];
export const ALLOWED_EXAM_CODES: string[];
export const BULK_FIELDS: string[];
export interface ContentOption {
  optionKey: string;
  text: string;
}
export interface ContentItem {
  questionId: string;
  domainCode: string;
  stem: string;
  explanation: string;
  sourceUrls: string[];
  answerOptionKeys: string[];
  options: ContentOption[];
}
export interface ContentPack {
  packId: string;
  examCode: string;
  items: ContentItem[];
}
export interface ContentProblem {
  file: string;
  questionId: string;
  message: string;
}
export interface SeenMaps {
  ids: Map<string, string>;
  stems: Map<string, string>;
}
export function normalizeStem(stem: string): string;
export function sortedOptions(options: ContentOption[]): ContentOption[];
export function optionSetHash(options: ContentOption[]): string;
/** #308 — stem의 고르기 지시 개수와 정답 개수(answerOptionKeys) 불일치를 판정한다. 불일치 시 결정적 문구를 반환한다. */
export function chooseCountMismatch(stem: string, answerCount: number): string | null;
export function validatePack(pack: ContentPack, file: string, seen?: SeenMaps): ContentProblem[];
export function collectPackFiles(root: string): string[];
export function toBulkBody(packs: Array<{ pack: ContentPack; file: string }>): {
  items: Array<Record<string, unknown>>;
};
