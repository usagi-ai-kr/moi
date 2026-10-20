import { copy } from '../copy';
import { STUDY_DOMAINS } from '../study/types';

export function pct(v: number | null): string {
  return v === null ? copy.stats.noAccuracy : `${Math.round(v * 100)}%`;
}

export function domainLabel(id: string): string {
  const found = STUDY_DOMAINS.find((d) => d.id === id)?.label;
  if (found) return found;
  // legacy alias — 과거 UI·픽스처가 쓰던 짧은 id도 canonical 라벨로 매핑한다.
  if (id === 'dom-cost') return '비용 최적화';
  return copy.stats.unknownDomain;
}

export function statusLabel(s: 'ok' | 'insufficient-data'): string {
  return s === 'ok' ? '표본 충분' : '데이터 부족';
}
