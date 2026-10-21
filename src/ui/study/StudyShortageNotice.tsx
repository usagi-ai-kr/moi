import { copy } from '../copy';

// #275 F1 — 요청 문제 수보다 실제 세트가 짧을 때의 안내.
// QuestionView 예산(ADR-0015)을 지키기 위해 표시 블록만 분리했다.
export function StudyShortageNotice({ count }: { readonly count: number }) {
  return (
    <div className="moi-alert moi-alert-info" role="status">
      <p className="moi-alert-text">{copy.study.sizeAvailableNotice(count)}</p>
    </div>
  );
}
