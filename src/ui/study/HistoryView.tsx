import { copy } from '../copy';
import type { StudySummary } from '../api/client';
import { formatDateTime, scopeLabel } from './types';

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
}

// 이력 — 완료 세트 목록(날짜·모드/영역·정답률·페이지네이션)과 요약 상세.
export function HistoryView(p: Props) {
  const totalPages = Math.max(1, Math.ceil(p.total / p.pageSize));
  return (
    <section className="moi-study" aria-label={copy.study.historyTitle}>
      <h2 className="moi-study-title">{copy.study.historyTitle}</h2>
      {p.pending && <p className="moi-note" role="status" aria-live="polite">{copy.session.checking}</p>}
      {p.loadError && (
        <div className="moi-alert moi-alert-error" role="alert">
          <p className="moi-alert-text">{copy.session.loadError}</p>
          <button type="button" className="moi-alert-retry" onClick={p.onRetry}>
            {copy.session.retry}
          </button>
        </div>
      )}
      {!p.pending && !p.loadError && p.items.length === 0 && (
        <p className="moi-note">{copy.study.emptyHistory}</p>
      )}
      <ul className="moi-study-history">
        {p.items.map((s) => (
          <li key={s.id}>
            <button type="button" className="moi-study-history-item" onClick={() => p.onDetail(s.id)}>
              {formatDateTime(s.submittedAt)} · {scopeLabel(s.mode)} · 정답률 {s.accuracyPercent}% ·{' '}
              {s.correctCount}문제
            </button>
            {p.detailId === s.id && (
              <div className="moi-study-detail" role="dialog" aria-label={`${s.id} 상세`}>
                <p className="moi-note">
                  {s.examId} · {scopeLabel(s.mode)}
                  {s.domainId ? ` · ${s.domainId}` : ''} · {formatDateTime(s.submittedAt)}
                </p>
                <button type="button" className="moi-study-ghost" onClick={() => p.onDetail(null)}>
                  {copy.study.close}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="moi-study-nav" aria-label="페이지 이동">
        <button
          type="button"
          className="moi-study-secondary"
          disabled={p.page <= 1}
          onClick={() => p.onPage(p.page - 1)}
        >
          {copy.study.prev}
        </button>
        <span className="moi-note" aria-live="polite">
          {p.page}/{totalPages} · 전체 {p.total}
        </span>
        <button
          type="button"
          className="moi-study-secondary"
          disabled={p.page >= totalPages}
          onClick={() => p.onPage(p.page + 1)}
        >
          {copy.study.next}
        </button>
      </div>
    </section>
  );
}
