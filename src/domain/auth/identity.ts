/**
 * 검증된 외부 인증 identity (ADR-0003).
 * `sub`는 카카오 회원번호 원문이므로 로그·브라우저 응답으로 내보내지 않는다(ADR-0006).
 * 영속 저장(#3)과 세션 발급(#4)은 이 타입을 소비하는 후속 단위의 책임이다.
 */
export interface OAuthIdentity {
  readonly provider: 'kakao';
  readonly sub: string;
}
