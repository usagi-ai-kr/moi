import { copy } from '../copy';
import { STUDY_DOMAINS } from '../study/types';

export function pct(v: number | null): string {
  return v === null ? copy.stats.noAccuracy : `${Math.round(v * 100)}%`;
}

export function domainLabel(id: string): string {
  return STUDY_DOMAINS.find((d) => d.id === id)?.label ?? id;
}

export function statusLabel(s: 'ok' | 'insufficient-data'): string {
  return s === 'ok' ? '표본 충분' : '데이터 부족';
}
