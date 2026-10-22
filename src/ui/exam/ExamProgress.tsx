import type { ApiClient } from '../api/client';
import { copy } from '../copy';
import { useExamScope } from './ExamScopeProvider';
import { toExamProgressPercent, useExamProgress } from './progress-query';

export function ExamProgress({ client, userId }: { client: ApiClient; userId: string }) {
  const { examId, label } = useExamScope();
  const query = useExamProgress(client, examId, userId);
  const percent = query.isError ? null : toExamProgressPercent(query.data, examId);

  if (query.isPending) {
    return (
      <span
        className="moi-exam-progress moi-exam-progress--loading"
        role="status"
        aria-label={copy.exam.progress.loading(label)}
      >
        <span className="moi-exam-progress-skeleton" aria-hidden="true" />
      </span>
    );
  }

  if (percent === null) {
    return (
      <span
        className="moi-exam-progress moi-exam-progress--unavailable"
        role="status"
        aria-label={copy.exam.progress.unavailable(label)}
        title={copy.exam.progress.unavailable(label)}
      >
        —
      </span>
    );
  }

  return (
    <span
      className="moi-exam-progress"
      role="progressbar"
      aria-label={copy.exam.progress.ariaLabel(label, percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={copy.exam.progress.value(percent)}
    >
      <svg className="moi-exam-progress-ring" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle className="moi-exam-progress-track" cx="12" cy="12" r="9" pathLength="100" />
        <circle
          className="moi-exam-progress-arc"
          cx="12"
          cy="12"
          r="9"
          pathLength="100"
          strokeDasharray="100 100"
          strokeDashoffset={100 - percent}
        />
      </svg>
      <span className="moi-exam-progress-value">{copy.exam.progress.value(percent)}</span>
    </span>
  );
}
