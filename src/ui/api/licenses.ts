// 정적 고지 로더 (이슈 #121, ADR-0029). 생성 고지(THIRD_PARTY_NOTICES.md)를 JS 번들에
// 인라인하지 않고 ?url 정적자산으로 배포한 뒤, 런타임에 기존 same-origin Ky client로
// 읽어 순수 parser로 구조화한다. 세션(/api/me)과 무관 — 공개 열람은 어떤 세션 상태에도
// 의존하지 않는다.
import noticesUrl from '../../../THIRD_PARTY_NOTICES.md?url';
import { parseNotices, type LicenseNotice } from '../licenses/parser';
import type { ApiClient } from './client';

export const noticesAssetUrl = noticesUrl;

export async function loadNotices(client: ApiClient): Promise<LicenseNotice[]> {
  // ky prefix('/') 사용 방식이 클라이언트 전체 규약 — 선행 슬래시는 제거해 전달한다.
  const text = await client.get(noticesAssetUrl.replace(/^\//, '')).text();
  // 자산 누락 시 SPA fallback이 200으로 HTML을 돌려줄 수 있다 — HTML·빈 본문·0건 파싱을
  // 전부 오류로 처리해 재시도 가능하게 한다. parseNotices의 범용 빈입력 계약([])은 유지.
  const trimmed = text.trim();
  if (
    trimmed.length === 0 || // 빈 본문
    /^<!doctype html/i.test(trimmed) || /<html[\s>]/i.test(trimmed) // SPA fallback HTML
  ) {
    throw new Error('라이선스 고지 자산이 응답하지 않았습니다(HTML/빈 본문)');
  }
  const rows = parseNotices(trimmed);
  if (rows.length === 0) {
    throw new Error('라이선스 고지 자산에서 유효한 표행을 찾지 못했습니다');
  }
  return rows; // fail-closed: 5셀 외 표행 throw
}
