import { useState } from 'react';
import { copy } from '../copy';
import { useLogout, useSessionId, useUiStore, type ApiClient } from '../session';

// 계정 — 로그인 상태 안내 + 로그아웃 버튼만. UUID/sub/jti/마스킹 ID를 표시하지 않는다.
export function AccountPage({ client }: { client: ApiClient }) {
  const { userId } = useSessionId(client);
  const doLogout = useLogout(client, userId);
  const pending = useUiStore((s) => s.logoutPending);
  const [failed, setFailed] = useState(false);
  const onLogout = async () => {
    setFailed(false);
    try {
      await doLogout();
    } catch {
      setFailed(true);
    }
  };
  return (
    <section className="moi-card moi-page" aria-label={copy.account.title}>
      <h1 className="moi-card-title">{copy.account.title}</h1>
      <p className="moi-lead">{copy.account.loggedIn}</p>
      {failed && (
        <div className="moi-alert moi-alert-error" role="alert">
          <p className="moi-alert-text">{copy.account.logoutError}</p>
          <button type="button" className="moi-alert-retry" onClick={onLogout}>
            {copy.session.retry}
          </button>
        </div>
      )}
      <button
        type="button"
        className="moi-action"
        disabled={pending}
        aria-busy={pending}
        onClick={() => void onLogout()}
      >
        {pending && <span className="moi-spinner moi-spinner-sm" aria-hidden="true" />}
        {pending ? copy.session.loggingOut : copy.session.logout}
      </button>
    </section>
  );
}
