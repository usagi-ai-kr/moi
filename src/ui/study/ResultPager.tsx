import type { KeyboardEvent } from 'react';
import { copy } from '../copy';
import type { ApiClient, StudyPerItem, StudySubmittedItem } from '../api/client';
import { Button } from '../components/ui/button';
import { iconNext, iconPrev, iconResult } from '../icons';
import { ResultItemDetail } from './ResultItemDetail';

// #233 Slice B — 페이저 아이콘은 icons.ts spec(ADR-0073). 라벨 유지, 장식 aria-hidden.
const PrevIcon = iconPrev.icon;
const NextIcon = iconNext.icon;
const SummaryIcon = iconResult.icon;

interface Props {
  client: ApiClient;
  examId: string;
  currentIndex: number;
  pageCount: number;
  current: StudyPerItem | undefined;
  content: StudySubmittedItem | undefined;
  onGo: (index: number) => void;
  onSummary: () => void;
}

// 방향키 이동을 넘기지 않을 입력 요소 — 신고 사유 선택·텍스트 입력을 방해하지 않는다(#189).
function isFormTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

// 결과 해설 페이저 — 한 문항씩 좌우 이동(#189). 탐색 그룹은 정보·액션 그룹과 분리한다(#232).
export function ResultPager(p: Props) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (isFormTarget(event.target)) return;
    const next = p.currentIndex + (event.key === 'ArrowRight' ? 1 : -1);
    if (next < 0 || next >= p.pageCount) return;
    event.preventDefault();
    p.onGo(next);
  };

  return (
    <div
      className="moi-study-pager"
      role="group"
      aria-label={copy.study.resultPagerLabel}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <p className="moi-study-pager-status" aria-live="polite">
        <span className="moi-sr-only">{`${copy.study.questionLabel} `}</span>
        {p.currentIndex + 1}/{p.pageCount}
      </p>
      <ol className="moi-study-peritem">
        {p.current && (
          <ResultItemDetail
            client={p.client}
            examId={p.examId}
            index={p.currentIndex}
            perItem={p.current}
            content={p.content}
          />
        )}
      </ol>
      <div className="moi-study-pager-nav">
        <Button
          type="button"
          variant="secondary"
          aria-label={copy.study.prevItem}
          disabled={p.currentIndex === 0}
          onClick={() => p.onGo(p.currentIndex - 1)}
        >
          <PrevIcon
            size={iconPrev.size}
            aria-hidden="true"
            focusable="false"
            className="moi-action-icon"
          />
          {copy.study.prev}
        </Button>
        {p.currentIndex >= p.pageCount - 1 ? (
          <Button type="button" variant="secondary" onClick={p.onSummary}>
            <SummaryIcon
              size={iconResult.size}
              aria-hidden="true"
              focusable="false"
              className="moi-action-icon"
            />
            {copy.study.backToSummary}
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            aria-label={copy.study.nextItem}
            disabled={p.currentIndex >= p.pageCount - 1}
            onClick={() => p.onGo(p.currentIndex + 1)}
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
    </div>
  );
}
