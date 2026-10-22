import type { ApiClient, DomainStats } from '../api/client';
import { copy } from '../copy';
import { iconAnalysis, iconRefresh } from '../icons';
import { StatsSkeleton } from '../Skeletons';
import { STUDY_DOMAINS } from '../study/types';
import { domainLabel, pct, statusLabel } from './labels';
import { useStudyStats } from './useStudyStats';
import './stats.css';

// 영역·취약 패널 — STUDY_DOMAINS 4개 고정 카드 (#224, o 결정 2).
// 값은 응답에 있는 것만 쓰고, 없는 영역은 데이터 부족·학습 이력 없음·— (0%·0문제 발명 금지).
// 카드 수는 UI 표시 모델에서 고정한다. 진척도 분모는 stats API의 문제 풀 집계를 재사용한다.
// 결과 갱신은 짧은 상태 문구 live region 으로 알린다 (카드 전체를 읽어주지 않는다).

// 영역 카드 지표 3칸 — 라벨은 copy.stats.metrics 단일 소스 (ADR-0012).
function DomainMetrics({
  solved,
  cumulative,
  recent,
}: {
  solved: number | null;
  cumulative: string;
  recent: string;
}) {
  return (
    <dl className="moi-domain-metrics">
      <div>
        <dt>{copy.stats.metrics.progress}</dt>
        <dd>{solved === null ? '—' : `${solved}${copy.stats.metrics.problemUnit}`}</dd>
      </div>
      <div>
        <dt>{copy.stats.metrics.cumulative}</dt>
        <dd>{cumulative}</dd>
      </div>
      <div>
        <dt>{copy.stats.metrics.recent}</dt>
        <dd>{recent}</dd>
      </div>
    </dl>
  );
}

export function StatsDomainsPanel({ client, examId, userId }: { client: ApiClient; examId: string; userId: string }) {
  const query = useStudyStats(client, examId, userId, true);
  const data = query.data ?? null;

  // legacy alias 병합 + canonical 매칭 (labels.domainLabel 규칙과 동일).
  const byId = new Map<string, DomainStats>();
  if (data) {
    for (const d of data.domains) {
      const canonical = d.domainId === 'dom-cost' ? 'dom-cost-optimization' : d.domainId;
      if (!byId.has(canonical)) byId.set(canonical, d);
    }
  }
  // 미지 id는 4카드 뒤에 별도 카드로 표시한다 (데이터 삭제 금지).
  const extras = data ? data.domains.filter((d) => {
    const canonical = d.domainId === 'dom-cost' ? 'dom-cost-optimization' : d.domainId;
    return !STUDY_DOMAINS.some((s) => s.id === canonical) && byId.get(canonical) === d;
  }) : [];

  return (
    <section
      className="moi-stats"
      aria-label={copy.history.tabDomains}
      aria-busy={query.isPending ? 'true' : undefined}
    >
      <h2 className="moi-stats-title inline-flex items-center gap-2">
        <iconAnalysis.icon aria-hidden="true" size={iconAnalysis.size} />
        {copy.history.tabDomains}
      </h2>
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
            <iconRefresh.icon aria-hidden="true" size={iconRefresh.size} className="mr-1" />
            {copy.stats.retry}
          </button>
        </div>
      )}
      {/* 결과 전용 live region — 로딩 role="status" 와 분리해 이중 announce 를 막는다. */}
      <p className="moi-sr-only" aria-live="polite" aria-atomic="true">
        {data
          ? copy.stats.domainsStatus(STUDY_DOMAINS.length + extras.length, data.weakDomains.length)
          : ''}
      </p>
      {data && (
        <>
          {data.uniqueFirstSolved === 0 && <p className="moi-note">{copy.stats.empty}</p>}
          <h3 className="moi-stats-sub">{copy.stats.domainsTitle}</h3>
          <ul className="moi-domain-list">
            {STUDY_DOMAINS.map((s) => {
              const stats = byId.get(s.id) ?? null;
              if (stats) {
                return (
                  <li key={s.id} className="moi-domain-item" data-status={stats.status}>
                    <div className="moi-domain-head">
                      <span className="moi-domain-name">{domainLabel(s.id)}</span>
                      <span className="moi-domain-badge">{statusLabel(stats.status)}</span>
                    </div>
                    <DomainMetrics
                      solved={stats.uniqueFirstSolved}
                      cumulative={pct(stats.cumulativeAccuracy)}
                      recent={pct(stats.recentAccuracy)}
                    />
                  </li>
                );
              }
              return (
                <li key={s.id} className="moi-domain-item" data-status="insufficient-data">
                  <div className="moi-domain-head">
                    <span className="moi-domain-name">{domainLabel(s.id)}</span>
                    <span className="moi-domain-badge">{statusLabel('insufficient-data')}</span>
                  </div>
                  <p className="moi-note">{copy.history.noDomainHistory}</p>
                  <DomainMetrics solved={null} cumulative="—" recent="—" />
                </li>
              );
            })}
            {extras.map((d) => (
              <li key={d.domainId} className="moi-domain-item" data-status={d.status}>
                <div className="moi-domain-head">
                  <span className="moi-domain-name">{domainLabel(d.domainId)}</span>
                  <span className="moi-domain-badge">{statusLabel(d.status)}</span>
                </div>
                <DomainMetrics
                  solved={d.uniqueFirstSolved}
                  cumulative={pct(d.cumulativeAccuracy)}
                  recent={pct(d.recentAccuracy)}
                />
              </li>
            ))}
          </ul>
          <h3 className="moi-stats-sub">{copy.stats.weakTitle}</h3>
          {data.weakDomains.length === 0 ? (
            <p className="moi-note">{copy.stats.weakEmpty}</p>
          ) : (
            <ol className="moi-weak-list">
              {data.weakDomains.map((w, idx) => (
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
