import { copy } from './copy';

/**
 * 앱 버전·빌드 일자 표시 — 마일스톤 단일 소스에서 주입된 값만 쓴다(고정값 없음).
 * - 형태: `v{버전} ({빌드일자})` · 빌드일자는 KST 기준 yy-MM-dd
 * - 색: shadcn 토큰 `text-muted-foreground` (본문 대비 4.5:1 이상 검증)
 * - 중앙 정렬: 콘텐츠 열 가운데
 */
export function VersionFooter() {
  return (
    <footer className="moi-version-footer mt-8 text-center text-sm text-muted-foreground">
      {copy.version.footer(__APP_VERSION__, __BUILD_DATE__)}
    </footer>
  );
}
