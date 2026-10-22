// 빌드 시 vite define 으로 주입되는 앱 버전·배포 PR·빌드 시각.
// 출처: scripts/resolve-version.mjs → vite.config.ts define.
declare const __APP_VERSION__: string;
declare const __BUILD_PR__: number | null;
declare const __BUILD_TIME__: string;
