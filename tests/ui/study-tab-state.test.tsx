import { beforeEach, describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../../src/ui/study/drafts';
import {
  clearTabState,
  clearTabStatesForUser,
  readTabState,
  saveTabState,
  tabKey,
  type TabState,
} from '../../src/ui/study/tab-state';

interface FakeStorage extends KeyValueStorage {
  readonly reads: string[];
}

function fakeStorage(seed: Record<string, string> = {}): FakeStorage {
  const map = new Map<string, string>(Object.entries(seed));
  const reads: string[] = [];
  return {
    reads,
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => {
      reads.push(key);
      return map.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

const A = { user: 'user-a', set: 'set-1' };
const B = { user: 'user-b', set: 'set-1' };

let storage: FakeStorage;

beforeEach(() => {
  storage = fakeStorage();
  window.sessionStorage.clear();
});

describe('세션 탭 상태 저장·복구', () => {
  it('같은 userId·setId에서 view·index를 복원한다', () => {
    const state: TabState = { view: 'active', index: 7 };

    saveTabState(storage, A.user, A.set, state);

    expect(readTabState(storage, A.user, A.set)).toEqual(state);
  });

  it('실제 sessionStorage에도 같은 키로 저장·복원된다', () => {
    saveTabState(window.sessionStorage, A.user, A.set, { view: 'result', index: 0 });

    expect(window.sessionStorage.getItem(tabKey(A.user, A.set))).not.toBeNull();
    expect(readTabState(window.sessionStorage, A.user, A.set)).toEqual({ view: 'result', index: 0 });
  });

  it('다른 계정·다른 세트에서는 복원되지 않는다(격리)', () => {
    saveTabState(storage, A.user, A.set, { view: 'active', index: 3 });

    expect(readTabState(storage, B.user, A.set)).toBeNull();
    expect(readTabState(storage, A.user, 'set-2')).toBeNull();
    expect(storage.getItem(tabKey(B.user, A.set))).toBeNull();
  });

  it('손상 JSON·잘못된 version은 null로 무시한다', () => {
    storage.setItem(tabKey(A.user, A.set), '{broken');
    expect(readTabState(storage, A.user, A.set)).toBeNull();

    storage.setItem(tabKey(A.user, A.set), JSON.stringify({ version: 2, view: 'active', index: 3 }));
    expect(readTabState(storage, A.user, A.set)).toBeNull();
  });

  it('view·index 타입이 다르면 null로 무시한다', () => {
    storage.setItem(tabKey(A.user, A.set), JSON.stringify({ version: 1, view: 'sideways', index: 3 }));
    expect(readTabState(storage, A.user, A.set)).toBeNull();

    storage.setItem(tabKey(A.user, A.set), JSON.stringify({ version: 1, view: 'active', index: -1 }));
    expect(readTabState(storage, A.user, A.set)).toBeNull();

    storage.setItem(tabKey(A.user, A.set), JSON.stringify({ version: 1, view: 'active', index: 1.5 }));
    expect(readTabState(storage, A.user, A.set)).toBeNull();
  });

  it('저장 값은 version·view·index뿐 — 토큰·답안을 담지 않는다', () => {
    saveTabState(storage, A.user, A.set, { view: 'history', index: 2 });
    const raw = storage.getItem(tabKey(A.user, A.set)) ?? '';

    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['index', 'version', 'view']);
    expect(raw).not.toMatch(/token|cookie|session|jti|response|optionIds/i);
  });
});

describe('탭 상태 정리', () => {
  it('clearTabState는 해당 세트만, clearTabStatesForUser는 해당 계정만 제거한다', () => {
    saveTabState(storage, A.user, 'set-1', { view: 'active', index: 1 });
    saveTabState(storage, A.user, 'set-2', { view: 'result', index: 0 });
    saveTabState(storage, B.user, 'set-1', { view: 'start', index: 0 });
    const readsBefore = storage.reads.length;
    clearTabState(storage, A.user, 'set-1');
    const afterSingleClear = storage.reads.length;
    expect(clearTabStatesForUser(storage, A.user)).toBe(1);
    const afterUserClear = storage.reads.length;

    // 정리 두 경우 모두 키 목록(key())만 사용하고 값(getItem)을 읽지 않는다
    expect(storage.reads.slice(readsBefore, afterSingleClear)).toEqual([]);
    expect(storage.reads.slice(afterSingleClear, afterUserClear)).toEqual([]);

    expect(readTabState(storage, A.user, 'set-1')).toBeNull();
    expect(readTabState(storage, A.user, 'set-2')).toBeNull();
    expect(readTabState(storage, B.user, 'set-1')).toEqual({ view: 'start', index: 0 });
  });
});
