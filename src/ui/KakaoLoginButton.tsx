import { copy } from './copy';

// 카카오 로그인 버튼 — 카카오 공식 디자인 가이드(컨테이너 #FEE500·말풍선 심볼 #000000·radius 12px)를
// 따른다. 심볼 패스는 카카오 공식 리소스(login-complete-ko.svg, developers.kakao.com/tool/resource/login)
// 에서 추출 — 형태·비율·색상 변경 금지. 레이블은 시스템 서체로 렌더한다 (ADR-0014).
export function KakaoLoginButton() {
  return (
    <a className="moi-kakao-login" href="/auth/kakao">
      <svg className="moi-kakao-symbol" viewBox="0 0 13 13" aria-hidden="true" focusable="false">
        <path d="M6.4785 0 C2.8997 0 0 2.4812 0 5.5416 C0 7.5087 1.1994 9.2371 3.0067 10.2198 L2.3956 12.6888 C2.3729 12.7625 2.3907 12.8415 2.4394 12.8959 C2.475 12.9345 2.5236 12.9555 2.5706 12.9555 C2.6112 12.9555 2.6517 12.9415 2.6857 12.9116 L5.3115 10.9919 C5.6892 11.0498 6.0782 11.0814 6.4769 11.0814 C10.0542 11.0814 12.9555 8.6001 12.9555 5.5398 C12.9555 2.4795 10.0558 0 6.4785 0 Z" />
      </svg>
      <span>{copy.login.kakao}</span>
    </a>
  );
}
