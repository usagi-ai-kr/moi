import { copy } from '../copy';
import { STUDY_SET_SIZE } from '@/domain/study/thresholds';
import { STUDY_DOMAINS, STUDY_EXAM_LABEL } from './types';
import type { StudyScope } from './types';

interface Props {
  scope: StudyScope;
  domainId: string;
  pending: boolean;
  conflict: boolean;
  unauthorized: boolean;
  startError: string | null;
  onScope: (s: StudyScope) => void;
  onDomain: (id: string) => void;
  onStart: () => void;
  onResume: () => void;
  onHistory?: () => void;
}

// 범위(전체/영역/취약) 선택 — AntD 없이 네이티브 라디오 + 토큰 CSS.
export function StartView(p: Props) {
  return (
    <section className="moi-study" aria-label={copy.study.startTitle}>
      <h2 className="moi-study-title">{copy.study.startTitle}</h2>
      <p className="moi-note">
        {STUDY_EXAM_LABEL} · {STUDY_SET_SIZE}문제
      </p>
      <fieldset className="moi-study-field">
        <legend className="moi-study-legend">범위</legend>
        <label className="moi-study-radio">
          <input
            type="radio"
            name="study-scope"
            value="all"
            checked={p.scope === 'all'}
            onChange={() => p.onScope('all')}
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
          />
          {copy.study.scopeWeak}
        </label>
      </fieldset>
      {p.scope === 'domain' && (
        <label className="moi-study-label">
          {copy.study.domainLabel}
          <select
            className="moi-study-select"
            value={p.domainId}
            onChange={(e) => p.onDomain(e.target.value)}
            aria-label={copy.study.domainLabel}
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
          <button type="button" className="moi-alert-retry" onClick={p.onResume}>
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
          {p.pending ? copy.study.starting : copy.study.startAction}
        </button>
        {p.onHistory && (
          <button type="button" className="moi-study-link" onClick={p.onHistory}>
            {copy.study.historyLink}
          </button>
        )}
      </div>
    </section>
  );
}
