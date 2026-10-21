import { copy } from '../copy';
import type { StudyMode } from '../api/client';

// 시험 목록 단일 소스 — src/ui/exam/exam-catalog.ts (ADR-0068).
// 시험 코드는 공개 코드만 쓰고 내부 ID는 노출하지 않는다.
export { DEFAULT_EXAM_CODE, EXAM_CATALOG, examLabel, findExam } from '../exam/exam-catalog';

// 이력 페이지 기본 크기 단일 상수 (이슈 #148)
export const HISTORY_PAGE_SIZE = 20;

// SAA 4영역 — id는 문제은행 시드(dom-*)와 동일, 라벨은 한글.
export const STUDY_DOMAINS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'dom-security', label: '보안' },
  { id: 'dom-resilience', label: '복원력' },
  { id: 'dom-performance', label: '성능' },
  { id: 'dom-cost-optimization', label: '비용 최적화' },
];

export type StudyView = 'start' | 'active' | 'result' | 'history';

// 학습 흐름 훅 옵션 (#148 라우트 분리) — useStudyFlow 계약.
// useStudyFlow.ts 에서 추출했다(#268 Slice 2C — 모듈 250줄 상한 해소, ADR-0015 모듈 길이 예산). 필드·의미는 그대로다.
export interface StudyFlowOptions {
  initialSetId?: string | null;
  onSetStarted?: (id: string) => void;
  onSubmitted?: (id: string) => void;
  onAbandoned?: () => void;
}
/** idle/saving/saved/error에 offline(재전송 대기)·conflict(사용자 선택 필요)를 추가 — 이슈 #52. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline' | 'conflict';
export type StudyScope = StudyMode;

export function scopeLabel(scope: StudyScope): string {
  if (scope === 'domain') return '영역별';
  if (scope === 'weak') return '취약 영역';
  return '전체';
}

/**
 * 표시 하한 — 1971-01-01(UTC) 이전 값은 '날짜 정보 없음'으로 되돌린다.
 * 작은 양수(1~86399 등)는 1970 표기가 되므로 하한 아래는 모두 미표시 처리한다(#260, ADR-0074).
 */
const MIN_EPOCH_SECONDS = 31_536_000;

export function formatDateTime(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return copy.study.unknownDate;
  }
  // 저장 단위는 epoch seconds — 1e12 미만은 초, 그 이상은 ms로 정규화한다(ADR-0056).
  const ms = value < 1e12 ? value * 1000 : value;
  if (ms / 1000 < MIN_EPOCH_SECONDS) return copy.study.unknownDate;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return copy.study.unknownDate;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(d);
}
