// THIRD_PARTY_NOTICES.md 원문 표를 그대로 구조화하는 순수 함수 (이슈 #121, ADR-0029).
// 셀 문자열은 원문 그대로('확인 필요' 포함)이며, 화면은 이를 JSX 텍스트 노드로만 렌더한다.
// 생성 고지는 JS 번들에 인라인(?raw)하지 않는다 — 서버 코드 흔적(drizzle-orm/paseto-ts 등
// 의존성 이름 문자열)이 번들 검사(check-browser-bundle)에서 서버 유출로 거부된다(ADR-0029).
// 원문은 ?url 정적자산으로만 배포하고, 런타임 로더(src/ui/api/licenses.ts)가 읽어 본 함수에
// 전달한다. 잘못된 표행은 조용히 누락하지 않는다 — 파싱은 fail-closed.
export interface LicenseNotice {
  name: string;
  version: string;
  license: string;
  copyright: string;
  url: string;
}

export function parseNotices(markdown: string): LicenseNotice[] {
  const rows: LicenseNotice[] = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('| ')) continue;
    const cells = line.trim().replace(/^\| /, '').replace(/ \|$/, '').split(' | ');
    const isHeader = cells[0] === '패키지';
    const isSeparator = cells.length === 5 && cells.every((c) => /^-{3,}$/.test(c));
    if (isHeader || isSeparator) continue;
    if (cells.length !== 5) {
      throw new Error('THIRD_PARTY_NOTICES 표행이 5셀 형식이 아닙니다 — 생성기를 재실행하세요');
    }
    rows.push({
      name: cells[0],
      version: cells[1],
      license: cells[2],
      copyright: cells[3],
      url: cells[4],
    });
  }
  return rows;
}
