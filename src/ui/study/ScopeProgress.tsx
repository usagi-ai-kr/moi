import type { ApiClient } from '../api/client';
import { copy } from '../copy';
import { useStudyStats } from '../stats/useStudyStats';
import type { StudyScope } from './types';
import { getScopeProgress } from './scope-progress';
import './scope-progress.css';

export function ScopeProgressView({
  client,
  examId,
  userId,
  scope,
  domainId,
}: {
  client: ApiClient;
  examId: string;
  userId: string;
  scope: StudyScope;
  domainId: string;
}) {
  const query = useStudyStats(client, examId, userId, true);

  if (query.isPending) {
    return <p className="moi-scope-progress-status" role="status" aria-busy="true">{copy.study.progressLoading}</p>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="moi-scope-progress-error" role="alert">
        <p>{copy.study.progressError}</p>
        <button type="button" className="moi-study-link" onClick={() => void query.refetch()}>
          {copy.study.retry}
        </button>
      </div>
    );
  }

  const progress = getScopeProgress(query.data, scope, domainId);
  if (!progress) {
    return <p className="moi-scope-progress-status" role="status">{copy.study.progressUnavailable}</p>;
  }

  const label = progress.label === 'exam' ? copy.study.examProgressLabel : copy.study.learningProgressLabel;
  return (
    <div className="moi-scope-progress" aria-live="polite" aria-atomic="true">
      <p className="moi-scope-progress-label">
        {copy.study.progressValue(label, progress.completed, progress.total, progress.percent)}
      </p>
      <progress
        className="moi-scope-progress-bar"
        aria-label={copy.study.progressBarLabel}
        value={progress.percent}
        max={100}
      />
    </div>
  );
}
