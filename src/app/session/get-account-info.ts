import { isValidUserId } from '@/domain/identity/user';
import type { AccountInfo, AccountInfoRepository } from './ports';

/**
 * 계정 정보 조회 use case (이슈 #234, ADR-0072).
 * - `/api/me`가 로그인 사용자의 가입일·최근 로그인을 함께 돌려주기 위한 읽기 전용 조회다.
 * - 내부 user_id(UUID)만 받는다 — 외부 sub·세션 식별자는 이 경로에 들어오지 않는다.
 * - 값이 없으면 '없음(null)'으로 돌려준다 — 화면은 '정보 없음'으로 표기하고 1970 날짜를 만들지 않는다.
 */

export interface GetAccountInfoDeps {
  readonly accountRepository: AccountInfoRepository;
}

export interface GetAccountInfoInput {
  /** 내부 사용자 UUID. */
  readonly userId: string;
}

export type GetAccountInfoResult =
  | { readonly outcome: 'found'; readonly account: AccountInfo }
  | { readonly outcome: 'missing' };

export async function getAccountInfo(
  deps: GetAccountInfoDeps,
  input: GetAccountInfoInput,
): Promise<GetAccountInfoResult> {
  // 내부 UUID 형식이 아니면 조회하지 않는다 — 외부 sub가 저장소 경로에 들어가지 않게 한다.
  if (!isValidUserId(input.userId)) {
    return { outcome: 'missing' };
  }
  const account = await deps.accountRepository.findAccountInfo({ userId: input.userId });
  if (account === null) {
    return { outcome: 'missing' };
  }
  return { outcome: 'found', account };
}
