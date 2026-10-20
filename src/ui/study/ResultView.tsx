import { useEffect, useState, type KeyboardEvent } from 'react';
import { copy } from '../copy';
import type { ApiClient, StudyCorrections, StudySubmittedItem, StudySubmittedSet } from '../api/client';
import { Button } from '../components/ui/button';
import { BookmarkButton } from '../review/BookmarkButton';
import { SourceLinks } from '../SourceLinks';
import { Explanation } from './Explanation';
import { ReportButton } from './ReportButton';
import { scopeLabel, STUDY_EXAM_LABEL } from './types';
import './study-result.css';

interface Props {
  client: ApiClient;
  set: StudySubmittedSet;
  onRestart: () => void;
  onHistory: () => void;
  corrections?: StudyCorrections;
}

// 응답 원시 kind → 화면 라벨 (#148).
const RESPONSE_KIND_LABEL: Record<string, string> = { answered: '응답', pass: 'Pass', unanswered: '미응답' };

// optionId → 해당 문항 optionOrder 기준 보기 번호. 매칭 실패 시 id 대신 '?' (#148).
function optionNumbers(item: StudySubmittedItem | undefined, ids: string[]): string {
  return ids.map((id) => {
    const index = item?.optionOrder.indexOf(id) ?? -1;
    return index >= 0 ? String(index + 1) : '?';
  }).join(', ');
}

// 신고 사유 라벨 — copy.report.reason* 재사용, 미정의 사유는 원문 노출.
function correctionReasonLabel(reason: string): string {
  switch (reason) {
    case 'answer':
      return copy.report.reasonAnswer;
    case 'explanation':
      return copy.report.reasonExplanation;
    case 'ambiguous':
      return copy.report.reasonAmbiguous;
    case 'typo':
      return copy.report.reasonTypo;
    default:
      return reason;
  }
}

// 방향키 이동을 넘기지 않을 입력 요소 — 신고 사유 선택·텍스트 입력을 방해하지 않는다(#189).
function isFormTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

// 결과 — 요약·문항별 선택/정답 + 스냅샷 해설·근거 링크(제출 후 노출).
// 해설은 한 문항씩만 보여주고 이전/다음(키보드 방향키 포함)으로 넘긴다(#189).
// 정정 이력(corrections)이 있으면 최초→정정 정답률·유효 분모·사유를 덧붙인다(#53).
// 정정 없음·조회 실패(undefined·0건) 시 기존 결과 화면 그대로 둔다.
export function ResultView({ client, set, onRestart, onHistory, corrections }: Props) {
  const [page, setPage] = useState(0);
  const r = set.result;
  const total = set.items.length;
  const perItem = r.perItem;
  const pageCount = perItem.length;
  const currentIndex = Math.min(page, Math.max(pageCount - 1, 0));
  const current = perItem[currentIndex];
  const contentOf = (questionId: string) => set.items.find((i) => i.questionId === questionId);
  const content = current ? contentOf(current.questionId) : undefined;
  const showCorrections = corrections !== undefined && corrections.items.length > 0;
  const corrected = corrections?.corrected;
  const indexOfVersion = (questionVersionId: string) =>
    set.items.findIndex((i) => i.questionVersionId === questionVersionId);

  // 세트가 바뀌면 첫 문항으로 되돌린다 — 이전 세트의 위치가 남지 않는다.
  useEffect(() => {
    setPage(0);
  }, [set.id]);

  const goTo = (next: number) => {
    setPage(Math.min(Math.max(next, 0), Math.max(pageCount - 1, 0)));
  };

  // 방향키 이동 — 포커스가 결과 영역(카드·이전/다음 버튼)에 있을 때만 처리한다(#189).
  const onPagerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (isFormTarget(event.target)) return;
    const next = currentIndex + (event.key === 'ArrowRight' ? 1 : -1);
    if (next < 0 || next >= pageCount) return;
    event.preventDefault();
    goTo(next);
  };

  return (
    <section className="moi-study" aria-label={copy.study.resultTitle}>
      <h2 className="moi-study-title">{copy.study.resultTitle}</h2>
      <p className="moi-note">
        {scopeLabel(set.mode)} · {STUDY_EXAM_LABEL} · 정답률 {r.accuracyPercent}%
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
      {/* 해설·근거는 한 문항씩 — 좌우 페이저와 방향키로 이동한다(#189). */}
      {pageCount > 0 && (
        <div
          className="moi-study-pager"
          role="group"
          aria-label={copy.study.resultPagerLabel}
          tabIndex={-1}
          onKeyDown={onPagerKeyDown}
        >
          <p className="moi-study-pager-status" aria-live="polite">
            <span className="moi-sr-only">{`${copy.study.questionLabel} `}</span>
            {currentIndex + 1}/{pageCount}
          </p>
          <ol className="moi-study-peritem">
            {current && (
              <li key={current.questionId} data-testid={`peritem-${current.questionId}`}>
                <span>{current.correct ? '정답' : '오답'} · </span>
                <span>{RESPONSE_KIND_LABEL[current.responseKind] ?? '—'} · </span>
                <span>선택: {current.selectedOptionIds.length ? optionNumbers(content, current.selectedOptionIds) : '없음'} · </span>
                <span>정답: {current.correctOptionIds ? optionNumbers(content, current.correctOptionIds) : '비공개'}</span>
                {content && (
                  <>
                    <BookmarkButton client={client} examId={set.examId} questionId={current.questionId} />
                    <ReportButton
                      client={client}
                      questionId={content.questionId}
                      questionVersionId={content.questionVersionId}
                    />
                  </>
                )}
                {content && (
                  <>
                    <div className="moi-note">
                      <span>{copy.study.explanation}: </span>
                      <Explanation markdown={content.explanation || '—'} />
                    </div>
                    {content.sourceUrls && content.sourceUrls.length > 0 && (
                      <div className="moi-study-sources">
                        <span className="moi-study-sources-label">{copy.study.sources}</span>
                        <SourceLinks urls={content.sourceUrls} />
                      </div>
                    )}
                  </>
                )}
              </li>
            )}
          </ol>
          <div className="moi-study-pager-nav">
            <Button
              type="button"
              variant="secondary"
              aria-label={copy.study.prevItem}
              disabled={currentIndex === 0}
              onClick={() => goTo(currentIndex - 1)}
            >
              {copy.study.prev}
            </Button>
            <Button
              type="button"
              variant="secondary"
              aria-label={copy.study.nextItem}
              disabled={currentIndex >= pageCount - 1}
              onClick={() => goTo(currentIndex + 1)}
            >
              {copy.study.next}
            </Button>
          </div>
        </div>
      )}
      {showCorrections && corrected && (
        <section className="moi-study-detail" aria-label={copy.study.correctionTitle}>
          <h3>{copy.study.correctionTitle}</h3>
          <p className="moi-note">
            {`${copy.study.correctionOriginal} ${r.accuracyPercent}% → ${copy.study.correctionCorrected} ${
              corrected.accuracyPercent !== null
                ? `${corrected.accuracyPercent}%`
                : copy.study.correctionUngraded
            }`}
          </p>
          <p className="moi-note">
            {`${copy.study.correctionValid} ${corrected.validTotal}${copy.study.questionLabel} · ${copy.study.correctionExcluded} ${corrected.excludedCount}${copy.study.questionLabel}`}
          </p>
          <ul>
            {corrections.items.map((c) => (
              <li key={c.id}>
                {`${copy.study.questionLabel} ${indexOfVersion(c.questionVersionId) + 1} · ${correctionReasonLabel(c.reason)}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* 하단 버튼 위계 — 새 세트 시작=primary, 학습 이력·오답 복습=secondary(같은 크기). */}
      <div className="moi-study-actions">
        <Button type="button" variant="primary" onClick={onRestart}>
          {copy.study.backToStart}
        </Button>
        <Button type="button" variant="secondary" onClick={onHistory}>
          {copy.study.historyLink}
        </Button>
        <Button asChild variant="secondary">
          <a href="/review?mode=wrong">{copy.review.goToWrongReview}</a>
        </Button>
      </div>
    </section>
  );
}
