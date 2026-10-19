import type { StudyMode } from '../api/client';

// SAA-C03 고정 — 시험 선택 UI 없음 (이슈 #50).
export const STUDY_EXAM_ID = 'saa-c03';
// 화면 표시명 — 내부 examId 대신 사용자에게 보여준다 (#148).
export const STUDY_EXAM_LABEL = 'AWS SAA-C03';

// 이력 페이지 기본 크기 단일 상수 (이슈 #148)
export const HISTORY_PAGE_SIZE = 20;

// SAA 4영역 — id는 문제은행 시드(dom-*)와 동일, 라벨은 한글.
export const STUDY_DOMAINS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'dom-security', label: '보안' },
  { id: 'dom-resilience', label: '복원력' },
  { id: 'dom-performance', label: '성능' },
  { id: 'dom-cost', label: '비용 최적화' },
];

export type StudyView = 'start' | 'active' | 'result' | 'history';
/** idle/saving/saved/error에 offline(재전송 대기)·conflict(사용자 선택 필요)를 추가 — 이슈 #52. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline' | 'conflict';
export type StudyScope = StudyMode;

export function scopeLabel(scope: StudyScope): string {
  if (scope === 'domain') return '영역별';
  if (scope === 'weak') return '취약 영역';
  return '전체';
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
