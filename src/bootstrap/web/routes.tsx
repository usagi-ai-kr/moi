// SPA 라우트 경계 (이슈 #121, ADR-0029). 홈 App과 공개 /licenses를 분리해
// 로그인 없이 기술 고지를 열람할 수 있게 한다. /licenses는 App 세션 hooks(/api/me)를
// 타지 않으므로 세션 네트워크 오류가 공개 열람을 막지 않는다.
// 라우팅 전면개편(meta/SEO, #72)은 범위 밖 — 나머지 모든 경로는 기존 App으로 회귀시킨다.
import { StrictMode, Suspense, lazy, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter/index.css';
import '@/ui/styles.css';
import '@/ui/widgets.css';
import { applyTokens } from '@/ui/tokens';
import { copy } from '@/ui/copy';
import { App } from '@/ui/App';
import { createApiClient, type ApiClient } from '@/ui/api/client';

// 고지 전체 텍스트는 lazy 청크로 분리 — 홈 초기 번들에 포함하지 않는다 (이슈 #121).
const LicensePage = lazy(() =>
  import('@/ui/licenses/LicensePage').then((m) => ({ default: m.LicensePage })),
);

applyTokens();

function LicenseSuspense({ client }: { client: ApiClient }) {
  return (
    <Suspense
      fallback={
        <p className="moi-note" role="status" aria-live="polite">
          {copy.licenses.loading}
        </p>
      }
    >
      <LicensePage client={client} />
    </Suspense>
  );
}

export function Root() {
  const [queryClient] = useState(() => new QueryClient());
  const [apiClient] = useState(() => createApiClient());
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/licenses" element={<LicenseSuspense client={apiClient} />} />
            {/* `/` 포함 기존 모든 URL(콜백 query param 포함)은 App이 그대로 처리한다 */}
            <Route path="*" element={<App client={apiClient} />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>
  );
}
