// 학습 세트 URL 동기화 — ?study=<setId> 파라미터 읽기/쓰기 (#148 라우트 분리).
// useStudyFlow 에서 추출했다(#268 Slice 2C — 모듈 250줄 상한 해소, ADR-0015 모듈 길이 예산).
// 동작·서명은 그대로다.

export function readStudyParam(): string | null {
  try {
    return new URL(window.location.href).searchParams.get('study');
  } catch {
    return null;
  }
}

export function writeStudyParam(id: string | null): void {
  try {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set('study', id);
    else u.searchParams.delete('study');
    window.history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
  } catch {
    // URL 동기화 실패는 무시 — 메모리 상태로 계속한다.
  }
}
