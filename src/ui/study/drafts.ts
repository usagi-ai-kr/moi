import type { ItemResponse } from '../api/client';

/**
 * 학습 초안 저장 primitives (이슈 #52, ADR-0021) — React/UI·네트워크 연결 없는 순수 함수·타입.
 * - localStorage 키는 계정(userId)·세트(setId)·문제(questionId)별로 격리한다. 값은 `{version, response, base, updatedAt}`만 저장한다.
 *   토큰·쿠키·세션·개인정보는 키/값 어디에도 저장하지 않는다 (ADR-0006).
 * - `response`는 서버 미전송 로컬 후보, `base`는 마지막 서버 확인값(충돌 판정 기준)이며 재선택 시 덮어쓰지 않는다.
 * - 읽기는 손상 JSON·잘못된 version·타입 불일치를 예외 없이 `null`로 무시한다.
 */

/** 주입 가능한 최소 Storage 계약 — localStorage(브라우저)·가짜 스토리지(테스트) 겸용. */
export interface KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DraftEntry {
  readonly response: ItemResponse; // 마지막 로컬 선택 — 서버 미전송 후보
  readonly base: ItemResponse; // 마지막 서버 확인값 — 충돌 판정 기준
  readonly updatedAt: number;
}

/** applied: 로컬 후보 이미 반영 · send: base 확인값 재전송 · conflict: 제3의 답안(사용자 선택 필요). */
export type DraftClassification = 'applied' | 'send' | 'conflict';

export const DRAFT_KEY_PREFIX = 'moi.study.draft.v1';
/** 서버 확인 이전 초기 `base` — 세트 시작 시 서버 값은 미제출(unanswered)이다. */
export const UNCONFIRMED_BASE: ItemResponse = { kind: 'unanswered' };
const DRAFT_VERSION = 1;

/** 키 컴포넌트 인코딩 — 구분자 `.`이 id에 섞여도 계정 prefix 격리가 흐트러지지 않는다. */
export function encodeKeyPart(value: string): string {
  return encodeURIComponent(value).replace(/\./g, '%2E');
}

export function draftKey(userId: string, setId: string, questionId: string): string {
  return `${DRAFT_KEY_PREFIX}.${encodeKeyPart(userId)}.${encodeKeyPart(setId)}.${encodeKeyPart(questionId)}`;
}

function sameOptionSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  if (setA.size !== new Set(b).size) return false;
  return b.every((id) => setA.has(id));
}

/** 답안 동등성 — `optionIds`는 순서 무관(집합 의미), 그 외 kind는 그대로 비교한다. */
export function responsesEqual(a: ItemResponse, b: ItemResponse): boolean {
  if (a.kind === 'answered' && b.kind === 'answered') return sameOptionSet(a.optionIds, b.optionIds);
  return a.kind === b.kind;
}

function parseResponse(value: unknown): ItemResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const kind = (value as { kind?: unknown }).kind;
  if (kind === 'pass' || kind === 'unanswered') return { kind };
  if (kind !== 'answered') return null;
  const optionIds = (value as { optionIds?: unknown }).optionIds;
  if (!Array.isArray(optionIds) || optionIds.some((id) => typeof id !== 'string')) return null;
  return { kind: 'answered', optionIds: optionIds as string[] };
}

/** 손상 JSON·잘못된 version·타입 불일치는 `null`로 무시한다(예외 없음). */
export function readDraft(storage: KeyValueStorage, userId: string, setId: string, questionId: string): DraftEntry | null {
  let raw: string | null;
  try { raw = storage.getItem(draftKey(userId, setId, questionId)); } catch { return null; }
  if (raw === null) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (record.version !== DRAFT_VERSION) return null;
  if (typeof record.updatedAt !== 'number' || !Number.isFinite(record.updatedAt)) return null;
  const response = parseResponse(record.response);
  const base = parseResponse(record.base);
  if (response === null || base === null) return null;
  return { response, base, updatedAt: record.updatedAt };
}

function writeDraft(storage: KeyValueStorage, userId: string, setId: string, questionId: string, entry: DraftEntry): void {
  storage.setItem(draftKey(userId, setId, questionId), JSON.stringify({ version: DRAFT_VERSION, ...entry }));
}

/**
 * 로컬 선택을 초안으로 기록한다 — 기존 초안이 있으면 `existing.base` 유지(인자 `base`로 덮어쓰지 않음),
 * 없으면 인자 `base`(서버 보유 답안, 생략 시 `unanswered`)를 쓴다. `response`가 `base`와 같아지면 초안 제거.
 */
export function saveDraft(storage: KeyValueStorage, userId: string, setId: string, questionId: string, response: ItemResponse, base: ItemResponse = UNCONFIRMED_BASE, now: number = Date.now()): DraftEntry | null {
  const existing = readDraft(storage, userId, setId, questionId);
  const effectiveBase = existing?.base ?? base;
  if (responsesEqual(response, effectiveBase)) {
    storage.removeItem(draftKey(userId, setId, questionId));
    return null;
  }
  const entry: DraftEntry = { response, base: effectiveBase, updatedAt: now };
  writeDraft(storage, userId, setId, questionId, entry);
  return entry;
}

/** 서버 확인값으로 `base`를 갱신한다 — 로컬 후보와 같으면 초안 제거, 다르면 후보를 유지한 채 `base`만 갱신. 초안이 없으면 만들지 않는다. */
export function recordServerResponse(storage: KeyValueStorage, userId: string, setId: string, questionId: string, server: ItemResponse, now: number = Date.now()): DraftEntry | null {
  const existing = readDraft(storage, userId, setId, questionId);
  const response = existing?.response ?? server;
  if (responsesEqual(response, server)) {
    storage.removeItem(draftKey(userId, setId, questionId));
    return null;
  }
  const entry: DraftEntry = { response, base: server, updatedAt: now };
  writeDraft(storage, userId, setId, questionId, entry);
  return entry;
}

/** 로컬 초안 + 서버 응답 → 처리 분류(applied/send/conflict). */
export function classifyDraft(draft: DraftEntry, server: ItemResponse): DraftClassification {
  if (responsesEqual(server, draft.response)) return 'applied';
  if (responsesEqual(server, draft.base)) return 'send';
  return 'conflict';
}

export function removeDraft(storage: KeyValueStorage, userId: string, setId: string, questionId: string): void {
  storage.removeItem(draftKey(userId, setId, questionId));
}

/** 로그아웃·계정 전환 시 해당 계정 초안만 제거 — 다른 계정 키 값은 읽지 않는다. 제거 건수를 반환한다. */
export function clearDraftsForUser(storage: KeyValueStorage, userId: string): number {
  return removeKeysWithPrefix(storage, `${DRAFT_KEY_PREFIX}.${encodeKeyPart(userId)}.`);
}

/** 전체 초안 제거 — 초안 prefix 키만 제거한다. 제거 건수를 반환한다. */
export function clearAllDrafts(storage: KeyValueStorage): number {
  return removeKeysWithPrefix(storage, `${DRAFT_KEY_PREFIX}.`);
}

/** prefix 일치 키를 `key()` 순회로만 찾아 제거한다 — 타 계정 값 조회(`getItem`) 없음. */
function removeKeysWithPrefix(storage: KeyValueStorage, prefix: string): number {
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
