import type { RefObject } from 'react';
import { copy } from '../copy';
import type { ApiClient, ItemResponse, StudyActiveItem } from '../api/client';
import { Button } from '../components/ui/button';
import { BookmarkButton } from '../review/BookmarkButton';
import { ReportButton } from './ReportButton';
import { STUDY_EXAM_ID, type SaveState } from './types';

interface Props {
  client: ApiClient;
  examId?: string;
  items: StudyActiveItem[];
  index: number;
  save: SaveState;
  submitting: boolean;
  unansweredCount: number;
  submitError: string | null;
  onIndex: (i: number) => void;
  onAnswer: (questionId: string, response: ItemResponse, previous: ItemResponse) => void;
  onPass: (questionId: string, previous: ItemResponse) => void;
  onClear: (questionId: string, previous: ItemResponse) => void;
  onRetry: (questionId: string) => void;
  onSubmitRequest: () => void;
  onAbandonRequest: () => void;
  abandonTriggerRef?: RefObject<HTMLButtonElement | null>;
}

function isChecked(item: StudyActiveItem, optionId: string): boolean {
  return item.response.kind === 'answered' && item.response.optionIds.includes(optionId);
}

// 저장 상태 문구 — 실제 상태(서버 확인·오프라인·충돌)를 그대로 표시한다 (이슈 #52).
const SAVE_TEXT: Record<SaveState, string> = {
  idle: '',
  saving: copy.study.saving,
  saved: copy.study.saved,
  error: copy.study.saveError,
  offline: copy.study.offlineSaving,
  conflict: copy.study.conflictNeeded,
};

function toggleOption(item: StudyActiveItem, optionId: string): ItemResponse {
  const current = item.response.kind === 'answered' ? item.response.optionIds : [];
  const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
  return next.length === 0 ? { kind: 'unanswered' } : { kind: 'answered', optionIds: next };
}

function optionText(item: StudyActiveItem, optionId: string): string {
  return item.options.find((o) => o.optionId === optionId)?.text ?? optionId;
}

function responseLabel(r: ItemResponse): string {
  if (r.kind === 'answered') return `선택 ${r.optionIds.length}`;
  if (r.kind === 'pass') return 'Pass';
  return '미응답';
}

// 문제 화면 — 시작 시점 스냅샷 본문·보기 텍스트 렌더, 이전/다음, 자동 저장 상태.
// 마지막 문항은 하단 탐색을 [이전][제출하기]로 바꿔 비활성 다음을 남기지 않는다(#232).
// 제출 CTA는 상태당 하나가 원칙이므로 마지막에서는 상단 제출을 숨기고 하단으로 옮긴다.
export function QuestionView(p: Props) {
  const item = p.items[p.index];
  if (!item) return null;
  const total = p.items.length;
  const saveText = SAVE_TEXT[p.save];
  const isLast = p.index >= total - 1;
  const submitLabel = `${copy.study.submit}${p.unansweredCount > 0 ? ` (${p.unansweredCount} 미응답)` : ''}`;
  return (
    <section className="moi-study" aria-label={`${copy.study.questionLabel} ${p.index + 1}/${total}`}>
      <p className="moi-study-progress" aria-live="polite">
        {p.index + 1}/{total} · {responseLabel(item.response)}
      </p>
      <div className="moi-study-progressbar" aria-hidden="true">
        <span style={{ width: `${Math.round(((p.index + 1) / total) * 100)}%` }} />
      </div>
      {/* 상단 액션 — 제출·포기 (#186): 스크롤 없이 바로 닿도록 진행 표시 직후에 둔다. */}
      {/* 마지막 문항에서는 상단 제출을 숨기고 하단 탐색으로 옮긴다 — 제출 CTA 상태당 하나(#232). */}
      <div className="moi-study-question-top">
        {!isLast && (
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={p.submitting}
            pending={p.submitting}
            onClick={p.onSubmitRequest}
          >
            {submitLabel}
          </Button>
        )}
        <Button asChild variant="outline" size="sm" className="text-destructive">
          <button type="button" ref={p.abandonTriggerRef} onClick={p.onAbandonRequest}>
            {copy.study.abandon}
          </button>
        </Button>
      </div>
      {/* 제출 실패 알림 — 상단 액션 바로 아래에서 보인다 (#186). */}
      {p.submitError && (
        <div className="moi-alert moi-alert-error" role="alert">
          <p className="moi-alert-text">{p.submitError}</p>
        </div>
      )}
      <h1 className="moi-study-title">{item.stem}</h1>
      <p className="moi-note" aria-live="polite">
        {copy.study.answerCountHint(item.answerCount)}
      </p>
      {/* 문항 액션 그룹 — 정보(제목·보기)와 분리된 독립 그룹, 탐색·최종 액션과도 분리(#232). */}
      <div className="moi-study-item-actions" role="group" aria-label={copy.study.itemActions}>
        <BookmarkButton client={p.client} examId={p.examId ?? STUDY_EXAM_ID} questionId={item.questionId} />
        <ReportButton client={p.client} questionId={item.questionId} questionVersionId={item.questionVersionId} />
      </div>
      <fieldset className="moi-study-field">
        <legend className="moi-study-legend">보기 선택</legend>
        {item.optionOrder.map((optionId, k) => (
          <label key={optionId} className="moi-study-check">
            <input
              type="checkbox"
              checked={isChecked(item, optionId)}
              onChange={() => p.onAnswer(item.questionId, toggleOption(item, optionId), item.response)}
              aria-label={`보기 ${k + 1} ${optionText(item, optionId)}`}
            />
            <span>
              {k + 1}. {optionText(item, optionId)}
            </span>
          </label>
        ))}
      </fieldset>
      {/* 버튼 위계 — DESIGN.md 5절: Pass=secondary, 미응답으로 지우기=ghost (shadcn Button 공통 규격). */}
      <div className="moi-study-actions">
        <Button type="button" variant="secondary" onClick={() => p.onPass(item.questionId, item.response)}>
          {copy.study.pass}
        </Button>
        <Button type="button" variant="ghost" className="bg-transparent" onClick={() => p.onClear(item.questionId, item.response)}>
          {copy.study.clear}
        </Button>
      </div>
      {saveText && (
        <p className="moi-note" role="status" aria-live="polite">
          {saveText}
          {(p.save === 'error' || p.save === 'offline') && (
            <button type="button" className="moi-alert-retry" onClick={() => p.onRetry(item.questionId)}>
              {copy.study.retry}
            </button>
          )}
        </p>
      )}
      {/* [이전][다음]은 같은 크기·같은 variant의 secondary. 마지막은 [이전][제출하기](#232). */}
      <div className="moi-study-nav">
        <Button type="button" variant="secondary" disabled={p.index === 0} onClick={() => p.onIndex(p.index - 1)}>
          {copy.study.prev}
        </Button>
        {isLast ? (
          <Button
            type="button"
            variant="primary"
            disabled={p.submitting}
            pending={p.submitting}
            onClick={p.onSubmitRequest}
          >
            {submitLabel}
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={p.index >= total - 1}
            onClick={() => p.onIndex(p.index + 1)}
          >
            {copy.study.next}
          </Button>
        )}
      </div>
    </section>
  );
}
