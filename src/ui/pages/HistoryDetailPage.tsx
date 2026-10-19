import { useNavigate, useParams } from 'react-router';
import { copy } from '../copy';
import { isSubmittedSet, type ApiClient } from '../api/client';
import { useStudyCorrections, useStudySet } from '../study/queries';
import { ResultView } from '../study/ResultView';

// 이력 상세 — /history/:setId에서 제출 세트를 조회해 결과로 표시한다 (#148).
export function HistoryDetailPage({ client }: { client: ApiClient }) {
  const params = useParams();
  const navigate = useNavigate();
  const setId = (params as { setId?: string }).setId ?? null;
  const query = useStudySet(client, setId);
  const data = query.data ?? null;
  const correctionsQuery = useStudyCorrections(client, data && isSubmittedSet(data) ? data.id : null);

  if (!setId) {
    return (
      <div className="moi-page">
        <p className="moi-note">{copy.study.notFoundSet}</p>
        <button type="button" className="moi-study-link" onClick={() => navigate('/history')}>
          {copy.study.historyBack}
        </button>
      </div>
    );
  }
  if (query.isPending) {
    return (
      <p className="moi-note" role="status" aria-live="polite">
        {copy.session.checking}
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
        <button type="button" className="moi-study-link" onClick={() => navigate('/history')}>
          {copy.study.historyBack}
        </button>
      </div>
    );
  }
  if (!data || !isSubmittedSet(data)) {
    return (
      <div className="moi-page">
        <p className="moi-note">{copy.study.notFoundSet}</p>
        <button type="button" className="moi-study-link" onClick={() => navigate('/history')}>
          {copy.study.historyBack}
        </button>
      </div>
    );
  }
  return (
    <div className="moi-page">
      <button type="button" className="moi-study-ghost" onClick={() => navigate('/history')}>
        {copy.study.historyBack}
      </button>
      <ResultView
        client={client}
        set={data}
        onRestart={() => navigate('/study/new')}
        onHistory={() => navigate('/history')}
        corrections={correctionsQuery.data}
      />
    </div>
  );
}
