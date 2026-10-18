# 보안 정책

## 신고 경로

취약점을 발견하면 공개 이슈·PR·토론에 내용을 올리지 말고, GitHub의 **private vulnerability reporting**(저장소 Security 탭)을 사용한다. 재현에 필요한 최소 정보만 적고, 실제 비밀값·토큰은 절대 포함하지 않는다.

## 공개 이슈·PR에 쓰지 말 것

- PASETO·세션 토큰, Kakao 인가 코드·토큰·client secret, Cloudflare Secrets 값.
- Set-Cookie 원문, `Authorization` 헤더 값, state/nonce 원문.
- 실제 사용자 개인정보(이메일·계정 식별자 등).

로그·스크린샷을 첨부할 때는 위 항목을 redaction한 뒤 올린다. 실수로 올렸다면 즉시 이슈 본문을 수정하고(히스토리는 남으므로) Secret은 교체한다.

## 지원 버전

- 개발 중인 `0.1.x`와 최신 릴리스 브랜치(`release/<minor>`)만 보안 수정을 받는다. 구 버전은 업그레이드를 권장한다.

## 참고 규칙

- `AGENTS.md`의 보안·데이터 규칙(서버 측 검증·HttpOnly 쿠키·D1 진실 원천)이 그대로 적용된다.
- 지원 종료·예외는 ADR로 기록한다.
