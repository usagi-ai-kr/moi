import type { StudyHistoryEntry } from '@/domain/stats/types';

/**
 * study_attempts → 통계 이력 Port (이슈 #54).
 * - computeStudyStats 입력인 StudyHistoryEntry[]를 사용자/시험 기준으로 조회한다.
 * - D1 어댑터는 `src/infra/persistence/study-attempt-history.ts`.
 */
export interface StudyHistoryPort {
  load(input: { readonly userId: string; readonly examId: string }): Promise<StudyHistoryEntry[]>;
}
