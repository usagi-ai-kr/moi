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
  session: {
    checking: '로그인 상태를 확인하고 있습니다',
    welcome: '학습을 시작할 준비가 되었습니다',
    logout: '로그아웃',
    loggingOut: '로그아웃하고 있습니다',
    account: '내 계정',
    retry: '다시 시도',
    loginAgain: '로그인하기',
    dismiss: '닫기',
    authError: '로그인이 취소되었거나 오류가 발생했습니다. 다시 시도해 주세요.',
    loadError: '상태를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.',
  },
} as const;
