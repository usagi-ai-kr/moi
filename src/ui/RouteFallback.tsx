import { useEffect, useState } from 'react';
import { copy } from './copy';
import { DetailSkeleton, FormSkeleton, PageSkeleton } from './Skeletons';

// 라우트 로딩 폴백 — 150ms 안에 끝나는 로드에서는 아무것도 그리지 않아 빈 화면/텍스트 깜빡임을 막는다 (#184).
// 느린 로드에서만 레이아웃을 닮은 스켈레톤을 보여주고, 스크린리더에는 항상 로딩 문구를 전달한다.
export const ROUTE_FALLBACK_DELAY_MS = 150;

export type RouteFallbackVariant = 'page' | 'form' | 'detail';

function Skeleton({ variant }: { variant: RouteFallbackVariant }) {
  if (variant === 'form') return <FormSkeleton />;
  if (variant === 'detail') return <DetailSkeleton />;
  return <PageSkeleton />;
}

export function RouteFallback({ variant = 'page' }: { variant?: RouteFallbackVariant }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), ROUTE_FALLBACK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="moi-route-fallback" data-variant={variant} role="status" aria-busy="true" aria-live="polite">
      <span className="moi-sr-only">{copy.common.loading}</span>
      {visible && <Skeleton variant={variant} />}
    </div>
  );
}
