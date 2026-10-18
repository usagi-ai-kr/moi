/**
 * 텍스트 정규화·측정 보조 (이슈 #48) — 순수 함수, 결정적.
 */

/** 중복 판정용 정규화: 유니코드 정규화 + 소문자화 + 공백 압축 + 양끝 trim. */
export function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** 문장 수: 마침표·물음표·느낌표로 분리한 비어 있지 않은 문단 개수. */
export function sentenceCount(value: string): number {
  return value
    .split(/[.!?]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0).length;
}

/** 내부 구분점 수: 문장 끝 마침표는 제외하고 쉼표·마침표·구분점(·)만 센다(정보량 편향 측정). */
export function internalSeparatorCount(value: string): number {
  const stripped = value.replace(/[.·]+\s*$/, '');
  return (stripped.match(/[.,·]/g) ?? []).length;
}
