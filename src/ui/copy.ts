// UI 문구 — 단일 소스 (ADR-0012). 컴포넌트에 문자열을 하드코딩하지 않는다.
export const copy = {
  brand: 'moi',
  tagline: 'AWS SAA 자격증 학습',
  login: {
    kakao: '카카오 로그인',
  },
  home: {
    note: '0.1.0 스캐폴드 — 카카오 로그인 연동은 다음 업데이트에서 활성화됩니다.',
  },
} as const;
