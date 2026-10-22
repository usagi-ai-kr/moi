// 반응형 구간 판정 — 모바일(≤767px) Drawer와 데스크톱 가로 nav 전환 (ADR-0057).
// jsdom은 미디어 쿼리를 평가하지 않으므로 `matchMedia` 결과를 상태로 관리한다.
import { useEffect, useState } from 'react';
import { breakpoints } from './tokens';

/** 태블릿(768px) 미만 구간 — 햄버거 + 우측 Drawer (ADR-0057). */
export const MOBILE_NAV_QUERY = `(max-width: ${breakpoints.tablet - 1}px)`;

function readMql(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query);
}

/** 미디어 쿼리 매칭 상태를 구독한다. viewport 변경 시 재렌더를 유발한다. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMql(query)?.matches ?? false);

  useEffect(() => {
    const mql = readMql(query);
    if (!mql) return;
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);

  return matches;
}
