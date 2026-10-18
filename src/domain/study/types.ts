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

/** 시작 시 고정되는 스냅샷(문제 개정 + 보기 순서 + 정답 집합). */
export interface StudySetItemSnapshot {
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly versionNo: QuestionVersion['versionNo'];
  /** 시작 시 섞어 고정한 보기 순서(옵션 id 배열). 다른 회차는 새로 섞는다. */
  readonly optionOrder: readonly string[];
  /** 시작 시점 개정의 정답 집합 — 제출 채점은 pool 재조회가 아니라 이 스냅샷으로 한다(개정 불변). */
  readonly answerOptionIds: readonly string[];
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
