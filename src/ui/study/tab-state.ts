import type { KeyValueStorage } from './drafts';
import { encodeKeyPart } from './drafts';
import type { StudyView } from './types';

/**
 * 학습 탭 상태 저장 primitives (이슈 #52, ADR-0021) — sessionStorage에 계정·세트별 `view`·`index`만 둔다.
 * - 토큰·답안(초안)은 저장하지 않는다.
 * - 손상 JSON·잘못된 version·타입 불일치는 예외 없이 `null`로 무시한다.
 */

export interface TabState {
  readonly view: StudyView;
  readonly index: number;
}

export const TAB_KEY_PREFIX = 'moi.study.tab.v1';

const TAB_VERSION = 1;
const VIEWS: readonly StudyView[] = ['start', 'active', 'result', 'history'];

export function tabKey(userId: string, setId: string): string {
  return `${TAB_KEY_PREFIX}.${encodeKeyPart(userId)}.${encodeKeyPart(setId)}`;
}

function tabUserPrefix(userId: string): string {
  return `${TAB_KEY_PREFIX}.${encodeKeyPart(userId)}.`;
}

function parseTabState(value: unknown): TabState | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== TAB_VERSION) return null;
  const { view, index } = record;
  if (typeof view !== 'string' || !VIEWS.includes(view as StudyView)) return null;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null;
  return { view: view as StudyView, index };
}

/** 현재 탭 위치(view·index)를 계정·세트별로 저장한다. */
export function saveTabState(storage: KeyValueStorage, userId: string, setId: string, state: TabState): void {
  storage.setItem(tabKey(userId, setId), JSON.stringify({ version: TAB_VERSION, ...state }));
}

/** 같은 계정·세트에서만 탭 위치를 복원한다 — 그 외 계정·세트·손상 데이터는 `null`. */
export function readTabState(storage: KeyValueStorage, userId: string, setId: string): TabState | null {
  let raw: string | null;
  try {
    raw = storage.getItem(tabKey(userId, setId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    return parseTabState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearTabState(storage: KeyValueStorage, userId: string, setId: string): void {
  storage.removeItem(tabKey(userId, setId));
}

/** 로그아웃·계정 전환 시 해당 계정 탭 상태만 제거한다 — 다른 계정 키 값은 읽지 않는다. */
export function clearTabStatesForUser(storage: KeyValueStorage, userId: string): number {
  const prefix = tabUserPrefix(userId);
  let removed = 0;
  for (let i = storage.length - 1; i >= 0; i -= 1) {
    const key = storage.key(i);
    if (key !== null && key.startsWith(prefix)) {
      storage.removeItem(key);
      removed += 1;
    }
  }
  return removed;
}
