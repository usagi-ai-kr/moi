import { useCallback, useRef } from 'react';

// #270 동기 in-flight 가드 — isPending 리렌더 이전 연속 호출 차단.
// TanStack isPending은 비동기 플러시 뒤에 바뀌어 Enter·더블클릭 경합을 막지 못한다.
// ref는 동기 플립이라 같은 틱 중복을 1회로 제한하고 settled에서 해제해 재시도한다.
export function useInFlightGuard() {
  const ref = useRef(false);
  const tryAcquire = useCallback((isPending: boolean) => {
    if (ref.current || isPending) return false;
    ref.current = true;
    return true;
  }, []);
  const release = useCallback(() => {
    ref.current = false;
  }, []);
  return { tryAcquire, release };
}
