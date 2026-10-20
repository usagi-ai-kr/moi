import type { ReviewMode, ReviewSession } from '@/domain/review/types';
import type { ReviewGradingRepository } from './grading-ports';

/** 복습 application Port (이슈 #51, ADR-0020). DB/HTTP/UI는 infra에서 구현한다. */

/** 후보 항목 — 소스(오답 이력/북마크 목록)에서 조회한 최신 복습 대상. */
export interface ReviewCandidateInput {
  readonly questionId: string;
  /** 유효 누적 오답 횟수 — Pass·미응답 제출도 오답으로 계수된다. bookmark 모드에서는 무시된다. */
  readonly validWrongCount: number;
  readonly version: {
    readonly questionVersionId: string;
    readonly versionNo: number;
    readonly optionIds: readonly string[];
    readonly answerOptionIds: readonly string[];
  };
}

/**
 * 복습 대상 소스 Port — 후보 목록은 조회 시점의 **최신** 상태다.
 * 회차 시작 시 이 목록을 스냅샷으로 고정하므로, 회차 중 증감은 다음 회차부터 반영된다.
 */
export interface ReviewSourcePort {
  listWrongCandidates(input: { userId: string; examId: string }): Promise<readonly ReviewCandidateInput[]>;
  listBookmarkCandidates(input: { userId: string; examId: string }): Promise<readonly ReviewCandidateInput[]>;
  /** 북마크 추가/해제 — 개인별 독립 상태. 진행 중 회차 대상에는 영향을 주지 않는다. */
  toggleBookmark(input: { userId: string; questionId: string }): Promise<{ bookmarked: boolean }>;
  /** 명시 상태 SET 멱등 — true는 INSERT 1문, false는 DELETE 1문. 토글 모사 금지. 시험격리·없는문제 거부. */
  setBookmark(input: { userId: string; examId: string; questionId: string; bookmarked: boolean }): Promise<{ bookmarked: boolean }>;
}

/** 회차 저장소 — 계정·시험·모드별 활성 회차는 최대 1개(어댑터가 부분 UNIQUE로 보장). */
export interface ReviewSessionRepository {
  findActive(input: { userId: string; examId: string; mode: ReviewMode }): Promise<ReviewSession | null>;
  /** 직전 ended 회차(큐 포함) — 10문항 queue plan용. 없으면 null. */
  findLastEnded(input: { userId: string; examId: string; mode: ReviewMode }): Promise<ReviewSession | null>;
  save(input: { session: ReviewSession }): Promise<void>;
  /** 종료 전용 cursor CAS. stale cursor·소유권·이미 종료된 다른 snapshot은 false. 동일 ended snapshot은 멱등 성공. */
  end(input: { session: ReviewSession; expectedCursor: number }): Promise<boolean>;
}

export interface ReviewClock {
  now(): number;
}

export interface ReviewRng {
  next(): number;
}

export interface ReviewDeps {
  readonly source: ReviewSourcePort;
  readonly repository: ReviewSessionRepository;
  /** 원자 채점 저장(#54) — 필수 주입, 순차 save+recordBatch fallback 금지. */
  readonly grading: ReviewGradingRepository;
  readonly clock: ReviewClock;
  readonly rng: ReviewRng;
}
