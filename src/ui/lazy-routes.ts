// 라우트 청크 importer — React.lazy와 prefetch가 같은 specifier를 공유해 중복 요청을 막는다 (#184).
// prefetch는 hover/focus/touch 시점에 청크만 미리 받아두며 데이터 요청은 하지 않는다.
export type PrefetchPath = '/' | '/history' | '/review' | '/concepts' | '/account';
export type PrefetchLoader = () => Promise<unknown>;

export const importHistory = () =>
  import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage }));

export const importReview = () =>
  import('./review/ReviewScreen').then((m) => ({ default: m.ReviewScreen }));

export const importConcepts = () =>
  import('./concepts/ConceptWikiScreen').then((m) => ({ default: m.ConceptWikiScreen }));

export const importAccount = () =>
  import('./pages/AccountPage').then((m) => ({ default: m.AccountPage }));

const LOADERS: Partial<Record<PrefetchPath, PrefetchLoader>> = {
  '/history': importHistory,
  '/review': importReview,
  '/concepts': importConcepts,
  '/account': importAccount,
};

/** 경로별 prefetch 함수를 만든다 — 테스트에서 importer를 주입할 수 있게 분리했다. */
export function createPrefetch(
  loaders: Partial<Record<PrefetchPath, PrefetchLoader>> = LOADERS,
): (to: PrefetchPath) => void {
  const started = new Set<PrefetchPath>();

  return (to) => {
    const load = loaders[to];
    if (!load || started.has(to)) return;
    started.add(to);
    // 실패한 청크는 Set에서 제거해 다음 hover/focus에서 다시 시도할 수 있게 한다.
    try {
      void load().catch(() => started.delete(to));
    } catch {
      started.delete(to);
    }
  };
}

export const prefetchRoute = createPrefetch();
