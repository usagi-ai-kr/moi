import type { StudyMode } from '../api/client';

// SAA-C03 고정 — 시험 선택 UI 없음 (이슈 #50).
export const STUDY_EXAM_ID = 'saa-c03';

// SAA 4영역 — id는 문제은행 시드(dom-*)와 동일, 라벨은 한글.
export const STUDY_DOMAINS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'dom-security', label: '보안' },
  { id: 'dom-resilience', label: '복원력' },
  { id: 'dom-performance', label: '성능' },
  { id: 'dom-cost', label: '비용 최적화' },
];

export type StudyView = 'start' | 'active' | 'result' | 'history';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
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
