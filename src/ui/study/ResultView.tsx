import { copy } from '../copy';
import type { StudySubmittedSet } from '../api/client';
import { scopeLabel } from './types';

interface Props {
  set: StudySubmittedSet;
  onRestart: () => void;
  onHistory: () => void;
}

// 결과 — 요약·문항별 선택/정답 + 스냅샷 해설·근거 링크(제출 후 노출).
export function ResultView({ set, onRestart, onHistory }: Props) {
  const r = set.result;
  const total = set.items.length;
  const contentOf = (questionId: string) => set.items.find((i) => i.questionId === questionId);
  return (
    <section className="moi-study" aria-label={copy.study.resultTitle}>
      <h2 className="moi-study-title">{copy.study.resultTitle}</h2>
      <p className="moi-note">
        {scopeLabel(set.mode)} · {set.examId} · 정답률 {r.accuracyPercent}%
      </p>
      <dl className="moi-study-result">
        <div>
          <dt>정답</dt>
          <dd>{r.correctCount}/{total}</dd>
        </div>
        <div>
          <dt>답변</dt>
          <dd>{r.answeredCount}</dd>
        </div>
        <div>
          <dt>Pass</dt>
          <dd>{r.passCount}</dd>
        </div>
        <div>
          <dt>미응답</dt>
          <dd>{r.unansweredCount}</dd>
        </div>
      </dl>
      <ol className="moi-study-peritem">
        {r.perItem.map((it) => {
          const content = contentOf(it.questionId);
          return (
            <li key={it.questionId} data-testid={`peritem-${it.questionId}`}>
              <span>{it.correct ? '정답' : '오답'} · </span>
              <span>{it.responseKind} · </span>
              <span>선택: {it.selectedOptionIds.length ? it.selectedOptionIds.join(', ') : '없음'} · </span>
              <span>정답: {it.correctOptionIds ? it.correctOptionIds.join(', ') : '비공개'}</span>
              {content && (
                <>
                  <p className="moi-note">{copy.study.explanation}: {content.explanation || '—'}</p>
                  {content.sourceUrls && content.sourceUrls.length > 0 && (
                    <p className="moi-note">
                      {copy.study.sources}:{' '}
                      {content.sourceUrls.map((u) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer">{u}</a>
                      ))}
                    </p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
      <div className="moi-study-actions">
        <button type="button" className="moi-study-primary" onClick={onRestart}>
          {copy.study.backToStart}
        </button>
        <button type="button" className="moi-study-secondary" onClick={onHistory}>
          {copy.study.historyLink}
        </button>
      </div>
    </section>
  );
}
