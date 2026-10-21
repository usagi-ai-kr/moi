import { Suspense, lazy } from 'react';
import {
  BrowserRouter,
  Link,
  Outlet,
  Route,
  Routes,
  useInRouterContext,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router';
import { copy } from './copy';
import { useLogout, useUiStore, type ApiClient, type MeUser } from './session';
import { ExamScope } from './exam/ExamScope';
import { ExamScopeProvider } from './exam/ExamScopeProvider';
import './authenticated.css';
import { AppShell } from './AppShell';
import { importAccount, importHistory, importReview } from './lazy-routes';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { RouteFallback } from './RouteFallback';
import { AuthErrorAlert } from './widgets';
import { useHeroGreeting } from './greetings';

// 학습 화면은 lazy 청크로 홈 초기 번들/LCP에 포함하지 않는다 (이슈 #50, #148).
const StudyRoute = lazy(() => import('./pages/StudyRoute').then((m) => ({ default: m.StudyRoute })));
const LegacyStudyRedirect = lazy(() =>
  import('./pages/LegacyStudyRedirect').then((m) => ({ default: m.LegacyStudyRedirect })),
);
const LegacyHistoryRedirect = lazy(() =>
  import('./pages/LegacyHistoryRedirect').then((m) => ({ default: m.LegacyHistoryRedirect })),
);
const HistoryDetailPage = lazy(() =>
  import('./pages/HistoryDetailPage').then((m) => ({ default: m.HistoryDetailPage })),
);
// markdown·통계 번들이 로그아웃/로그인 홈 초기 번들에 포함되지 않도록 분리한다 (이슈 #132).
// importer는 lazy-routes가 소유해 hover/focus prefetch와 같은 청크를 공유한다 (#184).
const ReviewScreen = lazy(importReview);
const HistoryPage = lazy(importHistory);
const AccountPage = lazy(importAccount);

function RouteBoundaryLayout() {
  const location = useLocation();
  return (
    <RouteErrorBoundary
      key={location.pathname}
      resetKey={location.pathname}
      homeLink={
        <Link to="/" className="moi-study-link">
          {copy.common.home}
        </Link>
      }
    >
      <Outlet />
    </RouteErrorBoundary>
  );
}

// 로그인 홈 — 계정·통계·로그아웃은 각자의 화면/메뉴로 이동한다.
// CTA는 라우터로 이동해 뒤로가기/새로고침/직접 URL을 유지한다.
function Home({ showAuthError, client }: { showAuthError: boolean; client: ApiClient }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const greeting = useHeroGreeting();
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
      <h1 className="moi-title">{greeting}</h1>
      <section aria-label={copy.exam.label}>
        <ExamScope />
        <p className="moi-note">{copy.exam.note}</p>
        <p className="moi-note">{copy.study.examContext}</p>
      </section>
      <div className="moi-cta moi-study-cta-row">
        <button type="button" className="moi-study-open" onClick={() => void navigate('/study/new')}>
          {copy.study.cta}
        </button>
        <button type="button" className="moi-study-link" onClick={() => void navigate('/history')}>
          {copy.study.historyLink}
        </button>
        <button type="button" className="moi-study-link" onClick={() => void navigate('/study')}>
          {copy.study.continueStudy}
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

function AuthenticatedRoutes({
  client,
  user,
  showAuthError,
}: {
  client: ApiClient;
  user: MeUser;
  showAuthError: boolean;
}) {
  const userId = user.id;
  const doLogout = useLogout(client, userId);
  const logoutPending = useUiStore((s) => s.logoutPending);

  return (
    <ExamScopeProvider>
      <Routes>
        {/* 로그아웃은 계정 본문이 아니라 내비게이션(데스크톱 nav·모바일 Drawer) 액션이다(#234/ADR-0072). */}
        <Route element={<AppShell onLogout={doLogout} pending={logoutPending} />}>
          <Route element={<RouteBoundaryLayout />}>
            <Route index element={<Home showAuthError={showAuthError} client={client} />} />
            <Route
              path="study"
              element={<Suspense key={userId} fallback={<RouteFallback variant="form" />}><StudyRoute client={client} userId={userId} mode="current" /></Suspense>}
            />
            <Route
              path="study/new"
              element={<Suspense key={userId} fallback={<RouteFallback variant="form" />}><StudyRoute client={client} userId={userId} mode="start" /></Suspense>}
            />
            <Route
              path="study/result"
              element={<Suspense key={userId} fallback={<RouteFallback variant="form" />}><StudyRoute client={client} userId={userId} mode="result" /></Suspense>}
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
              path="history/detail"
              element={<Suspense fallback={<RouteFallback variant="detail" />}><HistoryDetailPage client={client} /></Suspense>}
            />
            <Route
              path="history/:setId"
              element={<Suspense fallback={<RouteFallback />}><LegacyHistoryRedirect client={client} /></Suspense>}
            />
            <Route
              path="review"
              element={<Suspense fallback={<RouteFallback />}><ReviewScreen client={client} /></Suspense>}
            />
            <Route
              path="account"
              element={<Suspense fallback={<RouteFallback />}><AccountPage user={user} /></Suspense>}
            />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </ExamScopeProvider>
  );
}

export function AuthenticatedApp(props: {
  client: ApiClient;
  user: MeUser;
  showAuthError: boolean;
}) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <AuthenticatedRoutes {...props} />;
  }
  return (
    <BrowserRouter>
      <AuthenticatedRoutes {...props} />
    </BrowserRouter>
  );
}

export default AuthenticatedApp;
