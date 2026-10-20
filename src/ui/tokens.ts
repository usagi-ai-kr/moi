// 디자인 토큰 — 단일 소스 (ADR-0012). 색·박스모델·타이포·모션 값은 여기서만 수정한다.
// CSS는 var(--moi-*)로만 소비하고, AntD 테마(theme.ts)도 이 값으로 구성한다.

export const colors = {
  orange: '#FF9900', // AWS Orange — 유일한 액센트
  ink: '#232F3E', // AWS Squid Ink — 텍스트/어두운 서피스
  muted: '#6B7280',
  border: '#E5E7EB',
  surface: '#F7F8FA',
  white: '#FFFFFF',
  danger: '#F5222D', // AntD red-6 — 로그아웃·오류 강조 (tokens 단일 소스 유지)
  warning: '#FAAD14', // AntD gold-6 — 경고 강조
  scrim: 'rgb(35 47 62 / 45%)', // Drawer 백드롭 — ink 45% (토큰 단일 소스)
} as const;

// 카카오 로그인 버튼 — 카카오 공식 디자인 가이드 값(변경 금지, ADR-0014)
// https://developers.kakao.com/docs/latest/ko/kakaologin/design-guide
export const kakao = {
  container: '#FEE500',
  symbol: '#000000',
  label: 'rgba(0, 0, 0, 0.85)',
  height: 46, // 표준 버튼 높이 — 비례 유지
  symbolSize: 13,
  labelSize: 15,
  maxWidth: 360, // 컨테이너 확장은 좌우 동일 폭으로 — 콘텐츠 중앙 정렬
} as const;

export const space = {
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 24,
  '6': 32,
  '7': 48,
  '8': 64,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
} as const;

export const layout = {
  containerMaxWidth: 960,
  // 큰 화면의 읽기 열 — 헤더 내부와 본문이 같은 폭을 공유한다 (#148 6항).
  readingMaxWidth: 720,
  headerHeight: 56,
  // 로그인 후 셸 헤더 실측 높이 — 브랜드 링크 44px + 헤더 패딩 8px×2 + 하단 테두리 1px (#215).
  shellHeaderHeight: 61,
  containerPaddingX: 'clamp(16px, 5vw, 32px)',
  accentWidth: 48,
  accentHeight: 4,
  enterShift: 8,
  controlHeight: 40,
  touchTargetMin: 44, // 접근성: 터치 타깃 최소
  drawerWidthMax: 320, // Drawer 최대 폭(20rem) — 320px 뷰포트에서 272px가 된다 (#215)
  drawerViewportGap: 48, // Drawer와 화면단 사이 최소 여백(3rem) — 백드롭 클릭 영역 확보
} as const;

export const typography = {
  fontDisplay:
    "'KoddiUDOngodic', 'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
  fontUi:
    "'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
  displayFontFamily: 'KoddiUDOngodic',
  // 눈누가 제공하는 공식 웹폰트 경로 — 형태 그대로·수정/재배포 금지라 저장소에 파일을 두지 않는다 (ADR-0014)
  displayFontUrl:
    'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105_2@1.0/KoddiUDOnGothic-Bold.woff',
  baseSize: 18,
  sizes: {
    brand: '22px',
    h1: 'clamp(34px, 7vw, 48px)',
    h2: '26px',
    lead: 'clamp(18px, 2.4vw, 20px)',
    small: '16px', // DESIGN.md 보조 설명 최소 16px (#182)
  },
  lineHeights: {
    tight: 1.15,
    normal: 1.6,
  },
} as const;

export const motion = {
  fast: 160,
  base: 240,
  enter: 320,
  ease: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export const breakpoints = {
  tablet: 768,
  desktop: 1200,
} as const;

// 해설 다이어그램(Pele) — 중앙값만 사용, 컴포넌트에 리터럴 금지 (ADR-0012).
export const diagram = {
  renderTimeoutMs: 8000,
  directionBreakpoint: 640,
} as const;

const px = (n: number) => `${n}px`;

/** CSS 변수 매핑 — styles.css는 이 이름들만 사용한다 */
export const cssVars: Record<string, string> = {
  ...Object.fromEntries(Object.entries(colors).map(([k, v]) => [`--moi-color-${k}`, v])),
  ...Object.fromEntries(Object.entries(space).map(([k, v]) => [`--moi-space-${k}`, px(v)])),
  ...Object.fromEntries(Object.entries(radius).map(([k, v]) => [`--moi-radius-${k}`, px(v)])),
  '--moi-container-max': px(layout.containerMaxWidth),
  '--moi-reading-max': px(layout.readingMaxWidth),
  '--moi-header-h': px(layout.headerHeight),
  '--moi-shell-header-h': px(layout.shellHeaderHeight),
  '--moi-drawer-w-max': px(layout.drawerWidthMax),
  '--moi-drawer-gap': px(layout.drawerViewportGap),
  '--moi-container-pad-x': layout.containerPaddingX,
  '--moi-accent-w': px(layout.accentWidth),
  '--moi-accent-h': px(layout.accentHeight),
  '--moi-enter-shift': px(layout.enterShift),
  '--moi-control-h': px(layout.controlHeight),
  '--moi-touch-min': px(layout.touchTargetMin),
  '--moi-font-display': typography.fontDisplay,
  '--moi-font-ui': typography.fontUi,
  '--moi-size-body': px(typography.baseSize),
  ...Object.fromEntries(Object.entries(typography.sizes).map(([k, v]) => [`--moi-size-${k}`, v])),
  '--moi-kakao-container': kakao.container,
  '--moi-kakao-symbol': kakao.symbol,
  '--moi-kakao-label': kakao.label,
  '--moi-kakao-h': px(kakao.height),
  '--moi-kakao-symbol-size': px(kakao.symbolSize),
  '--moi-kakao-label-size': px(kakao.labelSize),
  '--moi-kakao-max-w': px(kakao.maxWidth),
  '--moi-lh-tight': String(typography.lineHeights.tight),
  '--moi-lh-normal': String(typography.lineHeights.normal),
  '--moi-motion-fast': `${motion.fast}ms`,
  '--moi-motion-base': `${motion.base}ms`,
  '--moi-motion-enter': `${motion.enter}ms`,
  '--moi-ease': motion.ease,
};

/** tokens.ts 값을 문서 루트 CSS 변수로 주입한다 (React 렌더 이전에 호출). */
export function applyTokens(): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(cssVars)) {
    root.style.setProperty(name, value);
  }
}
