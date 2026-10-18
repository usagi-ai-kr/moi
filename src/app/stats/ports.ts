import type { StudyHistoryEntry } from '@/domain/stats/types';

/**
 * 학습 현황 Port 계약 (이슈 #54, ADR-0021).
 * - 실제 D1 어댑터는 저장 단계(#53)에서 구현하고, app은 계약만 안다.
 * - 테스트는 fake 구현만 사용한다(DB/네트워크 금지 — 브리프 범위).
 */

export interface StudyHistoryPort {
  /** 한 시험의 학습 이력 — 시험별 분리의 서버 경계(ADR-0021). */
  listByExam(input: { examId: string }): Promise<readonly StudyHistoryEntry[]>;
}

/** 북마크 Port — 추천 보강용 계약만 정의하고 본 단위에서는 주입하지 않는다(범위 밖: 사용 시 주입). */
export interface StudyBookmarkPort {
  listByExam(input: { examId: string }): Promise<readonly { questionId: string; domainId: string }[]>;
}

/** 기준 시각 Port — 통계의 "최근" 판정 기준. 테스트는 고정 시각 fake로 결정성을 지킨다. */
export interface StatsClock {
  now(): number;
}
