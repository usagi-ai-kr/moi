import { describe, expect, it } from 'vitest';
import { createApiClient } from '../../src/ui/api/client';

describe('ui/api/client (스캐폴드 스모크)', () => {
  it('same-origin Ky 클라이언트를 생성한다', () => {
    const client = createApiClient();
    expect(client).toBeTruthy();
    expect(typeof client.get).toBe('function');
  });
});
