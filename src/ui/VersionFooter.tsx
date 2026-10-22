import { copy } from './copy';

/**
 * 앱 버전만 표시 — 마일스톤 단일 소스에서 주입된 값만 쓴다(고정값 없음).
 * - 중앙 정렬과 muted 색상은 유지하고 날짜·PR 정보는 푸터에 표시하지 않는다.
 * - 색: shadcn 토큰 `text-muted-foreground` (본문 대비 4.5:1 이상 검증)
 * - 중앙 정렬: 콘텐츠 열 가운데
 */
export function VersionFooter() {
  return (
    <footer className="moi-version-footer mt-8 text-center text-sm text-muted-foreground">
      {copy.version.footer(__APP_VERSION__)}
    </footer>
  );
}
