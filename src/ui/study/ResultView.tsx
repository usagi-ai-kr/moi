import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { copy } from '../copy';
import type { ApiClient, StudyCorrections, StudySubmittedSet } from '../api/client';
import { Button } from '../components/ui/button';
import { ResultQuestionList } from './ResultQuestionList';
import { ResultPager } from './ResultPager';
import { scopeLabel, STUDY_EXAM_LABEL } from './types';
import './study-result.css';

interface Props {
  client: ApiClient;
  set: StudySubmittedSet;
  onRestart: () => void;
  onHistory: () => void;
  corrections?: StudyCorrections;
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

// 복습 바로가기 — 항상 SPA Link(호출자는 라우터 안에서 렌더한다, #176).
function ReviewShortcut({ mode, label }: { mode: 'wrong' | 'bookmark'; label: string }) {
  const to = `/review?mode=${mode}`;
  return (
    <Button asChild variant="secondary">
      <Link to={to}>{label}</Link>
    </Button>
  );
}

// 결과 — 요약·문항별 선택/정답 + 스냅샷 해설·근거 링크(제출 후 노출).
// 상세 렌더는 ResultPager·ResultItemDetail이 담당한다(#232 그룹 구조).
// 정정 이력(corrections)이 있으면 최초→정정 정답률·유효 분모·사유를 덧붙인다(#53).
export function ResultView({ client, set, onRestart, onHistory, corrections }: Props) {
  const [page, setPage] = useState(0);
  // 결과 요약 포커스 타깃 — 마지막 상세의 요약 이동용(#232). 제출·채점 호출 없음.
  const summaryRef = useRef<HTMLHeadingElement | null>(null);
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

  const goTo = (next: number) => setPage(Math.min(Math.max(next, 0), Math.max(pageCount - 1, 0)));
  // 요약 이동 — 스크롤+포커스만, 제출·채점·attempt 저장 없음(#232).
  const goToSummary = () => {
    const el = summaryRef.current; if (!el) return;
    try { el.scrollIntoView({ block: 'start' }); } catch { /* scroll 미지원 무시 */ }
    el.focus({ preventScroll: true });
  };

  return (
    <section className="moi-study" aria-label={copy.study.resultTitle}>
      <h1 ref={summaryRef} id="moi-study-result-summary" tabIndex={-1} className="moi-study-title">
        {copy.study.resultTitle}
      </h1>
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
      {/* 요약 → 문항 목록 → 선택한 한 문제의 상세 — 목록 선택은 기존 페이저 상태를 바꾼다(#132). */}
      {pageCount > 0 && (
        <ResultQuestionList perItem={perItem} currentIndex={currentIndex} onSelect={goTo} />
      )}
      {/* 해설·근거는 한 문항씩 — 좌우 페이저와 방향키로 이동한다(#189). */}
      {pageCount > 0 && (
        <ResultPager
          client={client}
          examId={set.examId}
          currentIndex={currentIndex}
          pageCount={pageCount}
          current={current}
          content={content}
          onGo={goTo}
          onSummary={goToSummary}
        />
      )}
      {showCorrections && corrected && (
        <section className="moi-study-detail" aria-label={copy.study.correctionTitle}>
          <h2 className="moi-study-detail-title">{copy.study.correctionTitle}</h2>
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
        <ReviewShortcut mode="wrong" label={copy.review.goToWrongReview} />
        <ReviewShortcut mode="bookmark" label={copy.review.goToBookmarkReview} />
      </div>
    </section>
  );
}
