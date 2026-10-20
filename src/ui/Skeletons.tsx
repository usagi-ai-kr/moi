import './skeleton.css';

// 초기 로딩 스켈레톤 — 레이아웃을 보존해 텍스트 깜빡임·시프트를 줄인다 (DESIGN.md 7항, #184).
// 모두 장식 요소이므로 aria-hidden이며, 의미 전달은 호출부의 sr-only 문구·aria-busy가 담당한다.

function SkeletonBlock({ className }: { className: string }) {
  return <span className={`moi-skeleton ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="moi-skeleton-page" data-slot="skeleton" data-variant="page" aria-hidden="true">
      <SkeletonBlock className="moi-skeleton-title" />
      <SkeletonBlock className="moi-skeleton-line" />
      <SkeletonBlock className="moi-skeleton-line" />
      <SkeletonBlock className="moi-skeleton-line moi-skeleton-line-short" />
      <SkeletonBlock className="moi-skeleton-card" />
      <SkeletonBlock className="moi-skeleton-card" />
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="moi-skeleton-page" data-slot="skeleton" data-variant="form" aria-hidden="true">
      <SkeletonBlock className="moi-skeleton-title" />
      {[0, 1, 2].map((n) => (
        <div key={n} className="moi-skeleton-choice">
          <SkeletonBlock className="moi-skeleton-dot" />
          <SkeletonBlock className="moi-skeleton-line moi-skeleton-choice-line" />
        </div>
      ))}
      <SkeletonBlock className="moi-skeleton-button" />
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="moi-skeleton-page" data-slot="skeleton" data-variant="detail" aria-hidden="true">
      <div className="moi-skeleton-panel">
        <SkeletonBlock className="moi-skeleton-title moi-skeleton-title-short" />
        <SkeletonBlock className="moi-skeleton-line" />
        <SkeletonBlock className="moi-skeleton-line" />
        <SkeletonBlock className="moi-skeleton-line moi-skeleton-line-short" />
      </div>
    </div>
  );
}

export function HistorySkeleton() {
  return (
    <div className="moi-skeleton-page" data-slot="skeleton" data-variant="history" aria-hidden="true">
      <div className="moi-skeleton-panel">
        <SkeletonBlock className="moi-skeleton-line moi-skeleton-line-short" />
        <SkeletonBlock className="moi-skeleton-line" />
      </div>
      <SkeletonBlock className="moi-skeleton-row" />
      <SkeletonBlock className="moi-skeleton-row" />
      <SkeletonBlock className="moi-skeleton-row" />
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="moi-skeleton-page" data-slot="skeleton" data-variant="stats" aria-hidden="true">
      {[0, 1, 2].map((n) => (
        <div key={n} className="moi-skeleton-panel">
          <SkeletonBlock className="moi-skeleton-line moi-skeleton-line-short" />
          <SkeletonBlock className="moi-skeleton-line" />
        </div>
      ))}
    </div>
  );
}
