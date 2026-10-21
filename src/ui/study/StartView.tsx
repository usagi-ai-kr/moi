import { copy } from '../copy';
import { iconHistory, iconResume, iconStart } from '../icons';
import { STUDY_DOMAINS } from './types';
import type { StudyScope } from './types';

// #233 Slice B — 액션 아이콘은 icons.ts spec(ADR-0073). 라벨 유지, 장식 aria-hidden.
const StartIcon = iconStart.icon;
const ResumeIcon = iconResume.icon;
const HistoryIcon = iconHistory.icon;

interface Props {
  scope: StudyScope;
  domainId: string;
  size?: number;
  pending: boolean;
  conflict: boolean;
  unauthorized: boolean;
  startError: string | null;
  onScope: (s: StudyScope) => void;
  onDomain: (id: string) => void;
  onSize?: (n: number) => void;
  onStart: () => void;
  onResume: () => void;
  onHistory?: () => void;
}

// 범위(전체/영역/취약) 선택 — AntD 없이 네이티브 라디오 + 토큰 CSS.
// #269: 시험 안내(copy.exam.note) 제거 — 시험 선택은 셸 상단 selector 단일화(#259).
// 설명(문제 수·안내)과 fieldset/legend(범위 라벨)·선택 항목의 위계를 분리한다.
export function StartView(p: Props) {
  return (
    <section className="moi-study" aria-label={copy.study.startTitle}>
      <h1 className="moi-study-title">{copy.study.startTitle}</h1>
      <p className="moi-note moi-study-desc" id="study-scope-desc">
        {copy.study.examContext}
      </p>
      <fieldset className="moi-study-field" aria-describedby="study-scope-desc" disabled={p.pending}>
        <legend className="moi-study-legend">범위</legend>
        <label className="moi-study-radio">
          <input
            type="radio"
            name="study-scope"
            value="all"
            checked={p.scope === 'all'}
            onChange={() => p.onScope('all')}
            disabled={p.pending}
          />
          {copy.study.scopeAll}
        </label>
        <label className="moi-study-radio">
          <input
            type="radio"
            name="study-scope"
            value="domain"
            checked={p.scope === 'domain'}
            onChange={() => p.onScope('domain')}
            disabled={p.pending}
          />
          {copy.study.scopeDomain}
        </label>
        <label className="moi-study-radio">
          <input
            type="radio"
            name="study-scope"
            value="weak"
            checked={p.scope === 'weak'}
            onChange={() => p.onScope('weak')}
            disabled={p.pending}
          />
          {copy.study.scopeWeak}
        </label>
      </fieldset>
      <fieldset className="moi-study-field" aria-label={copy.study.sizeLegend} disabled={p.pending}>
        <legend className="moi-study-legend">{copy.study.sizeLegend}</legend>
        {[4, 8].map((n) => (
          <label key={n} className="moi-study-radio">
            <input
              type="radio"
              name="study-size"
              value={n}
              checked={(p.size ?? 4) === n}
              onChange={() => p.onSize?.(n)}
              disabled={p.pending}
            />
            {copy.study.sizeOption(n)}
          </label>
        ))}
      </fieldset>
      {p.scope === 'domain' && (
        <label className="moi-study-label">
          {copy.study.domainLabel}
          <select
            className="moi-study-select"
            value={p.domainId}
            onChange={(e) => p.onDomain(e.target.value)}
            aria-label={copy.study.domainLabel}
            disabled={p.pending}
          >
            {STUDY_DOMAINS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {p.conflict && (
        <div className="moi-alert moi-alert-warning" role="alert">
          <p className="moi-alert-text">{copy.study.activeExists}</p>
          <button type="button" className="moi-alert-retry" onClick={p.onResume} disabled={p.pending} aria-busy={p.pending}>
            <ResumeIcon size={iconResume.size} aria-hidden="true" focusable="false" />
            {copy.study.continueStudy}
          </button>
        </div>
      )}
      {p.unauthorized && (
        <div className="moi-alert moi-alert-error" role="alert">
          <p className="moi-alert-text">{copy.study.needLogin}</p>
        </div>
      )}
      {p.startError && (
        <div className="moi-alert moi-alert-error" role="alert">
          <p className="moi-alert-text">{p.startError}</p>
        </div>
      )}
      <div className="moi-study-actions moi-study-start">
        <button
          type="button"
          className="moi-study-primary"
          disabled={p.pending}
          aria-busy={p.pending}
          onClick={p.onStart}
        >
          <StartIcon size={iconStart.size} aria-hidden="true" focusable="false" />
          {p.pending ? copy.study.starting : copy.study.startAction}
        </button>
        {p.onHistory && (
          <button type="button" className="moi-study-link" onClick={p.onHistory} disabled={p.pending} aria-busy={p.pending}>
            <HistoryIcon size={iconHistory.size} aria-hidden="true" focusable="false" />
            {copy.study.historyLink}
          </button>
        )}
      </div>
    </section>
  );
}
