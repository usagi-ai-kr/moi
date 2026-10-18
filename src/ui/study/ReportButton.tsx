import { useState } from 'react';
import { submitQuestionReport, type ApiClient, type ReportReason } from '../api/client';
import { copy } from '../copy';

const REASONS: ReadonlyArray<{ value: ReportReason; label: string }> = [
  { value: 'answer', label: copy.report.reasonAnswer },
  { value: 'explanation', label: copy.report.reasonExplanation },
  { value: 'ambiguous', label: copy.report.reasonAmbiguous },
  { value: 'typo', label: copy.report.reasonTypo },
];

interface Props {
  client: ApiClient;
  questionId: string;
  questionVersionId: string;
}

type Phase = 'idle' | 'pending' | 'success' | 'error';

// 신고 버튼 + 사유 선택 dialog — 네이티브 요소만 사용(AntD 없음). 44px 터치 타깃·focus-visible (#53).
export function ReportButton({ client, questionId, questionVersionId }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('answer');
  const [phase, setPhase] = useState<Phase>('idle');

  async function submit() {
    setPhase('pending');
    try {
      await submitQuestionReport(client, { questionId, questionVersionId, reason });
      setPhase('success');
    } catch {
      setPhase('error');
    }
  }

  function close() {
    setOpen(false);
    setPhase('idle');
  }

  return (
    <span className="moi-report">
      <button
        type="button"
        className="moi-report-open"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {copy.report.open}
      </button>
      {open && (
        <span className="moi-report-dialog" role="dialog" aria-label={copy.report.title}>
          <span className="moi-report-hint">{copy.report.hint}</span>
          {REASONS.map((r) => (
            <label key={r.value} className="moi-study-radio">
              <input
                type="radio"
                name={`moi-report-${questionId}`}
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                aria-label={r.label}
              />
              <span>{r.label}</span>
            </label>
          ))}
          <span className="moi-report-actions">
            <button
              type="button"
              className="moi-study-secondary"
              disabled={phase === 'pending'}
              aria-busy={phase === 'pending'}
              onClick={() => void submit()}
            >
              {phase === 'pending' ? copy.report.pending : copy.report.submit}
            </button>
            <button type="button" className="moi-study-ghost" onClick={close}>
              {phase === 'success' ? copy.report.close : copy.report.cancel}
            </button>
          </span>
          <span role="status" aria-live="polite" className="moi-report-status">
            {phase === 'success' && copy.report.success}
            {phase === 'error' && copy.report.error}
          </span>
        </span>
      )}
    </span>
  );
}
