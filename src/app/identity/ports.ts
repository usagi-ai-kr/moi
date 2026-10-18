import type { ExternalAuthProvider, ExternalIdentity, User, UserId } from '@/domain/identity/user';

/**
 * 사용자·외부 계정 매핑 영속성 Port (이슈 #3, ADR-0004).
 * 구현은 infra/persistence의 D1/Drizzle 어댑터가 담당하고, app/domain은 DB를 모른다.
 */

export interface UserIdentityRepository {
  /**
   * `(provider, subject)` → 내부 user_id 원자적 resolve-or-create.
   * - 동시 최초 로그인: UNIQUE 충돌 원자적 처리 + 재조회로 수렴(매핑 1건 보장).
   * - 경합 탈락 요청이 만든 고아 user는 소유 조건(id 일치 + identity 미연결) 하에서만 삭제하고,
   *   기존 user row는 절대 삭제하지 않는다.
   */
  resolveOrCreate(input: { provider: ExternalAuthProvider; subject: string; now: number }): Promise<{ userId: UserId }>;
  /** 매핑 행 조회(진단·검증용). */
  findIdentity(input: { provider: ExternalAuthProvider; subject: string }): Promise<ExternalIdentity | null>;
  /** 내부 사용자 조회(진단·검증용). */
  findUser(input: { userId: UserId }): Promise<User | null>;
}

/** ADR-0006 화이트리스트 로그 계약(인증 단위와 동일 형태) — subject·개인정보 원문을 전달할 방법이 없다. */
export interface IdentityEventLogger {
  info(msg: string, outcome?: string): void;
  warn(msg: string, outcome?: string): void;
  error(msg: string, outcome?: string): void;
}
