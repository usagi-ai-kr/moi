/**
 * 문제은행 도메인 타입과 불변식 (이슈 #46, ADR-0019).
 * - 시험 독립 구조: 시험·영역·문제·개정·보기를 분리하고 화면 번호/위치와 섞지 않는다.
 * - 풀이 이력이 있는 문제는 물리 삭제 대신 비활성화한다(`inactive`).
 * - 외부 패키지·Drizzle 타입 의존 금지 — 영속 행과의 변환은 infra mapper가 담당한다.
 */

export type QuestionStatus = 'active' | 'inactive';

/** 시험 — `code`가 시험 식별자(예: 'saa-c03'). */
export interface Exam {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly createdAt: number;
}

/** 시험별 출제 영역 — `weight`는 배분 가중치(정수 percent). */
export interface ExamDomain {
  readonly id: string;
  readonly examId: string;
  readonly code: string;
  readonly name: string;
  readonly weight: number;
  readonly createdAt?: number;
}

/** 문제 — 개정과 분리된 식별자 + 현재 개정 번호. */
export interface Question {
  readonly id: string;
  readonly examId: string;
  readonly domainId: string;
  readonly status: QuestionStatus;
  readonly currentVersionNo: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** 문제 개정 — 본문·해설·정답 보기 집합 스냅샷. */
export interface QuestionVersion {
  readonly id: string;
  readonly questionId: string;
  readonly versionNo: number;
  readonly stem: string;
  readonly explanation: string;
  readonly sourceUrls: string[];
  readonly answerOptionIds: string[];
  readonly optionSetHash: string;
  readonly reviewStatus: string;
  readonly createdAt: number;
  readonly supersededAt: number | null;
}

/** 개정별 보기 — 화면상 번호/위치와 분리된 고유 키. */
export interface QuestionOption {
  readonly id: string;
  readonly questionVersionId: string;
  readonly optionKey: string;
  readonly text: string;
}

/** 감사 로그 최소 골격 — 토큰·개인정보 원문을 담지 않는다. */
export interface AuditLog {
  readonly id: string;
  readonly actor: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly requestId: string;
  readonly createdAt: number;
}

export function assertValidStatus(status: string): asserts status is QuestionStatus {
  if (status !== 'active' && status !== 'inactive') {
    throw new Error('question: status must be active|inactive');
  }
}

/**
 * 정답 보기 집합 불변식 — `answerOptionIds`는 해당 개정 보기 id의 부분집합이어야 한다.
 * 저장 전에 검증한다(호출자는 영속 계층에 도달하지 않는다).
 */
export function assertAnswerOptionIdsSubset(answerOptionIds: readonly string[], optionIds: readonly string[]): void {
  if (answerOptionIds.length === 0) {
    throw new Error('question: answer_option_ids must not be empty');
  }
  const available = new Set(optionIds);
  for (const id of answerOptionIds) {
    if (!available.has(id)) {
      throw new Error('question: answer_option_ids must be a subset of option ids');
    }
  }
  if (new Set(answerOptionIds).size !== answerOptionIds.length) {
    throw new Error('question: answer_option_ids must not contain duplicates');
  }
}

/** 다음 개정 번호 — 기존 최대값 + 1, 없으면 1. */
export function nextVersionNo(existing: readonly number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

/**
 * 영역 가중치 합 검증 — SAA-C03 시드 정책(합 100). 저장 불변식이 아니라 시드 검증용이다.
 * 다른 시험의 배분 정책은 해당 시험의 관리 API(#47) 입력 검증에서 다룬다.
 */
export function assertWeightsSumToHundred(weights: readonly number[]): void {
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) {
    throw new Error('question: weights must be non-negative integers');
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum !== 100) {
    throw new Error(`question: weights must sum to 100 (got ${sum})`);
  }
}
