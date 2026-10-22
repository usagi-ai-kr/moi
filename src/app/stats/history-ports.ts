/**
 * 하위 호환 re-export (이슈 #54).
 * - 계약의 진실 원천은 `./ports`의 `StudyHistoryPort`(`load({userId,examId})`)다.
 * - 기존 `history-ports` import가 깨지지 않도록 타입만 재노출한다.
 */
export type { StudyHistoryPort } from './ports';
