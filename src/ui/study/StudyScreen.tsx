import { useEffect, useRef } from 'react';
import { copy } from '../copy';
import { isSubmittedSet, type ApiClient } from '../api/client';
import { Button } from '../components/ui/button';
import { RouteFallback } from '../RouteFallback';
import { AbandonConfirmDialog } from './AbandonConfirmDialog';
import { ConflictPanel } from './ConflictPanel';
import { HistoryView } from './HistoryView';
import { QuestionView } from './QuestionView';
import { ResultView } from './ResultView';
import { StartView } from './StartView';
import { useStudyCorrections } from './queries';
import { useStudyFlow } from './useStudyFlow';
import './study.css';

// 제출 확인용 인라인 대화상자 — 포기 확인(#223)은 모달 AbandonConfirmDialog를 사용한다.
// mount 시 대화상자로 포커스+가시성 보장(#232 후속): tabIndex=-1·focus·scrollIntoView, role=alertdialog 유지.
function InlineConfirmDialog({
  tone, label, text, confirm, pending, destructive, onConfirm, onCancel,
}: {
  tone: string;
  label: string;
  text: string;
  confirm: string;
  pending: boolean;
  destructive: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
    dialogRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  return (
    <div ref={dialogRef} tabIndex={-1} className={`moi-alert moi-study-confirm ${tone}`} role="alertdialog" aria-label={label}>
      <p className="moi-alert-text">{text}</p>
      {/* 확정 버튼 위계 — 제출=primary, 포기=destructive 계열(강도 낮게). 취소=ghost. */}
      {/* #270 확정 요청 시작 후 취소는 실제 요청 취소가 아니므로 pending 중 취소도 잠근다(포기 다이얼로그와 동일 정책). */}
      <Button
        type="button"
        variant={destructive ? 'outline' : 'primary'}
        className={destructive ? 'text-destructive' : undefined}
        onClick={onConfirm}
        disabled={pending}
        pending={pending}
      >
        {confirm}
      </Button>
      <Button type="button" variant="ghost" className="bg-transparent" onClick={onCancel} disabled={pending}>
        {copy.study.cancel}
      </Button>
    </div>
  );
}

// 학습 화면 — React.lazy 청크로 홈 초기 번들에서 분리. 라우터 없이 로컬 view 상태.
// userId로 계정별 초안·탭 상태를 격리한다(App이 key={userId}로 remount — 이슈 #52).
// 라우트 분리(#148): initialSetId/onNavigate가 있으면 route param·router 이동을 사용하고,
// 없으면 기존 ?study legacy·store view로 동작한다 (직접 렌더 테스트 호환).
export function StudyScreen({
  client,
  userId,
  initialSetId,
  onNavigate,
}: {
  client: ApiClient;
  userId: string;
  initialSetId?: string | null;
  onNavigate?: (to: string, opts?: { replace?: boolean; state?: unknown }) => void;
}) {
  const f = useStudyFlow(client, userId, {
    ...(initialSetId !== undefined ? { initialSetId } : {}),
    ...(onNavigate
      ? {
          // 주소창에 세트 UUID를 남기지 않는다 — /study가 current API로 복원한다 (#148).
          onSetStarted: (id) => onNavigate('/study', { state: { startedSetId: id } }),
          onSubmitted: (id) => onNavigate('/study/result', { state: { setId: id } }),
          onAbandoned: () => onNavigate('/study/new'),
        }
      : {}),
  });
  // 포기 트리거(QuestionView) — 취소/Escape 후 포커스 복귀용 (#223).
  const abandonTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { s, set, unanswered, setQuery, historyQuery } = f;
  // 제출 세트일 때만 정정 이력을 조회한다 — useStudyFlow는 수정하지 않는다 (#53).
  const correctionsQuery = useStudyCorrections(client, set && isSubmittedSet(set) ? set.id : null);

  // 라우트가 우선: active에서 submitted를 렌더하면 result로, result에서 active면 풀이로 replace.
  useEffect(() => {
    if (!onNavigate || !set) return;
    if (isSubmittedSet(set) && s.view === 'active') {
      onNavigate('/study/result', { replace: true, state: { setId: set.id } });
    } else if (!isSubmittedSet(set) && s.view === 'result' && f.setId) {
      onNavigate('/study', { replace: true });
    }
  }, [onNavigate, set, s.view, f.setId]);

  if (s.view === 'history') {
    return (
      <div>
        <button type="button" className="moi-study-ghost" onClick={() => s.setView(f.setId ? 'active' : 'start')}>
          {copy.study.backToStart}
        </button>
        <HistoryView
          items={historyQuery.data?.items ?? []}
          total={historyQuery.data?.total ?? 0}
          page={s.historyPage}
          pageSize={20}
          pending={historyQuery.isPending}
          loadError={historyQuery.isError}
          detailId={s.detailId}
          onPage={s.setHistoryPage}
          onDetail={s.setDetailId}
          onRetry={() => void historyQuery.refetch()}
        />
      </div>
    );
  }

  if (setQuery.isPending && f.setId) {
    return <RouteFallback variant="form" />;
  }

  if (set && isSubmittedSet(set)) {
    return (
      <ResultView
        client={client}
        set={set}
        onRestart={f.restart}
        onHistory={onNavigate ? () => onNavigate('/history') : () => s.setView('history')}
        corrections={correctionsQuery.data}
      />
    );
  }

  if (set && s.view === 'active') {
    return (
      <div>
        {f.conflicts.length > 0 && (
          <ConflictPanel
            conflicts={f.conflicts}
            items={set.items}
            pending={f.syncBusy}
            onUseServer={(qid) => void f.resolveServer(qid)}
            onUseMine={(qid) => void f.resolveMine(qid)}
          />
        )}
        {s.confirmSubmit && (
          <InlineConfirmDialog
            tone="moi-alert-warning"
            label={copy.study.confirmSubmit}
            text={unanswered > 0 ? copy.study.unansweredWarn : copy.study.confirmSubmit}
            confirm={copy.study.confirmSubmit}
            pending={f.submitMut.isPending}
            destructive={false}
            onConfirm={f.doSubmit}
            onCancel={() => s.setConfirmSubmit(false)}
          />
        )}
        <AbandonConfirmDialog
          open={s.confirmAbandon}
          pending={f.abandonMut.isPending}
          error={f.abandonError}
          triggerRef={abandonTriggerRef}
          onConfirm={f.doAbandon}
          onRequestClose={() => {
            f.clearAbandonError();
            s.setConfirmAbandon(false);
          }}
        />
        <QuestionView
          client={client}
          items={set.items}
          index={Math.min(s.index, set.items.length - 1)}
          save={s.save}
          submitting={f.submitMut.isPending}
          unansweredCount={unanswered}
          submitError={f.submitError}
          onIndex={s.setIndex}
          onAnswer={(qid, res, prev) => f.handleAnswer(qid, res, prev)}
          // Pass → 즉시 다음 문제로 이동(마지막 문제는 머문다 — 자동 제출 금지) (#185).
          onPass={(qid, prev) => {
            f.handleAnswer(qid, { kind: 'pass' }, prev);
            if (s.index < set.items.length - 1) s.setIndex(s.index + 1);
          }}
          onClear={(qid, prev) => f.handleAnswer(qid, { kind: 'unanswered' }, prev)}
          onRetry={() => f.handleRetry()}
          onSubmitRequest={f.handleSubmitRequest}
          onAbandonRequest={() => {
            if (f.submitMut.isPending) return;
            s.setConfirmAbandon(true);
          }}
          abandonTriggerRef={abandonTriggerRef}
        />
      </div>
    );
  }

  return (
    <StartView
      scope={s.scope}
      domainId={s.domainId}
      pending={f.startMut.isPending}
      conflict={f.conflict}
      unauthorized={f.unauth || setQuery.isError}
      startError={f.startError ?? (setQuery.isError ? copy.session.loadError : null)}
      onScope={s.setScope}
      onDomain={s.setDomainId}
      onStart={f.handleStart}
      onResume={() => {
        // 409(이미 진행 중)는 setId를 모르므로 /study의 current 복원으로 이동한다 (#148).
        if (onNavigate) {
          onNavigate('/study');
          return;
        }
        if (!f.setId) return;
        s.setView('active');
      }}
      onHistory={onNavigate ? () => onNavigate('/history') : undefined}
    />
  );
}
