// #308 — 문항 선택 개수는 문항 메타데이터(answerCount = 정답 보기 수)가 진실 원천이다.
// 지시문 문자열 파싱은 금지한다. 학습·복습이 같은 semantics를 공유한다(#274).

/** 단일 선택 문항 여부 — 정답이 1개인 개정(“1개를 고르시오”)은 정확히 1개만 고를 수 있다. */
export function isSingleChoice(answerCount: number): boolean {
  return answerCount === 1;
}

/**
 * 보기 선택 semantics (BDD, 이슈 #308):
 * - 단일 선택(answerCount === 1)은 radio 계약 — 누르면 이전 선택을 해제하고 새 보기 하나만 남는다.
 * - 복수 선택은 checkbox 계약 — 기존 기능(누적·해제 토글)을 그대로 유지한다.
 */
export function nextSelectedIds(answerCount: number, current: readonly string[], optionId: string): string[] {
  if (isSingleChoice(answerCount)) return [optionId];
  return current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
}
