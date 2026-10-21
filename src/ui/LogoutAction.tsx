import { useRef, useState } from 'react';
import { copy } from './copy';
import { iconLogout } from './icons';

/**
 * 로그아웃 액션 (#234, #258, ADR-0072).
 * - 계정 페이지 이동 링크가 아니라 **실제 액션 버튼**이다 — 데스크톱 nav·모바일 Drawer에 노출한다.
 * - 로그아웃 버튼에 `iconLogout`(20px, 장식 aria-hidden)을 달아 nav 아이콘과 일관되게 한다(#258).
 * - pending 동안 disabled + aria-busy, 실패하면 role="alert" + 재시도를 같은 위치에 보여준다.
 * - 빠른 이중 클릭의 중복 POST를 in-flight ref로 막는다(#260→#258 이동).
 * - 세션 폐기·계정별 초안/탭 상태 정리 계약은 `useLogout`이 그대로 담당한다(여기서 새 계약을 만들지 않는다).
 */
export function LogoutAction({
  pending,
  onLogout,
  onSuccess,
  className,
}: {
  pending: boolean;
  onLogout: () => Promise<void>;
  /** 로그아웃 성공 후 처리(모바일 Drawer 닫기 등). */
  onSuccess?: () => void;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // pending 전파 전 이중 클릭을 동기적으로 차단한다 — 두 번째 POST를 보내지 않는다.
  const inFlight = useRef(false);
  const LogoutIcon = iconLogout.icon;

  const run = async () => {
    if (inFlight.current || pending) return;
    inFlight.current = true;
    setFailed(false);
    try {
      await onLogout();
      onSuccess?.();
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        className="moi-logout-action"
        disabled={pending}
        aria-busy={pending}
        onClick={() => void run()}
      >
        {pending ? (
          <span className="moi-spinner moi-spinner-sm" aria-hidden="true" />
        ) : (
          <LogoutIcon size={iconLogout.size} aria-hidden="true" focusable="false" />
        )}
        {pending ? copy.session.loggingOut : copy.session.logout}
      </button>
      {failed && (
        <div className="moi-logout-error" role="alert">
          <span className="moi-logout-error-text">{copy.session.logoutError}</span>
          <button type="button" className="moi-logout-retry" onClick={() => void run()}>
            {copy.session.retry}
          </button>
        </div>
      )}
    </div>
  );
}
