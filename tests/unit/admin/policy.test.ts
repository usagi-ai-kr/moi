import { describe, expect, it } from 'vitest';
import { canRead, canWrite, parseBearerToken } from '@/app/admin/policy';

// 이슈 #47 — Bearer 파싱·스코프 행렬 단위 테스트.

describe('parseBearerToken', () => {
  it('Bearer 토큰을 추출한다', () => {
    expect(parseBearerToken('Bearer abc123')).toBe('abc123');
  });

  it('없음·형식 오류는 null이다', () => {
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken('abc123')).toBeNull();
    expect(parseBearerToken('Bearer ')).toBeNull();
    expect(parseBearerToken('Basic abc123')).toBeNull();
  });
});

describe('scope 행렬', () => {
  it('write는 읽기 포함, read는 쓰기 불가', () => {
    expect(canWrite('questions:write')).toBe(true);
    expect(canRead('questions:write')).toBe(true);
    expect(canWrite('questions:read')).toBe(false);
    expect(canRead('questions:read')).toBe(true);
  });

  it('알 수 없는 스코프는 권한 없음', () => {
    expect(canRead('admin')).toBe(false);
    expect(canWrite('admin')).toBe(false);
    expect(canRead('')).toBe(false);
  });
});
