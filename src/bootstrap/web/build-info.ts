export interface BuildInfo {
  readonly version: string;
  readonly pullRequest: number | null;
  /** KST `yyyy-MM-dd HH:mm` 형식. */
  readonly buildTime: string;
}

/** 콘솔에 출력할 빌드 정보 한 줄을 구성한다. */
export function formatBuildInfo({ version, pullRequest, buildTime }: BuildInfo): string {
  return `moi v${version} · #${pullRequest ?? 'unknown'} · ${buildTime} KST`;
}

/** 앱 부팅 시 bootstrap/web 진입점에서 한 번 호출한다. */
export function logBuildInfo(buildInfo: BuildInfo): void {
  console.info(formatBuildInfo(buildInfo));
}
