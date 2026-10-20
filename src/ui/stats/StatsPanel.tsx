import { useQuery } from '@tanstack/react-query';
import { getStudyStats, type ApiClient } from '../api/client';
import { copy } from '../copy';
import { DomainStatusList } from './DomainStatusList';
import { domainLabel, pct } from './labels';
import './stats.css';

export const STUDY_STATS_KEY = ['study', 'stats'] as const;

// 학습 현황 패널 — 패널이 열릴 때만 조회한다 (#54).
export function StatsPanel({ client, examId }: { client: ApiClient; examId: string }) {
  const query = useQuery({
    queryKey: [...STUDY_STATS_KEY, examId],
    queryFn: () => getStudyStats(client, examId),
    enabled: true,
    retry: false,
    staleTime: 30_000,
  });

  return (
    <section className="moi-stats" aria-label={copy.stats.title} aria-live="polite">
      <h2 className="moi-stats-title">{copy.stats.title}</h2>
      {query.isPending && (
        <p className="moi-note" role="status">
          {copy.stats.loading}
        </p>
      )}
      {query.isError && (
        <div role="alert" className="moi-stats-error">
          <p className="moi-note">{copy.stats.error}</p>
          <button type="button" className="moi-study-link" onClick={() => void query.refetch()}>
            {copy.stats.retry}
          </button>
        </div>
      )}
      {query.data && query.data.uniqueFirstSolved === 0 && (
        <p className="moi-note">{copy.stats.empty}</p>
      )}
      {query.data && query.data.uniqueFirstSolved > 0 && (
        <>
          <div className="moi-stats-summary">
            <p className="moi-stats-progress">
              {copy.stats.progress} {query.data.uniqueFirstSolved}/{query.data.totalQuestions} ·{' '}
              {Math.round(query.data.coverage * 100)}% · {copy.stats.accuracy} {pct(query.data.overallAccuracy)}
            </p>
            <div className="moi-stats-coverage" aria-hidden="true">
              <span style={{ width: `${Math.round(query.data.coverage * 100)}%` }} />
            </div>
          </div>
          <h3 className="moi-stats-sub">{copy.stats.domainsTitle}</h3>
          <DomainStatusList domains={query.data.domains} />
          <h3 className="moi-stats-sub">{copy.stats.weakTitle}</h3>
          {query.data.weakDomains.length === 0 ? (
            <p className="moi-note">{copy.stats.weakEmpty}</p>
          ) : (
            <ol className="moi-weak-list">
              {query.data.weakDomains.map((w, idx) => (
                <li key={w.domainId} className="moi-weak-item">
                  <span className="moi-weak-rank" aria-hidden="true">
                    {idx + 1}
                  </span>
                  <span className="moi-weak-name">{domainLabel(w.domainId)}</span>
                  <span className="moi-weak-score">{Math.round(w.score * 100)}%</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
