import type { DomainStats } from '../api/client';
import { domainLabel, pct, statusLabel } from './labels';
import './stats.css';

// 영역별 현황 — 도메인명·상태 배지·진도/누적/최근 3열 지표 카드 (#182).
export function DomainStatusList({ domains }: { domains: readonly DomainStats[] }) {
  return (
    <ul className="moi-domain-list">
      {domains.map((d) => (
        <li key={d.domainId} className="moi-domain-item" data-status={d.status}>
          <div className="moi-domain-head">
            <span className="moi-domain-name">{domainLabel(d.domainId)}</span>
            <span className="moi-domain-badge">{statusLabel(d.status)}</span>
          </div>
          <dl className="moi-domain-metrics">
            <div>
              <dt>진도</dt>
              <dd>{d.uniqueFirstSolved}문제</dd>
            </div>
            <div>
              <dt>누적</dt>
              <dd>{pct(d.cumulativeAccuracy)}</dd>
            </div>
            <div>
              <dt>최근</dt>
              <dd>{pct(d.recentAccuracy)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
