import { Suspense, lazy } from 'react';
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useInRouterContext,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router';
import { copy } from './copy';
import { KakaoLoginButton } from './KakaoLoginButton';
import { useAuthCallback, useLogout, useSessionId, useUiStore, type ApiClient } from './session';
import { AppShell } from './AppShell';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { AuthErrorAlert, LoadErrorAlert } from './widgets';

// 학습 화면은 lazy 청크로 홈 초기 번들/LCP에 포함하지 않는다 (이슈 #50, #148).
const StudyRoute = lazy(() => import('./pages/StudyRoute').then((m) => ({ default: m.StudyRoute })));
const LegacyStudyRedirect = lazy(() =>
  import('./pages/LegacyStudyRedirect').then((m) => ({ default: m.LegacyStudyRedirect })),
);
const HistoryDetailPage = lazy(() =>
  import('./pages/HistoryDetailPage').then((m) => ({ default: m.HistoryDetailPage })),
);
// markdown·통계 번들이 로그아웃/로그인 홈 초기 번들에 포함되지 않도록 분리한다 (이슈 #132).
const ReviewScreen = lazy(() =>
  import('./review/ReviewScreen').then((m) => ({ default: m.ReviewScreen })),
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })),
);
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })),
);

function RouteFallback() {
  return (
    <p className="moi-note" role="status" aria-live="polite">
      {copy.common.loading}
    </p>
  );
}

function RouteBoundaryLayout() {
  const location = useLocation();
  return (
    <RouteErrorBoundary key={location.pathname} resetKey={location.pathname}>
      <Outlet />
    </RouteErrorBoundary>
  );
}

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
        <div className="moi-container moi-header-inner">
          <span className="moi-brand">{copy.brand}</span>
          <span className="moi-brand-sub">{copy.tagline}</span>
        </div>
      </header>
      <main className="moi-main">
        <div className="moi-container moi-main-inner moi-enter">
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
          <p className="moi-note">{copy.home.note}</p>
        </div>
      </main>
    </>
  );
}

// 로그인 홈 — 계정·통계·로그아웃은 각자의 화면/메뉴로 이동한다.
// CTA는 라우터로 이동해 뒤로가기/새로고침/직접 URL을 유지한다.
function Home({ showAuthError, client }: { showAuthError: boolean; client: ApiClient }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const legacyStudy = params.get('study');
  // legacy: /?study=<UUID> 북마크도 서버 소유권 확인 후 새 주소로 replace (#148).
  if (legacyStudy) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <LegacyStudyRedirect client={client} setId={legacyStudy} />
      </Suspense>
    );
  }
  return (
    <div className="moi-page">
      {showAuthError && <AuthErrorAlert />}
      <p className="moi-lead">{copy.session.welcome}</p>
      <div className="moi-cta moi-study-cta-row">
        <button type="button" className="moi-study-open" onClick={() => void navigate('/study/new')}>
          {copy.study.cta}
        </button>
        <button type="button" className="moi-study-link" onClick={() => void navigate('/history')}>
          {copy.study.historyLink}
        </button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="moi-page">
      <p className="moi-note">페이지를 찾을 수 없습니다.</p>
      <a className="moi-study-link" href="/">
        {copy.nav.study}
      </a>
    </div>
  );
}

function AppContent({ client }: { client: ApiClient }) {
  const { status, userId, retry } = useSessionId(client);
  const doLogout = useLogout(client, userId);
  const logoutPending = useUiStore((s) => s.logoutPending);
  const authFailed = useAuthCallback('error');
  useAuthCallback('success');
  const bannerDismissed = useUiStore((s) => s.authBannerDismissed);
  const showAuthError = authFailed && !bannerDismissed;
  if (status !== 'logged-in' || userId === null) {
    return <LoggedOutView status={status} onRetry={retry} showAuthError={showAuthError} />;
  }
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route element={<RouteBoundaryLayout />}>
          <Route index element={<Home showAuthError={showAuthError} client={client} />} />
          <Route
            path="study"
            element={<Suspense key={userId} fallback={<RouteFallback />}><StudyRoute client={client} userId={userId} mode="current" /></Suspense>}
          />
          <Route
            path="study/new"
            element={<Suspense key={userId} fallback={<RouteFallback />}><StudyRoute client={client} userId={userId} mode="start" /></Suspense>}
          />
          <Route
            path="study/result"
            element={<Suspense key={userId} fallback={<RouteFallback />}><StudyRoute client={client} userId={userId} mode="result" /></Suspense>}
          />
          <Route
            path="study/:setId"
            element={<Suspense fallback={<RouteFallback />}><LegacyStudyRedirect client={client} /></Suspense>}
          />
          <Route
            path="study/:setId/result"
            element={<Suspense fallback={<RouteFallback />}><LegacyStudyRedirect client={client} /></Suspense>}
          />
          <Route
            path="history"
            element={<Suspense fallback={<RouteFallback />}><HistoryPage client={client} /></Suspense>}
          />
          <Route
            path="history/:setId"
            element={<Suspense fallback={<RouteFallback />}><HistoryDetailPage client={client} /></Suspense>}
          />
          <Route
            path="review"
            element={<Suspense fallback={<RouteFallback />}><ReviewScreen client={client} /></Suspense>}
          />
          <Route
            path="account"
            element={<Suspense fallback={<RouteFallback />}><AccountPage pending={logoutPending} onLogout={doLogout} /></Suspense>}
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}

// 테스트·구버전 진입 호환 — Router 없이 렌더되면 MemoryRouter로 감싼다.
export function App({ client }: { client: ApiClient }) {
  const inRouter = useInRouterContext();
  if (inRouter) return <AppContent client={client} />;
  return (
    <MemoryRouter>
      <AppContent client={client} />
    </MemoryRouter>
  );
}
