import { useState } from 'react';
import { copy } from './copy';

/**
 * 로그아웃 액션 (#234, ADR-0072).
 * - 계정 페이지 이동 링크가 아니라 **실제 액션 버튼**이다 — 데스크톱 nav·모바일 Drawer에 노출한다.
 * - pending 동안 disabled + aria-busy, 실패하면 role="alert" + 재시도를 같은 위치에 보여준다.
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

  const run = async () => {
    setFailed(false);
    try {
      await onLogout();
      onSuccess?.();
    } catch {
      setFailed(true);
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
        {pending && <span className="moi-spinner moi-spinner-sm" aria-hidden="true" />}
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
