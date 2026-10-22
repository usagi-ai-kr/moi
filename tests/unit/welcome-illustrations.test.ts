import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WELCOME_ILLUSTRATIONS } from '../../src/ui/welcome-illustrations';

describe('환영 삽화 매핑 (#305)', () => {
  it('32개 매핑이 완전하다', () => {
    expect(WELCOME_ILLUSTRATIONS).toHaveLength(32);
    const ids = WELCOME_ILLUSTRATIONS.map((w) => w.id);
    expect(new Set(ids).size).toBe(32);
  });

  it('모든 매핑에 alt와 imagePath가 있다', () => {
    for (const w of WELCOME_ILLUSTRATIONS) {
      expect(w.alt.length).toBeGreaterThan(0);
      expect(w.imagePath).toMatch(/^\/welcome\/g\d{2}\.webp$/);
    }
  });

  it('매핑된 파일이 존재한다', () => {
    for (const w of WELCOME_ILLUSTRATIONS) {
      const file = join(process.cwd(), 'public', 'welcome', `${w.id}.webp`);
      expect(existsSync(file)).toBe(true);
    }
  });
});