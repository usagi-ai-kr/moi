import { copy } from '../copy';
import type { ItemResponse, StudyActiveItem } from '../api/client';
import type { ConflictItem } from './draft-sync';

interface Props {
  conflicts: ConflictItem[];
  items: StudyActiveItem[];
  pending: boolean;
  onUseServer: (questionId: string) => void;
  onUseMine: (questionId: string) => void;
}

function answerText(r: ItemResponse, item: StudyActiveItem | undefined): string {
  if (r.kind === 'pass') return copy.study.pass;
  if (r.kind === 'unanswered') return copy.study.unansweredLabel;
  const texts = r.optionIds.map((id) => {
    const opt = item?.options.find((o) => o.optionId === id);
    if (opt?.text) return opt.text;
    const index = item?.optionOrder.indexOf(id) ?? -1;
    return index >= 0 ? String(index + 1) : '?';
  });
  return texts.length > 0 ? texts.join(', ') : copy.study.unansweredLabel;
}

// 서버/로컬 답안 충돌 — 문제별로 사용자가 답안을 고른다. 자동 덮어쓰기 금지 (이슈 #52).
export function ConflictPanel({ conflicts, items, pending, onUseServer, onUseMine }: Props) {
  if (conflicts.length === 0) return null;
  return (
    <section className="moi-conflict" role="alert" aria-label={copy.study.conflictTitle}>
      <h3 className="moi-conflict-title">{copy.study.conflictTitle}</h3>
      <p className="moi-note">{copy.study.conflictHint}</p>
      <ul className="moi-conflict-list">
        {conflicts.map((c) => {
          const index = items.findIndex((i) => i.questionId === c.questionId);
          const item = index >= 0 ? items[index] : undefined;
          return (
            <li key={c.questionId} className="moi-conflict-item">
              <p className="moi-conflict-q">
                {index >= 0 ? `${copy.study.questionLabel} ${index + 1}` : copy.study.questionLabel}
              </p>
              <p className="moi-note">
                {copy.study.conflictServer}: {answerText(c.server, item)}
              </p>
              <p className="moi-note">
                {copy.study.conflictMine}: {answerText(c.local, item)}
              </p>
              <div className="moi-study-actions">
                <button type="button" className="moi-study-secondary" disabled={pending} onClick={() => onUseServer(c.questionId)}>
                  {copy.study.useServer}
                </button>
                <button type="button" className="moi-study-primary" disabled={pending} onClick={() => onUseMine(c.questionId)}>
                  {copy.study.useMine}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
