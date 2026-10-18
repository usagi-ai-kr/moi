/**
 * 내부 사용자·외부 계정 매핑 도메인 타입과 불변식 (이슈 #3, ADR-0004).
 * - 내부 UUID `user_id`가 데이터 소유권 기준이다. 세션(#4)의 PASETO sub도 이 값이다.
 * - 이메일/닉네임/동의 상태는 핵심키·필수 요소가 아니다(컬럼·필드 없음).
 * - 외부 패키지·Drizzle 타입 의존 금지 — 영속 행과의 변환은 infra mapper가 담당한다.
 */

export type ExternalAuthProvider = 'kakao';

/** 내부 사용자 식별자 (UUID). */
export type UserId = string;

/** 내부 사용자 행 — 시간은 epoch seconds. */
export interface User {
  readonly id: UserId;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** 외부 계정 매핑 — `(provider, provider_subject)`가 내부 user_id에 1:1 대응한다. */
export interface ExternalIdentity {
  readonly provider: ExternalAuthProvider;
  readonly providerSubject: string;
  readonly userId: UserId;
  readonly createdAt: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 내부 user_id 불변식 — UUID 형식이어야 한다(외부 sub를 그대로 쓰지 않는다). */
export function isValidUserId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export interface ExternalIdentityInput {
  readonly provider: ExternalAuthProvider;
  readonly providerSubject: string;
}

/**
 * 외부 계정 식별 쌍 불변식 — provider는 허용 목록(kakao), subject는 비어 있지 않아야 한다.
 * 검증 실패 시 오류를 던진다(호출자는 영속 계층에 도달하지 않는다).
 */
export function assertValidExternalIdentity(input: ExternalIdentityInput): void {
  if (input.provider !== 'kakao') {
    throw new Error('identity: unsupported provider');
  }
  if (typeof input.providerSubject !== 'string' || input.providerSubject.length === 0) {
    throw new Error('identity: provider_subject must be non-empty');
  }
}
