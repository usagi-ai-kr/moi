import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { getMe, logout, type ApiClient } from './api/client';

export type { ApiClient };

// 서버 진실 원천: TanStack Query 키 ['me'] (ADR-0018).
export const ME_QUERY_KEY = ['me'] as const;

// 일시 UI 상태만 — 사용자 객체/토큰 저장 금지 (ADR-0018).
interface UiState {
  authBannerDismissed: boolean;
  dismissAuthBanner: () => void;
  resetAuthBanner: () => void;
  logoutPending: boolean;
  setLogoutPending: (pending: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  authBannerDismissed: false,
  dismissAuthBanner: () => set({ authBannerDismissed: true }),
  resetAuthBanner: () => set({ authBannerDismissed: false }),
  logoutPending: false,
  setLogoutPending: (pending: boolean) => set({ logoutPending: pending }),
}));

// 내부 id 노출 최소화 — 앞 4자 + 마스킹 (ADR-0018).
export function maskUserId(id: string): string {
  if (id.length <= 6) return '••••••';
  return `${id.slice(0, 4)}••••${id.slice(-2)}`;
}

// GET /api/me 구독 — 401은 비로그인(null), 그 외 오류는 throw.
export function useSessionId(client: ApiClient): {
  status: 'loading' | 'logged-out' | 'logged-in' | 'error';
  userId: string | null;
  retry: () => void;
} {
  const query = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => getMe(client),
    retry: false,
    staleTime: 30_000,
  });
  if (query.isPending) return { status: 'loading', userId: null, retry: query.refetch };
  if (query.isError) return { status: 'error', userId: null, retry: () => void query.refetch() };
  if (query.data === null) return { status: 'logged-out', userId: null, retry: () => void query.refetch() };
  return { status: 'logged-in', userId: query.data, retry: () => void query.refetch() };
}

// 로그아웃 — 성공 후 캐시 무효화 + 제거 (ADR-0018).
export function useLogout(client: ApiClient): () => Promise<void> {
  const queryClient = useQueryClient();
  const setLogoutPending = useUiStore((s) => s.setLogoutPending);
  const mutation = useMutation({
    mutationFn: () => logout(client),
    onSettled: () => {
      setLogoutPending(false);
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
    },
  });
  return async () => {
    setLogoutPending(true);
    try {
      await mutation.mutateAsync();
    } catch {
      setLogoutPending(false);
      throw new Error('logout-failed');
    }
  };
}

// 카카오 callback 쿼리 계약 (ADR-0018): ?auth=success → 정리 + 재조회,
// ?auth=error → 정리 후 true 반환. 원문 오류·토큰은 URL에 두지 않는다.
// 마운트 시점에 한 번만 판정한다 — 쿼리 해결 후 리렌더에서 배너가 사라지지 않게 래치한다.
export function useAuthCallback(flag: 'success' | 'error'): boolean {
  const queryClient = useQueryClient();
  const resetAuthBanner = useUiStore((s) => s.resetAuthBanner);
  const [present] = useState(
    () => typeof window !== 'undefined' && window.location.search.includes(`auth=${flag}`),
  );
  useEffect(() => {
    if (!present) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('auth');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    if (flag === 'success') {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    } else {
      resetAuthBanner();
    }
  }, [present, flag, queryClient, resetAuthBanner]);
  return present;
}
