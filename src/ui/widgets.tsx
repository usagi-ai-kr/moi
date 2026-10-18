import { copy } from './copy';
import { maskUserId, useUiStore } from './session';

// 토큰 기반 시맨틱 위젯 — AntD 런타임을 초기·상호작용 경로 모두에서 제외한다 (perf).
// antd-less: 접근성은 네이티브 요소 + role/aria로 동등 보장한다.
export function AuthErrorAlert() {
  const dismissAuthBanner = useUiStore((s) => s.dismissAuthBanner);
  return (
    <div className="moi-alert moi-alert-warning" role="alert">
      <span className="moi-alert-icon" aria-hidden="true">
        !
      </span>
      <p className="moi-alert-text">{copy.session.authError}</p>
      <button
        type="button"
        className="moi-alert-close"
        aria-label={copy.session.dismiss}
        onClick={dismissAuthBanner}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export function LoadErrorAlert({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="moi-alert moi-alert-error" role="alert">
      <span className="moi-alert-icon" aria-hidden="true">
        !
      </span>
      <p className="moi-alert-text">{copy.session.loadError}</p>
      <button type="button" className="moi-alert-retry" onClick={onRetry}>
        {copy.session.retry}
      </button>
    </div>
  );
}

export function LoggedInCard({
  userId,
  pending,
  onLogout,
}: {
  userId: string;
  pending: boolean;
  onLogout: () => void;
}) {
  return (
    <section className="moi-card" aria-label={copy.session.account}>
      <h2 className="moi-card-title">{copy.session.account}</h2>
      <p className="moi-lead">{copy.session.welcome}</p>
      <p className="moi-note" data-testid="masked-id">
        {maskUserId(userId)}
      </p>
      <button
        type="button"
        className="moi-action"
        disabled={pending}
        aria-busy={pending}
        onClick={onLogout}
      >
        {pending && <span className="moi-spinner moi-spinner-sm" aria-hidden="true" />}
        {pending ? copy.session.loggingOut : copy.session.logout}
      </button>
    </section>
  );
}
