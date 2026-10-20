import { Link, useInRouterContext } from 'react-router';
import { copy } from '../copy';
import type { StudySummary } from '../api/client';
import { Pagination } from '../components/ui/pagination';
import { domainLabel } from '../stats/StatsPanel';
import { formatDateTime, scopeLabel, STUDY_EXAM_LABEL } from './types';
import './study.css';
import './study-result.css';

interface Props {
  items: StudySummary[];
  total: number;
  page: number;
  pageSize: number;
  pending: boolean;
  loadError: boolean;
  detailId: string | null;
  onPage: (p: number) => void;
  onDetail: (id: string | null) => void;
  onRetry: () => void;
  onOpenDetail?: (id: string) => void;
  hidePagerWhenEmpty?: boolean;
  isFetching?: boolean;
}

function HistoryDetailAction({
  setId,
  page,
  onOpenDetail,
}: {
  setId: string;
  page: number;
  onOpenDetail?: (id: string) => void;
}) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return (
      <Link
        className="moi-study-link"
        to="/history/detail"
        state={{ setId, page }}
        onClick={(e) => {
          if (onOpenDetail) {
            e.preventDefault();
            onOpenDetail(setId);
          }
        }}
      >
        {copy.study.detail}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="moi-study-link"
      onClick={() => onOpenDetail?.(setId)}
    >
      {copy.study.detail}
    </button>
  );
}

// 이력 — 완료 세트 목록(날짜·모드/영역·정답률·페이지네이션)과 요약 상세.
export function HistoryView(p: Props) {
  const showPager = !p.pending && !p.loadError && p.total > 0 && !(p.hidePagerWhenEmpty && p.total === 0);
  return (
    <section className="moi-study" aria-label={copy.study.historyTitle}>
      <h2 className="moi-study-title">{copy.study.historyTitle}</h2>
      {p.pending && <p className="moi-note" role="status" aria-live="polite">{copy.common.loading}</p>}
      {p.loadError && (
        <div className="moi-alert moi-alert-error" role="alert">
          <p className="moi-alert-text">{copy.session.loadError}</p>
          <button type="button" className="moi-alert-retry" onClick={p.onRetry}>
            {copy.session.retry}
          </button>
        </div>
      )}
      {!p.pending && !p.loadError && p.total === 0 && (
        <p className="moi-note">{copy.study.emptyHistory}</p>
      )}
      <ul className="moi-study-history">
        {p.items.map((s) => (
          <li key={s.id}>
            <button type="button" className="moi-study-history-item" onClick={() => p.onDetail(s.id)}>
              {formatDateTime(s.submittedAt)} · {scopeLabel(s.mode)} · 정답률 {s.accuracyPercent}% ·{' '}
              {s.correctCount}문제
            </button>
            {!p.loadError && p.detailId === s.id && (
              <div className="moi-study-detail" role="dialog" aria-label={`${formatDateTime(s.submittedAt)} 학습 상세`}>
                <p className="moi-note">
                  {STUDY_EXAM_LABEL} · {scopeLabel(s.mode)}
                  {s.domainId ? ` · ${domainLabel(s.domainId)}` : ''} · {formatDateTime(s.submittedAt)}
                </p>
                <div className="moi-cta moi-study-cta-row">
                  <HistoryDetailAction
                    setId={s.id}
                    page={p.page}
                    onOpenDetail={p.onOpenDetail}
                  />
                  <button type="button" className="moi-study-ghost" onClick={() => p.onDetail(null)}>
                    {copy.study.close}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {showPager && (
        <Pagination
          total={p.total}
          page={p.page}
          pageSize={p.pageSize}
          onPageChange={p.onPage}
          disabled={Boolean(p.isFetching && !p.pending)}
        />
      )}
    </section>
  );
}
