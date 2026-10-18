import { useQuery } from '@tanstack/react-query';
import { getStudyStats, type ApiClient } from '../api/client';
import { copy } from '../copy';
import { STUDY_DOMAINS } from '../study/types';

export const STUDY_STATS_KEY = ['study', 'stats'] as const;

function pct(v: number | null): string {
  return v === null ? copy.stats.noAccuracy : `${Math.round(v * 100)}%`;
}

export function domainLabel(id: string): string {
  return STUDY_DOMAINS.find((d) => d.id === id)?.label ?? id;
}

export function statusLabel(s: 'ok' | 'insufficient-data'): string {
  return s === 'ok' ? '표본 충분' : '데이터 부족';
}

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
          <p className="moi-stats-progress">
            {copy.stats.progress} {query.data.uniqueFirstSolved}/{query.data.totalQuestions} ·{' '}
            {Math.round(query.data.coverage * 100)}% · {copy.stats.accuracy} {pct(query.data.overallAccuracy)}
          </p>
          <h3 className="moi-stats-sub">{copy.stats.domainsTitle}</h3>
          <ul className="moi-stats-list">
            {query.data.domains.map((d) => (
              <li key={d.domainId} className="moi-stats-item">
                <span>{domainLabel(d.domainId)}</span> <span>진도 {d.uniqueFirstSolved}</span>{' '}
                <span>누적 {pct(d.cumulativeAccuracy)}</span> <span>최근 {pct(d.recentAccuracy)}</span>{' '}
                <span>{statusLabel(d.status)}</span>
              </li>
            ))}
          </ul>
          <h3 className="moi-stats-sub">{copy.stats.weakTitle}</h3>
          {query.data.weakDomains.length === 0 ? (
            <p className="moi-note">{copy.stats.weakEmpty}</p>
          ) : (
            <ol className="moi-stats-list">
              {query.data.weakDomains.map((w) => (
                <li key={w.domainId} className="moi-stats-item">
                  {domainLabel(w.domainId)} · {Math.round(w.score * 100)}%
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
