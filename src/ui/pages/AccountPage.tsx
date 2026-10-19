import { useState } from 'react';
import { copy } from '../copy';

// 계정 — 로그인 상태 안내 + 로그아웃 버튼만. UUID/sub/jti/마스킹 ID를 표시하지 않는다.
// 로그아웃 훅은 AppContent가 소유한다 — 계정 화면이 /api/me observer를 중복 생성하지 않게 한다.
export function AccountPage({
  pending,
  onLogout,
}: {
  pending: boolean;
  onLogout: () => Promise<void>;
}) {
  const [failed, setFailed] = useState(false);
  const handleLogout = async () => {
    setFailed(false);
    try {
      await onLogout();
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
          <button type="button" className="moi-alert-retry" onClick={() => void handleLogout()}>
            {copy.session.retry}
          </button>
        </div>
      )}
      <button
        type="button"
        className="moi-action"
        disabled={pending}
        aria-busy={pending}
        onClick={() => void handleLogout()}
      >
        {pending && <span className="moi-spinner moi-spinner-sm" aria-hidden="true" />}
        {pending ? copy.session.loggingOut : copy.session.logout}
      </button>
    </section>
  );
}
