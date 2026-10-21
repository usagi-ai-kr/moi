import { Suspense, lazy } from 'react';
import { Brand } from './Brand';
import { copy } from './copy';
import { KakaoLoginButton } from './KakaoLoginButton';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { RouteFallback } from './RouteFallback';
import { useAuthCallback, useSessionUser, useUiStore, type ApiClient } from './session';
import { AuthErrorAlert, LoadErrorAlert } from './widgets';

// 로그인 후 트리는 비로그인 홈 초기 번들/LCP에 포함하지 않도록 지연 로드한다 (이슈 #132).
const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'));

function CheckingView() {
  return (
    <div className="moi-center" role="status" aria-live="polite">
      <span className="moi-spinner" aria-hidden="true" />
      <p className="moi-note">{copy.session.checking}</p>
    </div>
  );
}

function LoggedOutView({
  status,
  onRetry,
  showAuthError,
}: {
  status: 'loading' | 'error' | 'logged-out' | 'logged-in';
  onRetry: () => void;
  showAuthError: boolean;
}) {
  return (
    <>
      <header className="moi-header">
        <div className="moi-container moi-header-inner moi-landing-head">
          <Brand />
        </div>
      </header>
      <main className="moi-main">
        <div className="moi-container moi-main-inner moi-landing moi-enter">
          <div className="moi-page moi-landing-page">
            <div className="moi-accent" aria-hidden="true" />
            {showAuthError && <AuthErrorAlert />}
            <h1 className="moi-title">{copy.brand}</h1>
            <p className="moi-lead">{copy.tagline}</p>
            {status === 'loading' && <CheckingView />}
            {status === 'error' && <LoadErrorAlert onRetry={onRetry} />}
            {status === 'logged-out' && (
              <div className="moi-cta">
                <KakaoLoginButton />
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

export function App({ client }: { client: ApiClient }) {
  const { status, user, retry } = useSessionUser(client);
  const authFailed = useAuthCallback('error');
  useAuthCallback('success');
  const bannerDismissed = useUiStore((s) => s.authBannerDismissed);
  const showAuthError = authFailed && !bannerDismissed;

  if (status !== 'logged-in' || user === null) {
    return <LoggedOutView status={status} onRetry={retry} showAuthError={showAuthError} />;
  }

  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <AuthenticatedApp client={client} user={user} showAuthError={showAuthError} />
      </Suspense>
    </RouteErrorBoundary>
  );
}
