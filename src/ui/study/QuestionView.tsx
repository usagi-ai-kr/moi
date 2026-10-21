import type { RefObject } from 'react';
import { copy } from '../copy';
import type { ApiClient, ItemResponse, StudyActiveItem } from '../api/client';
import { OptionRow } from '../components/option-row';
import { QuestionCard } from '../components/question-card';
import { Button } from '../components/ui/button';
import {
  iconAbandon,
  iconNext,
  iconPass,
  iconPrev,
  iconSubmit,
} from '../icons';
import { useExamScope } from '../exam/ExamScopeProvider';
import { BookmarkButton } from '../review/BookmarkButton';
import { ReportButton } from './ReportButton';
import './question-card.css';
import type { SaveState } from './types';

interface Props {
  client: ApiClient;
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

// #233 Slice B — 액션 아이콘은 icons.ts spec(ADR-0073). 라벨 유지, 장식 aria-hidden.
const SubmitIcon = iconSubmit.icon;
const PrevIcon = iconPrev.icon;
const NextIcon = iconNext.icon;
const PassIcon = iconPass.icon;
const AbandonIcon = iconAbandon.icon;

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
// 질문 카드·선택지 행은 복습과 공통(#274) — 모드별 로직(제출 시 채점)은 그대로 둔다.
export function QuestionView(p: Props) {
  const item = p.items[p.index];
  if (!item) return null;
  // 북마크 시험 축은 선택 시험(공개 코드) — 하드코딩 없음 (#239).
  const { examId } = useExamScope();
  const total = p.items.length;
  const saveText = SAVE_TEXT[p.save];
  const isLast = p.index >= total - 1;
  const submitLabel = `${copy.study.submit}${p.unansweredCount > 0 ? ` (${p.unansweredCount} 미응답)` : ''}`;
  return (
    <section className="moi-study" aria-label={`${copy.study.questionLabel} ${p.index + 1}/${total}`}>
      {/* 상단 헤더 — 복습과 같은 border-b·justify-between, 진행→제출→포기 순서 유지(#186). */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <p className="moi-study-progress font-semibold text-primary" aria-live="polite">
          {copy.study.questionLabel} {p.index + 1}/{total} · {responseLabel(item.response)}
        </p>
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
              <SubmitIcon
                size={iconSubmit.size}
                aria-hidden="true"
                focusable="false"
                className="moi-action-icon"
              />
              {submitLabel}
            </Button>
          )}
          <Button asChild variant="outline" size="sm" className="text-destructive">
            <button type="button" ref={p.abandonTriggerRef} onClick={p.onAbandonRequest} disabled={p.submitting} aria-busy={p.submitting}>
              <AbandonIcon
                size={iconAbandon.size}
                aria-hidden="true"
                focusable="false"
                className="moi-action-icon"
              />
              {copy.study.abandon}
            </button>
          </Button>
        </div>
      </div>
      <div className="moi-study-progressbar" aria-hidden="true">
        <span style={{ width: `${Math.round(((p.index + 1) / total) * 100)}%` }} />
      </div>
      {/* 제출 실패 알림 — 상단 액션 바로 아래에서 보인다 (#186). */}
      {p.submitError && (
        <div className="moi-alert moi-alert-error" role="alert">
          <p className="moi-alert-text">{p.submitError}</p>
        </div>
      )}
      <QuestionCard
        stem={item.stem}
        hint={copy.study.answerCountHint(item.answerCount)}
        titleAs="h1"
        titleClassName="moi-study-title"
      >
        <fieldset className="moi-study-field flex min-w-0 flex-col gap-2">
          <legend className="sr-only">보기 선택</legend>
          {item.optionOrder.map((optionId, k) => (
            <OptionRow
              key={optionId}
              checked={isChecked(item, optionId)}
              disabled={p.submitting}
              onChange={() => p.onAnswer(item.questionId, toggleOption(item, optionId), item.response)}
              ariaLabel={`보기 ${k + 1} ${optionText(item, optionId)}`}
              index={k}
              text={optionText(item, optionId)}
            />
          ))}
        </fieldset>
      </QuestionCard>
      {/* 문항 액션 그룹 — 정보(제목·보기)와 분리된 독립 그룹, 탐색·최종 액션과도 분리(#232). */}
      <div className="moi-study-item-actions" role="group" aria-label={copy.study.itemActions}>
        <BookmarkButton client={p.client} examId={examId} questionId={item.questionId} />
        <ReportButton client={p.client} questionId={item.questionId} questionVersionId={item.questionVersionId} />
      </div>
      {/* 버튼 위계 — DESIGN.md 5절: Pass=secondary, 미응답으로 지우기=ghost (shadcn Button 공통 규격). */}
      {/* 복습 하단 액션과 같은 justify-between·gap-3·pt-2 배치(#274). */}
      <div className="moi-study-actions flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button type="button" variant="secondary" disabled={p.submitting} aria-busy={p.submitting} onClick={() => p.onPass(item.questionId, item.response)}>
          <PassIcon
            size={iconPass.size}
            aria-hidden="true"
            focusable="false"
            className="moi-action-icon"
          />
          {copy.study.pass}
        </Button>
        <Button type="button" variant="ghost" className="bg-transparent" disabled={p.submitting} onClick={() => p.onClear(item.questionId, item.response)}>
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
      {/* 복습 하단과 같은 justify-between·gap-3·pt-2 배치(#274). */}
      <div className="moi-study-nav flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button type="button" variant="secondary" disabled={p.index === 0} onClick={() => p.onIndex(p.index - 1)}>
          <PrevIcon
            size={iconPrev.size}
            aria-hidden="true"
            focusable="false"
            className="moi-action-icon"
          />
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
            <SubmitIcon
              size={iconSubmit.size}
              aria-hidden="true"
              focusable="false"
              className="moi-action-icon"
            />
            {submitLabel}
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={p.index >= total - 1}
            onClick={() => p.onIndex(p.index + 1)}
          >
            <NextIcon
              size={iconNext.size}
              aria-hidden="true"
              focusable="false"
              className="moi-action-icon"
            />
            {copy.study.next}
          </Button>
        )}
      </div>
    </section>
  );
}
