// #132 LCP 정적 셸 — index.html의 첫 화면 문구·토큰 폴백이 단일 소스와 일치하는지 검사한다.
// 정적 셸은 JS 실행 전 첫 페인트를 담당하므로, copy.ts/tokens.ts와 어긋나면 사용자에게
// 다른 문구·스타일이 보이거나 React 마운트 시 레이아웃이 흔들린다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { copy } from '@/ui/copy';
import { cssVars } from '@/ui/tokens';

const html = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

function staticText(className: string): string {
  const match = html.match(new RegExp(`<[a-z0-9]+[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</[a-z0-9]+>`));
  if (!match) throw new Error(`정적 셸에서 .${className}를 찾지 못했습니다`);
  return normalize(match[1].replace(/<[^>]+>/g, ''));
}

describe('정적 셸 문구', () => {
  it('로그아웃 홈 첫 화면이 copy.ts와 같다', () => {
    expect(staticText('moi-brand')).toBe(copy.brand);
    expect(staticText('moi-brand-sub')).toBe(copy.tagline);
    expect(staticText('moi-title')).toBe(copy.brand);
    expect(staticText('moi-lead')).toBe(copy.tagline);
    expect(staticText('moi-note')).toBe(copy.home.note);
  });

  it('#root 안에 정적 셸이 있고 엔트리 스크립트는 그대로다', () => {
    const start = html.indexOf('<div id="root">');
    const end = html.indexOf('<script type="module"');
    expect(start, '#root 시작').toBeGreaterThan(-1);
    expect(end, '엔트리 스크립트').toBeGreaterThan(start);
    const root = html.slice(start, end);
    expect(root).toContain('moi-header');
    expect(root).toContain('moi-title');
    expect(html).toContain('src="/src/bootstrap/web/main.tsx"');
  });
});

describe('정적 셸 토큰 폴백', () => {
  it('index.html의 --moi-* 값이 tokens.ts cssVars와 일치한다', () => {
    const style = html.match(/<style>([\s\S]*?)<\/style>/);
    expect(style, '인라인 토큰 스타일').not.toBeNull();
    const declared = [...(style?.[1] ?? '').matchAll(/(--moi-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1],
      normalize(m[2]),
    ]);
    expect(declared.length).toBeGreaterThan(0);
    for (const [name, value] of declared) {
      expect(cssVars[name], `${name} 토큰 정의`).toBeDefined();
      expect(value, `${name} 값`).toBe(normalize(cssVars[name]));
    }
  });
});
