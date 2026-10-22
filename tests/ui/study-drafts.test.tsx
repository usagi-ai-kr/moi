import { beforeEach, describe, expect, it } from 'vitest';
import type { ItemResponse } from '../../src/ui/api/client';
import {
  classifyDraft,
  clearAllDrafts,
  clearDraftsForUser,
  draftKey,
  readDraft,
  recordServerResponse,
  removeDraft,
  saveDraft,
  type DraftEntry,
  type KeyValueStorage,
} from '../../src/ui/study/drafts';

function answered(...optionIds: string[]): ItemResponse {
  return { kind: 'answered', optionIds };
}

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

const A = { user: 'user-a', set: 'set-1', q: 'q-1' };
const B = { user: 'user-b', set: 'set-1', q: 'q-1' };

let storage: FakeStorage;

beforeEach(() => {
  storage = fakeStorage();
});

describe('계정·세트별 초안 격리', () => {
  it('계정 A 초안을 계정 B로 읽으면 null이고 B 키에는 A 데이터가 없다', () => {
    saveDraft(storage, A.user, A.set, A.q, answered('opt-1'));

    expect(readDraft(storage, B.user, B.set, B.q)).toBeNull();
    expect(storage.getItem(draftKey(B.user, B.set, B.q))).toBeNull();
    expect(readDraft(storage, A.user, A.set, A.q)?.response).toEqual(answered('opt-1'));
  });

  it('같은 계정이라도 세트·문제가 다르면 다른 키로 격리된다', () => {
    saveDraft(storage, A.user, 'set-1', 'q-1', answered('opt-1'));
    saveDraft(storage, A.user, 'set-2', 'q-1', answered('opt-2'));

    expect(readDraft(storage, A.user, 'set-2', 'q-1')?.response).toEqual(answered('opt-2'));
    expect(readDraft(storage, A.user, 'set-1', 'q-2')).toBeNull();
    expect(draftKey(A.user, 'set-1', 'q-1')).not.toBe(draftKey(A.user, 'set-2', 'q-1'));
  });

  it('키에 포함된 id에 구분자(.)가 있어도 prefix 격리가 유지된다', () => {
    saveDraft(storage, 'user.a', 'set.1', 'q.1', answered('opt-1'));

    expect(readDraft(storage, 'user', 'a.set.1', 'q.1')).toBeNull();
    expect(readDraft(storage, 'user.a', 'set.1', 'q.1')?.response).toEqual(answered('opt-1'));
    expect(clearDraftsForUser(storage, 'user')).toBe(0);
    expect(readDraft(storage, 'user.a', 'set.1', 'q.1')).not.toBeNull();
  });
});

describe('서버 응답과의 분류', () => {
  const draft: DraftEntry = { response: answered('opt-local'), base: answered('opt-base'), updatedAt: 1 };

  it('서버 응답 == 로컬 response → applied', () => {
    expect(classifyDraft(draft, answered('opt-local'))).toBe('applied');
  });

  it('서버 응답 == base → send(로컬 response 재전송)', () => {
    expect(classifyDraft(draft, answered('opt-base'))).toBe('send');
  });

  it('서버가 제3의 답안 → conflict', () => {
    expect(classifyDraft(draft, answered('opt-server'))).toBe('conflict');
  });

  it('optionIds 순서와 무관하게(집합) 비교한다', () => {
    const reordered: DraftEntry = { response: answered('opt-1', 'opt-2', 'opt-3'), base: answered('opt-3', 'opt-1'), updatedAt: 1 };

    expect(classifyDraft(reordered, answered('opt-2', 'opt-3', 'opt-1'))).toBe('applied');
    expect(classifyDraft(reordered, answered('opt-1', 'opt-3'))).toBe('send');
    expect(classifyDraft(reordered, answered('opt-1', 'opt-2'))).toBe('conflict');
  });

  it('pass/unanswered는 kind로 비교한다 — 같은 집합이 아니면 conflict', () => {
    const passDraft: DraftEntry = { response: { kind: 'pass' }, base: { kind: 'pass' }, updatedAt: 1 };

    expect(classifyDraft(passDraft, { kind: 'pass' })).toBe('applied');
    expect(classifyDraft(passDraft, { kind: 'unanswered' })).toBe('conflict');
    expect(classifyDraft({ response: { kind: 'unanswered' }, base: { kind: 'unanswered' }, updatedAt: 1 }, { kind: 'unanswered' })).toBe(
      'applied',
    );
  });
});

describe('base 유지와 초안 제거', () => {
  it('같은 문제를 다시 선택해도 기존 base는 유지된다(최초 서버 확인값)', () => {
    saveDraft(storage, A.user, A.set, A.q, answered('opt-1'));
    recordServerResponse(storage, A.user, A.set, A.q, answered('opt-server'), 2000);

    // 인자 base는 기존 초안의 base를 덮어쓰지 않는다
    const entry = saveDraft(storage, A.user, A.set, A.q, answered('opt-2'), answered('opt-ignored'), 3000);

    expect(entry?.base).toEqual(answered('opt-server'));
    expect(entry?.response).toEqual(answered('opt-2'));
    expect(entry?.updatedAt).toBe(3000);
    expect(readDraft(storage, A.user, A.set, A.q)?.base).toEqual(answered('opt-server'));
  });

  it('서버 미확인 초안의 base는 unanswered로 시작한다', () => {
    const entry = saveDraft(storage, A.user, A.set, A.q, answered('opt-1'));

    expect(entry?.base).toEqual({ kind: 'unanswered' });
    expect(classifyDraft(entry!, { kind: 'unanswered' })).toBe('send');
  });

  it('서버 보유 답안 B를 인자로 넘기면 오프라인 C도 base=B로 저장·분류된다', () => {
    const serverAnswer = answered('opt-b');

    const draft = saveDraft(storage, A.user, A.set, A.q, answered('opt-c'), serverAnswer, 5000);

    expect(draft?.base).toEqual(serverAnswer);
    expect(readDraft(storage, A.user, A.set, A.q)?.base).toEqual(serverAnswer);
    expect(classifyDraft(draft!, serverAnswer)).toBe('send');
    expect(classifyDraft(draft!, answered('opt-c'))).toBe('applied');
    expect(classifyDraft(draft!, answered('opt-x'))).toBe('conflict');
  });

  it('로컬 선택이 base와 같아지면 초안이 제거된다', () => {
    saveDraft(storage, A.user, A.set, A.q, answered('opt-1'));
    recordServerResponse(storage, A.user, A.set, A.q, answered('opt-base'), 2000);

    expect(saveDraft(storage, A.user, A.set, A.q, answered('opt-base'))).toBeNull();
    expect(readDraft(storage, A.user, A.set, A.q)).toBeNull();
  });

  it('서버가 로컬 후보와 같으면 base 갱신과 함께 초안이 제거된다', () => {
    saveDraft(storage, A.user, A.set, A.q, answered('opt-1'));

    expect(recordServerResponse(storage, A.user, A.set, A.q, answered('opt-1'), 2000)).toBeNull();
    expect(readDraft(storage, A.user, A.set, A.q)).toBeNull();
  });

  it('초안이 없으면 서버 응답만으로 초안을 만들지 않는다', () => {
    expect(recordServerResponse(storage, A.user, A.set, A.q, answered('opt-server'), 2000)).toBeNull();
    expect(readDraft(storage, A.user, A.set, A.q)).toBeNull();
  });

  it('removeDraft는 해당 문제 초안만 제거한다', () => {
    saveDraft(storage, A.user, A.set, 'q-1', answered('opt-1'));
    saveDraft(storage, A.user, A.set, 'q-2', answered('opt-2'));

    removeDraft(storage, A.user, A.set, 'q-1');

    expect(readDraft(storage, A.user, A.set, 'q-1')).toBeNull();
    expect(readDraft(storage, A.user, A.set, 'q-2')).not.toBeNull();
  });
});

describe('손상 데이터는 null로 무시한다', () => {
  it('손상 JSON → null', () => {
    storage.setItem(draftKey(A.user, A.set, A.q), '{not json');

    expect(readDraft(storage, A.user, A.set, A.q)).toBeNull();
  });

  it('잘못된 version → null', () => {
    storage.setItem(
      draftKey(A.user, A.set, A.q),
      JSON.stringify({ version: 2, response: { kind: 'pass' }, base: { kind: 'pass' }, updatedAt: 1 }),
    );

    expect(readDraft(storage, A.user, A.set, A.q)).toBeNull();
  });

  it('타입 불일치(optionIds 문자열·알 수 없는 kind·updatedAt 문자열) → null', () => {
    const key = draftKey(A.user, A.set, A.q);
    storage.setItem(key, JSON.stringify({ version: 1, response: { kind: 'answered', optionIds: 'opt-1' }, base: { kind: 'pass' }, updatedAt: 1 }));
    expect(readDraft(storage, A.user, A.set, A.q)).toBeNull();

    storage.setItem(key, JSON.stringify({ version: 1, response: { kind: 'unknown' }, base: { kind: 'pass' }, updatedAt: 1 }));
    expect(readDraft(storage, A.user, A.set, A.q)).toBeNull();

    storage.setItem(key, JSON.stringify({ version: 1, response: { kind: 'pass' }, base: { kind: 'pass' }, updatedAt: 'yesterday' }));
    expect(readDraft(storage, A.user, A.set, A.q)).toBeNull();
  });

  it('JSON 리터럴이 객체가 아니면 null', () => {
    storage.setItem(draftKey(A.user, A.set, A.q), '"draft"');

    expect(readDraft(storage, A.user, A.set, A.q)).toBeNull();
  });
});

describe('로그아웃·계정 전환 정리', () => {
  it('clearDraftsForUser는 해당 계정 키만 제거하고 다른 계정·세트 키는 보존한다', () => {
    saveDraft(storage, A.user, 'set-1', 'q-1', answered('opt-1'));
    saveDraft(storage, A.user, 'set-2', 'q-1', answered('opt-2'));
    saveDraft(storage, B.user, 'set-1', 'q-1', answered('opt-3'));
    const readsBefore = storage.reads.length;

    expect(clearDraftsForUser(storage, A.user)).toBe(2);
    const readsAfterClear = storage.reads.length;

    expect(readDraft(storage, A.user, 'set-1', 'q-1')).toBeNull();
    expect(readDraft(storage, A.user, 'set-2', 'q-1')).toBeNull();
    expect(readDraft(storage, B.user, 'set-1', 'q-1')?.response).toEqual(answered('opt-3'));
    expect(storage.reads.slice(readsBefore, readsAfterClear)).toEqual([]); // 정리 중 다른 계정 값을 읽지 않는다
  });

  it('clearAllDrafts는 초안 키만 제거하고 무관한 키는 보존한다', () => {
    saveDraft(storage, A.user, 'set-1', 'q-1', answered('opt-1'));
    saveDraft(storage, B.user, 'set-1', 'q-1', answered('opt-3'));
    storage.setItem('other-app.preference', '{"theme":"dark"}');

    expect(clearAllDrafts(storage)).toBe(2);

    expect(readDraft(storage, A.user, 'set-1', 'q-1')).toBeNull();
    expect(readDraft(storage, B.user, 'set-1', 'q-1')).toBeNull();
    expect(storage.getItem('other-app.preference')).toBe('{"theme":"dark"}');
  });
});

describe('저장 값 위생', () => {
  it('초안 JSON에 token·cookie·session·jti 문자열이 저장되지 않는다', () => {
    const entry = saveDraft(storage, A.user, A.set, A.q, answered('opt-1', 'opt-2'));
    const raw = storage.getItem(draftKey(A.user, A.set, A.q)) ?? '';

    expect(entry).not.toBeNull();
    expect(raw).not.toMatch(/token|cookie|session|jti/i);
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['base', 'response', 'updatedAt', 'version']);
    expect(Object.keys(entry!.response).sort()).toEqual(['kind', 'optionIds']);
  });
});
