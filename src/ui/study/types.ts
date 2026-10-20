import { copy } from '../copy';
import type { StudyMode } from '../api/client';

// SAA-C03 고정 — 단일 시험 selector만 제공한다 (이슈 #212, #50).
export const STUDY_EXAM_ID = 'saa-c03';
// 지원 시험 단일 상수 — 현재 SAA-C03 1개, 향후 추가 시 배열 확장 (ADR-0056).
export const STUDY_EXAMS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'saa-c03', label: 'AWS Certified Solutions Architect – Associate (SAA-C03)' },
];
// 화면 표시명 — 내부 examId 대신 사용자에게 보여준다 (#148).
export const STUDY_EXAM_LABEL = 'AWS SAA-C03';

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
/** idle/saving/saved/error에 offline(재전송 대기)·conflict(사용자 선택 필요)를 추가 — 이슈 #52. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline' | 'conflict';
export type StudyScope = StudyMode;

export function scopeLabel(scope: StudyScope): string {
  if (scope === 'domain') return '영역별';
  if (scope === 'weak') return '취약 영역';
  return '전체';
}

export function formatDateTime(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return copy.study.unknownDate;
  }
  const ms = value < 1e12 ? value * 1000 : value;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return copy.study.unknownDate;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(d);
}
