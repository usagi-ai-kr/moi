// 공개 기술 고지 페이지 (이슈 #121, ADR-0029). 로그인 없이 /licenses에서
// THIRD_PARTY_NOTICES.md의 실제 95개 버전별 고지를 열람한다.
// 고지 원문은 정적자산을 런타임에 로딩(useQuery: 로딩/오류/재시도, 세션 API와 무관).
// HTML 주입 금지 — 모든 원문 데이터는 JSX 텍스트 노드로만 렌더한다.
import { useQuery } from '@tanstack/react-query';
import { loadNotices, noticesAssetUrl } from '../api/licenses';
import type { ApiClient } from '../api/client';
import { copy } from '../copy';
import './licenses.css';

// 미확인('확인 필요') 행을 숨기거나 법률 승인/모든 고지 완료로 표현하지 않는다.
function LicenseCard({ notice }: { notice: { name: string; version: string; license: string; copyright: string; url: string } }) {
  return (
    <li className="moi-license-card">
      <h2 className="moi-license-name">
        {notice.name} <span className="moi-license-version">{notice.version}</span>
      </h2>
      <p className="moi-license-license">
        <span className="moi-license-col">{copy.licenses.columns.license}</span>{' '}
        <span className="moi-license-badge">{notice.license}</span>
      </p>
      <p className="moi-license-copyright moi-license-wrap">
        <span className="moi-license-col">{copy.licenses.columns.copyright}</span>{' '}
        <span className={notice.copyright === '확인 필요' ? 'moi-license-unverified' : undefined}>
          {notice.copyright}
        </span>
      </p>
      <p className="moi-license-url moi-license-wrap">
        <span className="moi-license-col">{copy.licenses.columns.url}</span>{' '}
        <a href={notice.url} target="_blank" rel="noreferrer" className="moi-license-source">
          {notice.url}
        </a>
      </p>
    </li>
  );
}

// 로딩·오류 화면도 공개 페이지 골격(헤더·푸터)을 유지해 진입 맥락을 잃지 않게 한다.
export function LicensePage({ client }: { client: ApiClient }) {
  const noticesQuery = useQuery({
    queryKey: ['licenses-notices'],
    queryFn: () => loadNotices(client),
    retry: false,
  });
  const notices = noticesQuery.data;
  const unverified = notices?.filter((n) => n.copyright === '확인 필요').length ?? 0;
  return (
    <>
      <header className="moi-header">
        <div className="moi-container moi-header-inner">
          <a href="/" className="moi-brand moi-license-brand">
            {copy.brand}
          </a>
          <span className="moi-brand-sub">{copy.tagline}</span>
        </div>
      </header>
      <main className="moi-main">
        <div className="moi-container moi-main-inner moi-enter" aria-label={copy.licenses.heading}>
          <div className="moi-accent" aria-hidden="true" />
          <h1 className="moi-title">{copy.licenses.title}</h1>
          {/* LCP: caution 문단은 로딩·오류·성공 모든 분기에서 골격에 초기 렌더된다(문구 불변). */}
          <p className="moi-license-caution">{copy.licenses.unverifiedNote}</p>
          {noticesQuery.isPending && (
            <p className="moi-note" role="status" aria-live="polite">
              {copy.licenses.loading}
            </p>
          )}
          {noticesQuery.isError && (
            <>
              <p className="moi-note" role="alert">
                {copy.licenses.loadError}
              </p>
              <p>
                <button type="button" className="moi-study-open" onClick={() => void noticesQuery.refetch()}>
                  {copy.licenses.retry}
                </button>
              </p>
            </>
          )}
          {notices && (
            <>
              <p className="moi-note" aria-label={copy.licenses.totalLabel}>
                {copy.licenses.totalCount(notices.length)} / {copy.licenses.unverifiedCount(unverified)}
              </p>
              <p className="moi-license-download-row">
                <a href={noticesAssetUrl} download="THIRD_PARTY_NOTICES.md" className="moi-license-action">
                  {copy.licenses.download}
                </a>
              </p>
              <ol className="moi-license-list">
                {notices.map((notice) => (
                  <LicenseCard key={`${notice.name}@${notice.version}`} notice={notice} />
                ))}
              </ol>
            </>
          )}
        </div>
      </main>
      <footer className="moi-footer">
        <div className="moi-container">
          <a href="/" className="moi-footer-link">
            {copy.licenses.backHome}
          </a>
        </div>
      </footer>
    </>
  );
}
