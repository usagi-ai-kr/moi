import { useEffect } from 'react';
import { copy } from '../copy';
import { isSubmittedSet, type ApiClient } from '../api/client';
import { Button } from '../components/ui/button';
import { ConflictPanel } from './ConflictPanel';
import { HistoryView } from './HistoryView';
import { QuestionView } from './QuestionView';
import { ResultView } from './ResultView';
import { StartView } from './StartView';
import { useStudyCorrections } from './queries';
import { useStudyFlow } from './useStudyFlow';
import './study.css';

function ConfirmDialog({
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
  return (
    <div className={`moi-alert moi-study-confirm ${tone}`} role="alertdialog" aria-label={label}>
      <p className="moi-alert-text">{text}</p>
      {/* 확정 버튼 위계 — 제출=primary, 포기=destructive 계열(강도 낮게). 취소=ghost. */}
      <Button
        type="button"
        variant={destructive ? 'outline' : 'primary'}
        className={destructive ? 'moi-study-outline text-destructive' : undefined}
        onClick={onConfirm}
        disabled={pending}
        pending={pending}
      >
        {confirm}
      </Button>
      <Button type="button" variant="ghost" className="bg-transparent" onClick={onCancel}>
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
          onSetStarted: () => onNavigate('/study'),
          onSubmitted: (id) => onNavigate('/study/result', { state: { setId: id } }),
          onAbandoned: () => onNavigate('/study/new'),
        }
      : {}),
  });
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
    return (
      <p className="moi-note" role="status" aria-live="polite">
        {copy.session.checking}
      </p>
    );
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
          <ConfirmDialog
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
        {s.confirmAbandon && (
          <ConfirmDialog
            tone="moi-alert-error"
            label={copy.study.confirmAbandon}
            text={copy.study.abandonAsk}
            confirm={copy.study.confirmAbandon}
            pending={f.abandonMut.isPending}
            destructive
            onConfirm={f.doAbandon}
            onCancel={() => s.setConfirmAbandon(false)}
          />
        )}
        <QuestionView
          client={client}
          examId={set.examId}
          items={set.items}
          index={Math.min(s.index, set.items.length - 1)}
          save={s.save}
          submitting={f.submitMut.isPending}
          unansweredCount={unanswered}
          submitError={f.submitError}
          onIndex={s.setIndex}
          onAnswer={(qid, res, prev) => f.handleAnswer(qid, res, prev)}
          onPass={(qid, prev) => f.handleAnswer(qid, { kind: 'pass' }, prev)}
          onClear={(qid, prev) => f.handleAnswer(qid, { kind: 'unanswered' }, prev)}
          onRetry={() => f.handleRetry()}
          onSubmitRequest={f.handleSubmitRequest}
          onAbandonRequest={() => s.setConfirmAbandon(true)}
        />
      </div>
    );
  }

  return (
    <div>
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
      />
      {onNavigate && (
        <button type="button" className="moi-study-link" onClick={() => onNavigate('/history')}>
          {copy.study.historyLink}
        </button>
      )}
    </div>
  );
}
