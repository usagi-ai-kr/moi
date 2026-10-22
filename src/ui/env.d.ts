// 빌드 시 vite define 으로 주입되는 앱 버전·빌드 일자 (마일스톤 단일 소스).
// 출처: scripts/resolve-version.mjs → vite.config.ts define (__APP_VERSION__·__BUILD_DATE__).
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
