import { describe, expect, it, vi } from 'vitest';
import { formatBuildInfo, logBuildInfo } from '../../../../src/bootstrap/web/build-info';

describe('formatBuildInfo', () => {
  it('버전·PR 번호·KST 빌드 시각을 한 줄로 만든다', () => {
    expect(
      formatBuildInfo({
        version: '0.2.5',
        pullRequest: 348,
        buildTime: '2026-10-22 16:30',
      }),
    ).toBe('moi v0.2.5 · #348 · 2026-10-22 16:30 KST');
  });

  it('PR 번호를 알 수 없으면 #unknown으로 표시한다', () => {
    expect(
      formatBuildInfo({
        version: '0.2.5',
        pullRequest: null,
        buildTime: '2026-10-22 16:30',
      }),
    ).toBe('moi v0.2.5 · #unknown · 2026-10-22 16:30 KST');
  });

  it('한 줄을 console.info에 한 번 출력한다', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      logBuildInfo({ version: '0.2.5', pullRequest: 348, buildTime: '2026-10-22 16:30' });
      expect(log).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith('moi v0.2.5 · #348 · 2026-10-22 16:30 KST');
    } finally {
      log.mockRestore();
    }
  });
});
