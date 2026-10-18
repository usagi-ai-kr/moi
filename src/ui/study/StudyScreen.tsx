import { copy } from '../copy';
import { isSubmittedSet, type ApiClient } from '../api/client';
import { ConflictPanel } from './ConflictPanel';
import { HistoryView } from './HistoryView';
import { QuestionView } from './QuestionView';
import { ResultView } from './ResultView';
import { StartView } from './StartView';
import { useStudyFlow } from './useStudyFlow';
import './study.css';

function ConfirmDialog({
  tone, label, text, confirm, pending, onConfirm, onCancel,
}: {
  tone: string;
  label: string;
  text: string;
  confirm: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={`moi-alert ${tone}`} role="alertdialog" aria-label={label}>
      <p className="moi-alert-text">{text}</p>
      <button type="button" className="moi-study-primary" onClick={onConfirm} disabled={pending}>
        {confirm}
      </button>
      <button type="button" className="moi-alert-retry" onClick={onCancel}>
        {copy.study.cancel}
      </button>
    </div>
  );
}

// 학습 화면 — React.lazy 청크로 홈 초기 번들에서 분리. 라우터 없이 로컬 view 상태.
// userId로 계정별 초안·탭 상태를 격리한다(App이 key={userId}로 remount — 이슈 #52).
export function StudyScreen({ client, userId }: { client: ApiClient; userId: string }) {
  const f = useStudyFlow(client, userId);
  const { s, set, unanswered, setQuery, historyQuery } = f;

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
    return <ResultView client={client} set={set} onRestart={f.restart} onHistory={() => s.setView('history')} />;
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
            onConfirm={f.doAbandon}
            onCancel={() => s.setConfirmAbandon(false)}
          />
        )}
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
      onResume={() => f.setId && s.setView('active')}
    />
  );
}
