/**
 * 20문제 학습 세트 도메인 타입 (이슈 #49, ADR-0020).
 * - 계정·시험별 활성 세트는 최대 하나, 세트는 20문제이며 세트 내 동일 문제 중복 금지.
 * - 시작 시 문제 개정 버전 + 보기 순서를 스냅샷으로 고정한다(새로고침·이어풀기 유지).
 * - 제출 후 결과 덮어쓰기·변경 금지, 포기 후 채점 금지, 포기는 통계 미반영.
 * - 외부 패키지·Drizzle 타입 의존 금지.
 */

import type { QuestionVersion } from '@/domain/question/question';

export type StudySetMode = 'all' | 'domain' | 'weak';
export type StudySetStatus = 'active' | 'submitted' | 'abandoned';
export type ResponseKind = 'answered' | 'pass' | 'unanswered';

export type ItemResponse =
  | { readonly kind: 'answered'; readonly optionIds: readonly string[] }
  | { readonly kind: 'pass' }
  | { readonly kind: 'unanswered' };

/** 시작 시 고정되는 스냅샷(문제 개정 + 보기 순서 + 정답 집합 + 내용). */
export interface StudySetItemSnapshot {
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly versionNo: QuestionVersion['versionNo'];
  /** 시작 시 섞어 고정한 보기 순서(옵션 id 배열). 다른 회차는 새로 섞는다. */
  readonly optionOrder: readonly string[];
  /** 시작 시점 개정의 정답 집합 — 제출 채점은 pool 재조회가 아니라 이 스냅샷으로 한다(개정 불변). */
  readonly answerOptionIds: readonly string[];
  /** 시작 시점 문제 본문 — 제출 전 DTO에 노출한다(#50). */
  readonly stem: string;
  /** 시작 시점 보기 텍스트 — 제출 전 DTO에 노출한다(#50). */
  readonly options: ReadonlyArray<{ readonly optionId: string; readonly text: string }>;
  /** 시작 시점 해설 — 제출 후에만 노출한다(#50). */
  readonly explanation: string;
  /** 시작 시점 근거 URL — 제출 후에만 노출한다(#50). */
  readonly sourceUrls: readonly string[];
}

export interface StudySetItem extends StudySetItemSnapshot {
  readonly response: ItemResponse;
}

export interface StudySetPerItem {
  readonly questionId: string;
  readonly responseKind: ResponseKind;
  readonly selectedOptionIds: readonly string[];
  readonly correctOptionIds: readonly string[] | null;
  readonly correct: boolean;
}

export interface StudySetResult {
  readonly answeredCount: number;
  readonly correctCount: number;
  /** 정답률(%) — Math.round(correct/items*100)·0~100 균등 스케일 근거는 thresholds 주석. */
  readonly accuracyPercent: number;
  readonly passCount: number;
  readonly unansweredCount: number;
  readonly perItem: readonly StudySetPerItem[];
}

/** 정정 재계산 결과의 문항 단위 행 — 최초 채점 이력을 그대로 두고 제외 여부만 덧붙인다(이슈 #53). */
export interface CorrectedSetPerItem extends StudySetPerItem {
  readonly excluded: boolean;
}

/** 정정 재계산 결과 — 최초 result는 바꾸지 않고 제외분을 걸러 유효 분모로 다시 계산한다(ADR-0021·0025). */
export interface CorrectedSetResult {
  readonly answeredCount: number;
  readonly correctCount: number;
  /** 정답률(%) — 유효 분모 기준. 유효 0이면 null(채점 불가)이라 최초 accuracyPercent와 타입이 다르다. */
  readonly accuracyPercent: number | null;
  readonly passCount: number;
  readonly unansweredCount: number;
  /** 유효 분모가 0인 상태 — 채점 불가(throw하지 않고 값으로 표현). */
  readonly ungraded: boolean;
  /** 유효 분모(채점에 반영된 문항 수). */
  readonly validTotal: number;
  readonly excludedCount: number;
  /** 세트에 실제로 존재하는 제외 개정 id(원본 순서). */
  readonly excludedQuestionVersionIds: readonly string[];
  readonly perItem: readonly CorrectedSetPerItem[];
}

export interface StudySet {
  readonly id: string;
  readonly userId: string;
  readonly examId: string;
  readonly mode: StudySetMode;
  /** 영역 모드에서 선택한 시험 영역 id. */
  readonly domainId?: string;
  readonly status: StudySetStatus;
  readonly createdAt: number;
  readonly items: readonly StudySetItem[];
  readonly submittedAt?: number;
  readonly result?: StudySetResult;
}

/** 이력 목록 요약(날짜·영역·정답률). */
export interface StudySetSummary {
  readonly id: string;
  readonly examId: string;
  readonly mode: StudySetMode;
  readonly domainId?: string;
  readonly submittedAt: number;
  readonly correctCount: number;
  readonly accuracyPercent: number;
}
