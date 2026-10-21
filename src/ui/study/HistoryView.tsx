import { copy } from '../copy';
import { iconHistory, iconRefresh } from '../icons';
import type { StudySummary } from '../api/client';
import { Pagination } from '../components/ui/pagination';
import { HistorySkeleton } from '../Skeletons';
import { CompletedHistoryList } from '../history/CompletedHistoryList';
import { HistoryDetailDialog } from '../history/CompletedHistoryDetail';
import { formatDateTime, scopeLabel } from './types';
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
  /**
   * `inline` = 학습 화면 이력(한 줄 텍스트 목록, 기존 동작).
   * `columns` = 학습 현황 완료 탭(컬럼 표/라벨-값 카드) — #224 추가 피드백.
   * 기본값 inline이라 학습 화면(StudyScreen) 동작은 바뀌지 않는다.
   */
  variant?: 'inline' | 'columns';
}

// 이력 — 완료 세트 목록(날짜·모드/영역·정답률·페이지네이션)과 요약 상세.
// initial loading은 스켈레톤, background refetch는 기존 목록 유지 + aria-busy (#184).
export function HistoryView(p: Props) {
  const showPager = !p.pending && !p.loadError && p.total > 0 && !(p.hidePagerWhenEmpty && p.total === 0);
  const isColumns = p.variant === 'columns';
  return (
    <section
      className="moi-study"
      aria-label={copy.study.historyTitle}
      aria-busy={p.isFetching ? 'true' : undefined}
    >
      <h2 className="moi-study-title inline-flex items-center gap-2">
        <iconHistory.icon aria-hidden="true" size={iconHistory.size} />
        {copy.study.historyTitle}
      </h2>
      {p.pending && !p.loadError && (
        <div className="moi-history-pending" role="status" aria-busy="true">
          <span className="moi-sr-only">{copy.common.loading}</span>
          <HistorySkeleton />
        </div>
      )}
      {p.loadError && (
        <div className="moi-alert moi-alert-error" role="alert">
          <p className="moi-alert-text">{copy.session.loadError}</p>
          <button type="button" className="moi-alert-retry" onClick={p.onRetry}>
            <iconRefresh.icon aria-hidden="true" size={iconRefresh.size} className="mr-1" />
            {copy.session.retry}
          </button>
        </div>
      )}
      {!p.pending && !p.loadError && p.total === 0 && (
        <p className="moi-note">{copy.study.emptyHistory}</p>
      )}
      {isColumns ? (
        <CompletedHistoryList
          items={p.items}
          detailId={p.loadError ? null : p.detailId}
          page={p.page}
          onDetail={p.onDetail}
          onOpenDetail={p.onOpenDetail}
        />
      ) : (
        <ul className="moi-study-history">
          {p.items.map((s) => (
            <li key={s.id}>
              <button type="button" className="moi-study-history-item" onClick={() => p.onDetail(s.id)}>
                {formatDateTime(s.submittedAt)} · {scopeLabel(s.mode)} · 정답률 {s.accuracyPercent}% ·{' '}
                {s.correctCount}문제
              </button>
              {!p.loadError && p.detailId === s.id && (
                <HistoryDetailDialog
                  item={s}
                  page={p.page}
                  onClose={() => p.onDetail(null)}
                  onOpenDetail={p.onOpenDetail}
                />
              )}
            </li>
          ))}
        </ul>
      )}
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
