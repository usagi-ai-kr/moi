import { describe, expect, it } from 'vitest';
import { BDD_BASE_URL, BDD_PORT, DEFAULT_BDD_PORT, resolvePort } from '../../playwright.config';

// #268 Slice 2C fix r1 — BDD 포트 해석은 순수 함수로 검증한다.
// 숫자만 허용하고 1024~65535 범위 안일 때만 사용, 그 외는 기본값(5173)으로 떨어뜨린다.
describe('BDD 포트 해석 (resolvePort)', () => {
  it('숫자만·1024~65535 범위일 때만 그대로 쓴다', () => {
    expect(resolvePort('5173')).toBe(5173);
    expect(resolvePort('5198')).toBe(5198);
    expect(resolvePort('1024')).toBe(1024);
    expect(resolvePort('65535')).toBe(65535);
  });

  it('숫자가 아니거나 범위 밖이면 기본 포트로 떨어뜨린다', () => {
    // 미지정·빈 값·문자열·부분 숫자·0·범위 밖·음수
    expect(resolvePort(undefined)).toBe(DEFAULT_BDD_PORT);
    expect(resolvePort('')).toBe(DEFAULT_BDD_PORT);
    expect(resolvePort('abc')).toBe(DEFAULT_BDD_PORT);
    expect(resolvePort('0')).toBe(DEFAULT_BDD_PORT);
    expect(resolvePort('5198abc')).toBe(DEFAULT_BDD_PORT);
    expect(resolvePort('70000')).toBe(DEFAULT_BDD_PORT);
    expect(resolvePort('-5')).toBe(DEFAULT_BDD_PORT);
    // 범위 경계 밖
    expect(resolvePort('1023')).toBe(DEFAULT_BDD_PORT);
    expect(resolvePort('65536')).toBe(DEFAULT_BDD_PORT);
    // 숫자만 허용 — 공백·부호·소수·지수 표기는 falls back
    expect(resolvePort(' 5198 ')).toBe(DEFAULT_BDD_PORT);
    expect(resolvePort('5198.0')).toBe(DEFAULT_BDD_PORT);
    expect(resolvePort('5e3')).toBe(DEFAULT_BDD_PORT);
    expect(resolvePort('+5198')).toBe(DEFAULT_BDD_PORT);
  });

  it('기본 포트는 5173 이다(기존 동작 유지)', () => {
    expect(DEFAULT_BDD_PORT).toBe(5173);
  });

  it('설정 배선: PORT 미지정이면 baseURL·webServer 포트는 5173 이다', () => {
    // 이 테스트 프로세스에는 PORT 가 없다 → 기본값 경로 검증.
    expect(BDD_PORT).toBe(DEFAULT_BDD_PORT);
    expect(BDD_BASE_URL).toBe('http://localhost:5173');
  });
});
