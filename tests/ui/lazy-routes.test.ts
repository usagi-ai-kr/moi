import { describe, expect, it, vi } from 'vitest';
import { createPrefetch } from '../../src/ui/lazy-routes';

describe('라우트 prefetch (#184)', () => {
  it('같은 경로를 중복 요청하지 않고, 성공 후에도 다시 요청하지 않는다', async () => {
    const load = vi.fn(() => Promise.resolve());
    const prefetch = createPrefetch({ '/history': load });

    prefetch('/history');
    prefetch('/history');
    expect(load).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    prefetch('/history');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('청크 로드가 실패하면 Set에서 제거되어 다음 시도에서 재요청한다', async () => {
    const load = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValueOnce(undefined);
    const prefetch = createPrefetch({ '/history': load });

    prefetch('/history');
    await Promise.resolve();
    await Promise.resolve();

    prefetch('/history');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('prefetch 대상이 없는 경로는 아무 것도 요청하지 않는다', () => {
    const load = vi.fn(() => Promise.resolve());
    const prefetch = createPrefetch({ '/history': load });

    prefetch('/');

    expect(load).not.toHaveBeenCalled();
  });
});
