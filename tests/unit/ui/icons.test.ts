// #233 Slice A — 아이콘 계약·매핑 기반 정적 검증 (ADR-0073, DESIGN.md §4).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as icons from '@/ui/icons';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const iconExports = Object.entries(icons).filter(
  ([name, value]) => name.startsWith('icon') && value && typeof value === 'object',
) as Array<[string, icons.IconSpec]>;

const PRIMARY = [
  'iconMenu',
  'iconClose',
  'iconSelect',
  'iconStart',
  'iconResume',
  'iconPrev',
  'iconNext',
  'iconSubmit',
  'iconPass',
  'iconUnanswered',
  'iconCorrect',
  'iconWrong',
  'iconBookmark',
  'iconReport',
  'iconAbandon',
  'iconCancel',
  'iconConfirm',
  'iconResult',
  'iconHistory',
  'iconAnalysis',
  'iconRefresh',
  'iconLoading',
  'iconSaveSuccess',
  'iconSaveFailure',
  'iconLogout',
  'iconAccount',
];

describe('#233 icons — named export 유일성', () => {
  it('primary 액션 export가 모두 존재한다', () => {
    for (const name of PRIMARY) {
      expect(icons, name).toHaveProperty(name);
    }
  });

  it('export 이름은 중복되지 않는다', () => {
    const names = Object.keys(icons).filter((n) => n.startsWith('icon'));
    expect(new Set(names).size).toBe(names.length);
  });

  it('집계 객체/default export를 두지 않는다', () => {
    const src = read('src/ui/icons.ts');
    expect(src).not.toMatch(/export\s+default/);
    expect(src).not.toMatch(/export\s+const\s+icons\b/);
  });
});

describe('#233 icons — IconSpec 메타 유효성', () => {
  it('모든 spec의 size는 16/20/24, aria는 hidden/label이다', () => {
    for (const [name, spec] of iconExports) {
      expect([16, 20, 24], name).toContain(spec.size);
      expect(['hidden', 'label'], name).toContain(spec.aria);
      expect(typeof spec.icon, name).toBe('object');
      expect(spec.component, name).toBe(spec.icon);
      expect(spec.Icon, name).toBe(spec.icon);
    }
  });

  it('aria=label인 spec은 labelKey를 가진다', () => {
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
    for (const mod of importMatches) {
      expect(mod, `허용되지 않은 import: ${mod}`).toBe('lucide-react');
    }
    expect(importMatches.length).toBeGreaterThan(0);
    // 혼합 라이브러리/이모지 금지 키워드
    for (const banned of ['react-icons', 'heroicons', 'octicons', '@ant-design']) {
      expect(src.includes(banned), banned).toBe(false);
    }
  });
});

describe('#233 icons — 매핑표 액션 커버리지', () => {
  it('준비 보고서 §2의 모든 동작이 primary export로 커버된다', () => {
    // 25개 동작(저장 성공/실패 분리) → PRIMARY 26개.
    expect(PRIMARY.length).toBeGreaterThanOrEqual(25);
    for (const name of PRIMARY) expect(icons).toHaveProperty(name);
  });
});
