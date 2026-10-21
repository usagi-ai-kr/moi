import type { ApiClient } from '../api/client';
import { copy } from '../copy';
import { StatsSkeleton } from '../Skeletons';
import { STUDY_EXAM_ID } from '../study/types';
import { pct } from './labels';
import { useStudyStats } from './useStudyStats';
import './stats.css';

// 요약 패널 — 진도·커버리지·정답률 + 모집단 설명 (#224).
// 마운트된 탭에서만 조회한다 (완료 탭에서는 마운트되지 않아 API 미발생).
export function StatsSummaryPanel({
  client,
  examId = STUDY_EXAM_ID,
}: {
  client: ApiClient;
  examId?: string;
}) {
  const query = useStudyStats(client, examId, true);

  return (
    <section
      className="moi-stats"
      aria-label={copy.history.tabSummary}
      aria-busy={query.isPending ? 'true' : undefined}
    >
      <h2 className="moi-stats-title">{copy.history.tabSummary}</h2>
      {query.isPending && (
        <div className="moi-stats-pending" role="status" aria-busy="true">
          <span className="moi-sr-only">{copy.stats.loading}</span>
          <StatsSkeleton />
        </div>
      )}
      {query.isError && (
        <div role="alert" className="moi-stats-error">
          <p className="moi-note">{copy.stats.error}</p>
          <button type="button" className="moi-study-link" onClick={() => void query.refetch()}>
            {copy.stats.retry}
          </button>
        </div>
      )}
      {query.data && query.data.uniqueFirstSolved === 0 && <p className="moi-note">{copy.stats.empty}</p>}
      {query.data && query.data.uniqueFirstSolved > 0 && (
        <div className="moi-stats-summary">
          <p className="moi-stats-progress">
            {copy.stats.progress} {query.data.uniqueFirstSolved}/{query.data.totalQuestions} ·{' '}
            {Math.round(query.data.coverage * 100)}% · {copy.stats.accuracy} {pct(query.data.overallAccuracy)}
          </p>
          <div className="moi-stats-coverage" aria-hidden="true">
            <span style={{ width: `${Math.round(query.data.coverage * 100)}%` }} />
          </div>
          <p className="moi-note">{copy.history.accuracyNote}</p>
        </div>
      )}
    </section>
  );
}
