import { copy } from './copy';
import { KakaoLoginButton } from './KakaoLoginButton';
import { useAuthCallback, useLogout, useSessionId, useUiStore, type ApiClient } from './session';
import { AuthErrorAlert, LoadErrorAlert, LoggedInCard } from './widgets';

// 경량 CSS 스피너 로딩 화면 — AntD Spin을 쓰지 않는다 (perf).
function CheckingView() {
  return (
    <div className="moi-center" role="status" aria-live="polite">
      <span className="moi-spinner" aria-hidden="true" />
      <p className="moi-note">{copy.session.checking}</p>
    </div>
  );
}

// 서버 진실 원천(/api/me) 기반 5개 상태 화면 (ADR-0018).
// client 주입 가능 — 테스트에서 가짜 클라이언트로 교체한다.
export function App({ client }: { client: ApiClient }) {
  const { status, userId, retry } = useSessionId(client);
  const doLogout = useLogout(client);
  const logoutPending = useUiStore((s) => s.logoutPending);
  const authFailed = useAuthCallback('error');
  useAuthCallback('success');
  const bannerDismissed = useUiStore((s) => s.authBannerDismissed);
  const showAuthError = authFailed && !bannerDismissed;

  return (
    <>
      <header className="moi-header">
        <div className="moi-container moi-header-inner">
          <span className="moi-brand">{copy.brand}</span>
          <span className="moi-brand-sub">{copy.tagline}</span>
        </div>
      </header>
      <main className="moi-main">
        <div className="moi-container moi-main-inner moi-enter">
          <div className="moi-accent" aria-hidden="true" />
          {status === 'loading' && <CheckingView />}
          {status === 'error' && <LoadErrorAlert onRetry={retry} />}
          {showAuthError && <AuthErrorAlert />}
          {status === 'logged-in' && userId !== null ? (
            <LoggedInCard userId={userId} pending={logoutPending} onLogout={() => void doLogout()} />
          ) : (
            status !== 'loading' && (
              <>
                <h1 className="moi-title">{copy.brand}</h1>
                <p className="moi-lead">{copy.tagline}</p>
                <div className="moi-cta">
                  <KakaoLoginButton />
                </div>
                <p className="moi-note">{copy.home.note}</p>
              </>
            )
          )}
        </div>
      </main>
    </>
  );
}
