import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import rawNotices from '../../THIRD_PARTY_NOTICES.md?raw'; // 테스트 전용 ?raw — 프로덕션 번들에는 미포함(브라우저 build 게이트는 src/loader만 검사)
import { loadNotices, noticesAssetUrl } from '../../src/ui/api/licenses';
import { parseNotices } from '../../src/ui/licenses/parser';
import { LicensePage } from '../../src/ui/licenses/LicensePage';
import { copy } from '../../src/ui/copy';
import type { ApiClient } from '../../src/ui/api/client';

// RTL은 원문 자산을 직접 fetch하지 않고 가짜 Ky client(loader mock)를 주입한다.
// 큐가 지정되지 않았거나 소진되면 text가 영구 대기 Promise를 반환해 로딩 상태를 유지한다.
type TextStep = { kind: 'text'; text: string } | { kind: 'error' };
function fakeTextClient(...steps: TextStep[]): ApiClient {
  const queue = [...steps];
  return {
    get: vi.fn(() => ({
      text: () => {
        if (queue.length === 0) return new Promise<never>(() => {}); // 영구 대기(로딩 유지)
        const step = queue.shift() as TextStep; // client.get(...).text()에서 reject되게 한다
        return step.kind === 'error'
          ? Promise.reject(new Error('network down'))
          : Promise.resolve(step.text);
      },
    })),
  } as unknown as ApiClient;
}

const dataStep = (): TextStep => ({ kind: 'text', text: rawNotices });

function renderPage(client: ApiClient): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <LicensePage client={client} />
    </QueryClientProvider>,
  );
}

// ?raw로 원문을 주입 — 로더에 가짜 Ky client로 원문 텍스트만 전달한다(파일시스템 불필요).

describe('parseNotices (원문 표 파싱)', () => {
  it('원문의 95개 버전별 행을 그대로 파싱한다', () => {
    expect(parseNotices(rawNotices)).toHaveLength(95);
  });

  it('첫 행은 원문 셀 값 그대로다', () => {
    expect(parseNotices(rawNotices)[0]).toEqual({
      name: '@ant-design/colors',
      version: '8.0.1',
      license: 'MIT',
      copyright: 'Copyright (c) 2018-present Ant UED, https://xtech.antfin.com/',
      url: 'https://github.com/ant-design/ant-design-colors.git',
    });
  });

  it("저작권 미확인 4건을 '확인 필요'로 그대로 유지한다", () => {
    const unverified = parseNotices(rawNotices).filter((n) => n.copyright === '확인 필요');
    expect(unverified).toHaveLength(4);
  });

  it('헤더·구분선을 제외하고, 빈 입력 0행 계약을 유지한다', () => {
    const parsed = parseNotices(rawNotices);
    expect(parsed.some((n) => n.name === '패키지' || n.name === '---')).toBe(false);
    expect(parseNotices('')).toHaveLength(0);
    expect(parseNotices('# 생성 고지\n> 안내\n')).toHaveLength(0);
  });

  it('잘못된 표행은 조용히 누락되지 않고 throw로 막는다(fail-closed)', () => {
    expect(() => parseNotices(`${rawNotices}| 나쁜행 | 1.0 | MIT | c | u | x |\n`)).toThrow(/5셀/);
    expect(parseNotices(rawNotices)).toHaveLength(95);
  });
});

describe('loadNotices (정적 고지 로더)', () => {
  it('?url 정적자산으로 파싱한다 — 선행 슬래시 제거 경로로 요청한다', async () => {
    expect(noticesAssetUrl.length).toBeGreaterThan(0);
    const client = fakeTextClient(dataStep());
    expect(await loadNotices(client)).toHaveLength(95);
    expect(client.get).toHaveBeenCalledWith(noticesAssetUrl.replace(/^\//, ''));
  });

  it('빈 본문은 오류로 처리한다', async () => {
    await expect(loadNotices(fakeTextClient({ kind: 'text', text: '' }))).rejects.toThrow(/빈 본문/);
  });

  it('SPA fallback HTML(200)도 오류로 처리한다', async () => {
    const html = '<!doctype html><html><body><div id="root"></div></body></html>';
    await expect(loadNotices(fakeTextClient({ kind: 'text', text: html }))).rejects.toThrow(/HTML/);
  });
});

describe('LicensePage', () => {
  it('모든 고지를 렌더한다', async () => {
    renderPage(fakeTextClient(dataStep()));
    await screen.findAllByRole('listitem');
    expect(screen.getAllByRole('listitem')).toHaveLength(95);
    expect(screen.getByRole('heading', { level: 1, name: copy.licenses.title })).toBeVisible();
  });

  it('건수·미확인 상태를 간결하게 표시한다', async () => {
    renderPage(fakeTextClient(dataStep()));
    await screen.findByText(/production 의존성 95개.*저작권 미확인 4개\(원문 표기\)/);
    expect(screen.getByText(copy.licenses.unverifiedNote)).toBeVisible();
  });

  it("'확인 필요' 항목을 숨기지 않고 그대로 보인다", async () => {
    renderPage(fakeTextClient(dataStep()));
    await screen.findAllByText('확인 필요');
    expect(screen.getAllByText('확인 필요')).toHaveLength(4);
  });

  it('원문 고지 다운로드와 홈 복귀 링크를 제공한다', async () => {
    renderPage(fakeTextClient(dataStep()));
    await screen.findAllByText('확인 필요');
    const download = screen.getByRole('link', { name: copy.licenses.download });
    expect(download.getAttribute('download')).toBe('THIRD_PARTY_NOTICES.md');
    expect(download.getAttribute('href')).toBe(noticesAssetUrl);
    expect(screen.getByRole('link', { name: copy.licenses.backHome }).getAttribute('href')).toBe('/');
  });

  it('로딩 화면을 표시한다', async () => {
    renderPage(fakeTextClient()); // 큐 비었음 → 영구 보류
    await screen.findByText(copy.licenses.loading);
  });

  it('오류 화면과 재시도로 고지를 열람한다', async () => {
    renderPage(fakeTextClient({ kind: 'error' }, dataStep()));
    await screen.findByText(copy.licenses.loadError);
    expect(screen.getByRole('button', { name: copy.licenses.retry })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: copy.licenses.retry }));
    await screen.findAllByRole('listitem');
    expect(screen.getAllByRole('listitem')).toHaveLength(95);
  });
});
