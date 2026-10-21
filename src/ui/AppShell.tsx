import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Brand } from './Brand';
import { Drawer } from './components/ui/drawer';
import { copy } from './copy';
import { ExamSelector } from './exam/ExamSelector';
import {
  iconAccount,
  iconBookmark,
  iconClose,
  iconHistory,
  iconMenu,
  iconStart,
  type IconSpec,
} from './icons';
import { prefetchRoute } from './lazy-routes';
import { LogoutAction } from './LogoutAction';
import { MOBILE_NAV_QUERY, useMediaQuery } from './responsive';
import './shell.css';
import './drawer.css';

// 모바일 Drawer의 dialog id — 트리거의 aria-controls와 일치해야 한다 (ADR-0057).
const DRAWER_ID = 'moi-mobile-nav';

// #233 Slice B — nav 아이콘은 icons.ts spec(ADR-0073·DESIGN §4).
// 라벨은 그대로 두고 아이콘은 장식(aria-hidden)으로 렌더한다.
function NavIcon({ spec }: { spec: IconSpec }) {
  const Icon = spec.icon;
  return <Icon size={spec.size} aria-hidden="true" focusable="false" />;
}

const MenuIcon = iconMenu.icon;
const CloseIcon = iconClose.icon;
// NavLink 청크를 hover/focus/touch 시점에 미리 받아 라우트 전환 시 로딩 폴백을 줄인다 (#184).
function prefetchOnIntent(to: '/history' | '/review' | '/account') {
  return {
    onMouseEnter: () => prefetchRoute(to),
    onFocus: () => prefetchRoute(to),
    onTouchStart: () => prefetchRoute(to),
  };
}

// 로그인 후 셸 — header(브랜드+nav) + main(Outlet). NavLink가 aria-current="page"를 부여한다.
// 모바일(≤767px)은 햄버거 + 우측 Drawer, 데스크톱은 가로 nav를 노출한다 (ADR-0057).
// 로그아웃은 계정 본문이 아니라 이 셸의 독립 액션이다(#234/ADR-0072) — 비로그인 상태에서는 셸 자체가 렌더되지 않는다.
export function AppShell({
  onLogout,
  pending,
}: {
  onLogout: () => Promise<void>;
  pending: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE_NAV_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 경로 변경(메뉴 선택·뒤로가기·401 리다이렉트) 시 Drawer를 닫는다.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // 데스크톱 구간으로 전환되면 Drawer를 닫아 메뉴 중복을 막는다.
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  return (
    <>
      <header className="moi-header moi-shell-header">
        <div className="moi-container moi-shell-head">
          <Link to="/" className="moi-brand-link" aria-label={copy.brand}>
            <Brand />
          </Link>
          <div className="moi-shell-nav-group">
            <nav className="moi-nav" aria-label={copy.nav.label} hidden={isMobile}>
              <NavLink to="/" end className="moi-nav-link">
                <NavIcon spec={iconStart} />
                {copy.nav.study}
              </NavLink>
              <NavLink to="/history" className="moi-nav-link" {...prefetchOnIntent('/history')}>
                <NavIcon spec={iconHistory} />
                {copy.nav.history}
              </NavLink>
              <NavLink to="/review" className="moi-nav-link" {...prefetchOnIntent('/review')}>
                <NavIcon spec={iconBookmark} />
                {copy.nav.review}
              </NavLink>
              <NavLink to="/account" className="moi-nav-link" {...prefetchOnIntent('/account')}>
                <NavIcon spec={iconAccount} />
                {copy.nav.account}
              </NavLink>
              <LogoutAction className="moi-nav-action" pending={pending} onLogout={onLogout} />
            </nav>
            {/* 시험 선택 — 데스크톱은 헤더, 모바일은 Drawer. 동시에 마운트되지 않는다 (#239). */}
            {!isMobile ? <ExamSelector id="moi-exam-select-nav" className="moi-shell-exam" /> : null}
          </div>
          {isMobile ? (
            <button
              type="button"
              ref={triggerRef}
              className="moi-drawer-trigger"
              aria-expanded={drawerOpen}
              aria-controls={DRAWER_ID}
              aria-label={copy.nav.menuOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon size={iconMenu.size} aria-hidden="true" focusable="false" />
            </button>
          ) : null}
        </div>
      </header>
      <main className="moi-main moi-shell-main">
        <div className="moi-container moi-main-inner moi-enter">
          <Outlet />
        </div>
      </main>
      <Drawer
        id={DRAWER_ID}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        returnFocusRef={triggerRef}
        aria-label={copy.nav.drawerLabel}
      >
        <div className="moi-drawer-panel">
          <div className="moi-drawer-head">
            <Brand />
            <button
              type="button"
              className="moi-drawer-close"
              aria-label={copy.nav.menuClose}
              onClick={() => setDrawerOpen(false)}
            >
              <CloseIcon size={iconClose.size} aria-hidden="true" focusable="false" />
            </button>
          </div>
          <div className="moi-drawer-exam">
            <ExamSelector id="moi-exam-select-drawer" />
          </div>
          <nav className="moi-drawer-nav" aria-label={copy.nav.label}>
            <NavLink to="/" end className="moi-drawer-link" onClick={() => setDrawerOpen(false)}>
              <NavIcon spec={iconStart} />
              {copy.nav.study}
            </NavLink>
            <NavLink
              to="/history"
              className="moi-drawer-link"
              onClick={() => setDrawerOpen(false)}
              {...prefetchOnIntent('/history')}
            >
              <NavIcon spec={iconHistory} />
              {copy.nav.history}
            </NavLink>
            <NavLink
              to="/review"
              className="moi-drawer-link"
              onClick={() => setDrawerOpen(false)}
              {...prefetchOnIntent('/review')}
            >
              <NavIcon spec={iconBookmark} />
              {copy.nav.review}
            </NavLink>
            <NavLink
              to="/account"
              className="moi-drawer-link"
              onClick={() => setDrawerOpen(false)}
              {...prefetchOnIntent('/account')}
            >
              <NavIcon spec={iconAccount} />
              {copy.nav.account}
            </NavLink>
          </nav>
          {/* 로그아웃 액션 — 성공하면 Drawer를 닫는다(#234/ADR-0072). */}
          <LogoutAction
            className="moi-drawer-action"
            pending={pending}
            onLogout={onLogout}
            onSuccess={() => setDrawerOpen(false)}
          />
        </div>
      </Drawer>
    </>
  );
}
