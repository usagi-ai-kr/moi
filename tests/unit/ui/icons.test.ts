// #233 Slice A — 아이콘 계약·매핑 기반 정적 검증 (ADR-0073, DESIGN.md §4).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as icons from '@/ui/icons';
import * as lucide from 'lucide-react';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const iconExports = Object.entries(icons).filter(
  ([name, value]) => name.startsWith('icon') && !!value && typeof value === 'object',
) as Array<[string, icons.IconSpec]>;

// DESIGN.md §4.2 매핑표를 파싱해 (동작·아이콘·px·aria)를 추출한다.
function parseDesignMapping(): Array<{ action: string; icon: string; size: number; aria: 'hidden' | 'label' }> {
  const design = read('DESIGN.md');
  const start = design.indexOf('### 4.2 매핑표');
  const end = design.indexOf('### 4.3', start);
  const section = design.slice(start, end === -1 ? undefined : end);
  const rows: Array<{ action: string; icon: string; size: number; aria: 'hidden' | 'label' }> = [];
  for (const line of section.split('\n')) {
    const m = line.trim().match(/^\|\s*(.+?)\s*\|\s*`(\w+)`\s*\|\s*(\d+)\s*\|\s*(hidden|label)\s*\|/);
    if (!m) continue;
    rows.push({ action: m[1], icon: m[2], size: Number(m[3]), aria: m[4] as 'hidden' | 'label' });
  }
  return rows;
}

const mapping = parseDesignMapping();

const PRIMARY = [
  'iconMenu', 'iconClose', 'iconSelect', 'iconStart', 'iconResume', 'iconPrev', 'iconNext',
  'iconSubmit', 'iconPass', 'iconUnanswered', 'iconCorrect', 'iconWrong', 'iconBookmark',
  'iconReport', 'iconAbandon', 'iconCancel', 'iconConfirm', 'iconResult', 'iconHistory',
  'iconAnalysis', 'iconRefresh', 'iconLoading', 'iconSaveSuccess', 'iconSaveFailure',
  'iconLogout', 'iconAccount',
];

describe('#233 icons — named export 유일성', () => {
  it('primary 액션 export가 모두 존재한다', () => {
    for (const name of PRIMARY) expect(icons, name).toHaveProperty(name);
  });

  it('export 이름은 중복되지 않고 spec 객체 식별자도 모두 다르다', () => {
    const names = Object.keys(icons).filter((n) => n.startsWith('icon'));
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(Object.values(icons)).size).toBe(Object.values(icons).length);
    expect(names).toHaveLength(PRIMARY.length);
  });

  it('집계 객체/default export를 두지 않는다 (런타임)', () => {
    const src = read('src/ui/icons.ts');
    expect(src).not.toMatch(/export\s+default/);
    for (const value of Object.values(icons)) {
      expect(value).toHaveProperty('icon');
    }
  });
});

describe('#233 icons — IconSpec 메타 유효성', () => {
  it('모든 spec의 size는 16/20/24, aria는 hidden/label이다', () => {
    for (const [name, spec] of iconExports) {
      expect([16, 20, 24], name).toContain(spec.size);
      expect(['hidden', 'label'], name).toContain(spec.aria);
      expect(typeof spec.icon, name).toBe('object');
    }
  });

  it('aria=label인 spec은 labelKey 문자열, hidden은 null이다', () => {
    for (const [name, spec] of iconExports) {
      if (spec.aria === 'label') {
        expect(typeof spec.labelKey, name).toBe('string');
        expect((spec.labelKey as string).length, name).toBeGreaterThan(0);
      } else {
        expect(spec.labelKey, name).toBeNull();
      }
    }
  });
});

describe('#233 icons — Lucide import만 사용', () => {
  it('값 import는 lucide-react에서만 온다', () => {
    const src = read('src/ui/icons.ts');
    const importMatches = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(importMatches.length).toBeGreaterThan(0);
    for (const mod of importMatches) expect(mod).toBe('lucide-react');
    for (const banned of ['react-icons', 'heroicons', 'octicons', '@ant-design']) {
      expect(src.includes(banned)).toBe(false);
    }
  });

  it('모든 export const icon 줄은 /*#__PURE__*/ 로 시작한다 (tree-shaking)', () => {
    const src = read('src/ui/icons.ts');
    const lines = src.split('\n').filter((l) => /^\s*export\s+const\s+icon/.test(l));
    expect(lines.length).toBe(PRIMARY.length);
    for (const line of lines) {
      expect(line.trim().startsWith('export const icon')).toBe(true);
      expect(line).toContain('/*#__PURE__*/');
    }
  });
});

describe('#233 icons — DESIGN.md §4.2 매핑 대조', () => {
  it('매핑표 행 수가 primary export 수와 일치한다', () => {
    expect(mapping.length).toBe(PRIMARY.length);
  });

  it('각 primary export의 아이콘·size·aria가 매핑표와 일치한다', () => {
    expect(mapping.length).toBe(PRIMARY.length);
    mapping.forEach((row, i) => {
      const name = PRIMARY[i];
      const spec = icons[name as keyof typeof icons];
      expect(spec.size, name).toBe(row.size);
      expect(spec.aria, name).toBe(row.aria);
      expect(spec.icon, `${name} identity`).toBe((lucide as Record<string, unknown>)[row.icon]);
    });
  });
});

describe('#233 icons — 집계 객체 금지 (런타임)', () => {
  it('모든 export 값은 icon 속성을 가진 spec이고 중복 필드가 없다', () => {
    for (const [, spec] of iconExports) {
      expect(spec).toHaveProperty('icon');
      expect(Object.prototype.hasOwnProperty.call(spec, 'component')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(spec, 'Icon')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(spec, 'label')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(spec, 'key')).toBe(false);
    }
  });
});