import { Navigate, useLocation, useNavigate } from 'react-router';
import { copy } from '../copy';
import { isSubmittedSet, type ApiClient } from '../api/client';
import { useStudyCorrections, useStudySet } from '../study/queries';
import { ResultView } from '../study/ResultView';

interface HistoryDetailState {
  setId?: string;
  page?: number;
}

// 이력 상세 — /history/detail에서 state로 전달된 제출 세트를 조회해 결과로 표시한다 (#148).
// 주소창에 세트 UUID가 노출되지 않으며, state가 없으면 /history로 replace한다.
export function HistoryDetailPage({ client }: { client: ApiClient }) {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as HistoryDetailState | null) ?? null;
  const setId = state?.setId ?? null;
  const page = state?.page;
  const backUrl = typeof page === 'number' && page > 1 ? `/history?page=${page}` : '/history';

  const query = useStudySet(client, setId);
  const data = query.data ?? null;
  const correctionsQuery = useStudyCorrections(client, data && isSubmittedSet(data) ? data.id : null);

  if (!setId) {
    return <Navigate to="/history" replace />;
  }

  if (query.isPending) {
    return (
      <p className="moi-note" role="status" aria-live="polite">
        {copy.common.loading}
      </p>
    );
  }

  if (query.isError) {
    return (
      <div className="moi-page">
        <div className="moi-alert moi-alert-error" role="alert">
          <p className="moi-alert-text">{copy.session.loadError}</p>
          <button type="button" className="moi-alert-retry" onClick={() => void query.refetch()}>
            {copy.session.retry}
          </button>
        </div>
        <button type="button" className="moi-study-link" onClick={() => navigate(backUrl)}>
          {copy.study.historyBack}
        </button>
      </div>
    );
  }

  if (!data || !isSubmittedSet(data)) {
    return (
      <div className="moi-page">
        <p className="moi-note">{copy.study.notFoundSet}</p>
        <button type="button" className="moi-study-link" onClick={() => navigate(backUrl)}>
          {copy.study.historyBack}
        </button>
      </div>
    );
  }

  return (
    <div className="moi-page">
      <button type="button" className="moi-study-ghost" onClick={() => navigate(backUrl)}>
        {copy.study.historyBack}
      </button>
      <ResultView
        client={client}
        set={data}
        onRestart={() => navigate('/study/new')}
        onHistory={() => navigate(backUrl)}
        corrections={correctionsQuery.data}
      />
    </div>
  );
}
