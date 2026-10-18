import { decrypt, encrypt, generateKeys } from 'paseto-ts/v4';
import { describe, expect, it } from 'vitest';

// PASETO v4.local Workers 런타임 스파이크 (이슈 #1 선행): 생성→복호화·변조 거부·키 불일치 거부.
// 실제 세션 발급/폐기는 0.1.3(#4)에서 구현한다.
describe('PASETO v4.local 스파이크 (Workers 런타임)', () => {
  it('생성 → 복호화 왕복', async () => {
    const key = generateKeys('local');
    const token = await encrypt(key, { sub: 'user-1', jti: 'spike-1' });
    expect(token.startsWith('v4.local.')).toBe(true);

    const { payload } = await decrypt<{ sub: string }>(key, token);
    expect(payload.sub).toBe('user-1');
  });

  it('변조된 토큰은 거부한다', async () => {
    const key = generateKeys('local');
    const token = await encrypt(key, { sub: 'user-2' });
    const idx = 'v4.local.'.length + 5;
    const tampered =
      token.slice(0, idx) + (token[idx] === 'A' ? 'B' : 'A') + token.slice(idx + 1);
    await expect(async () => decrypt(key, tampered)).rejects.toThrow();
  });

  it('다른 키로 만든 토큰은 거부한다', async () => {
    const keyA = generateKeys('local');
    const keyB = generateKeys('local');
    const token = await encrypt(keyA, { sub: 'user-3' });
    await expect(async () => decrypt(keyB, token)).rejects.toThrow();
  });
});
