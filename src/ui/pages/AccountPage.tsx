import { copy } from '../copy';
import type { MeUser } from '../api/client';
import { formatDateTime } from '../study/types';
import '../account.css';

/**
 * 계정 — 가입일·최근 로그인·로그인 방식(카카오) 정보 + 위험 영역(탈퇴) 안내.
 * - 내부 UUID·Kakao sub·세션 ID는 표시하지 않는다(#234/ADR-0072).
 * - 로그아웃은 계정 본문이 아니라 내비게이션(데스크톱 nav·모바일 Drawer) 액션이다.
 * - 탈퇴는 정책 미확정 상태의 안내 + 비활성 버튼까지만 노출한다 — 삭제·완료 표시 없음.
 */
export function AccountPage({ user }: { user: MeUser }) {
  return (
    <section className="moi-page moi-account" aria-label={copy.account.title}>
      <h1 className="moi-account-title">{copy.account.title}</h1>
      <p className="moi-lead">{copy.account.loggedIn}</p>

      <section className="moi-account-section" aria-label={copy.account.infoTitle}>
        <h2 className="moi-account-section-title">{copy.account.infoTitle}</h2>
        <dl className="moi-account-list">
          <div className="moi-account-row">
            <dt className="moi-account-term">{copy.account.loginMethodLabel}</dt>
            <dd className="moi-account-value">{copy.account.loginMethod}</dd>
          </div>
          <div className="moi-account-row">
            <dt className="moi-account-term">{copy.account.joinedAtLabel}</dt>
            {/* 초/ms·0·null·손상 값·하한 미만 값은 formatDateTime이 '정보 없음'으로 되돌린다(1970 오표기 방지, #212·#260). */}
            <dd className="moi-account-value">{formatDateTime(user.createdAt)}</dd>
          </div>
          <div className="moi-account-row">
            <dt className="moi-account-term">{copy.account.lastLoginLabel}</dt>
            <dd className="moi-account-value">{formatDateTime(user.lastLoginAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="moi-account-section moi-account-danger" aria-label={copy.account.dangerTitle}>
        <h2 className="moi-account-section-title">{copy.account.dangerTitle}</h2>
        <p className="moi-account-danger-text">{copy.account.dangerDescription}</p>
        <p className="moi-account-danger-text">{copy.account.dangerNote}</p>
        <button type="button" className="moi-account-withdraw" disabled aria-disabled="true">
          {copy.account.withdrawAction}
        </button>
        <p className="moi-note">{copy.account.withdrawHint}</p>
      </section>
    </section>
  );
}
