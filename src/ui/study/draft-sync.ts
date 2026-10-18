import type { ItemResponse, StudyActiveSet } from '../api/client';
import {
  DRAFT_KEY_PREFIX,
  classifyDraft,
  encodeKeyPart,
  readDraft,
  removeDraft,
  responsesEqual,
  saveDraft,
  type DraftEntry,
  type KeyValueStorage,
} from './drafts';
import { clearTabState, readTabState, saveTabState, type TabState } from './tab-state';

/**
 * 학습 초안 오프라인 동기화 연결 (이슈 #52, ADR-0021) — 스토리지 접근·재전송 계획·탭 상태 safe wrapper.
 * - 브라우저 저장소는 열기 실패/쓰기 예외(쿼터·사생활 모드)를 삼키고 앱을 깨뜨리지 않는다.
 * - 진실 원천은 서버(D1)다. 여기서 다루는 값은 미전송 답안 초안(localStorage)과 탭 위치(sessionStorage)뿐이다.
 */

/** localStorage 열기 — 차단·오류 환경에서는 null(초안 기록 불가, 흐름은 계속). */
export function openDraftStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function openTabStorage(): KeyValueStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export interface DraftRecord {
  questionId: string;
  entry: DraftEntry;
}

/** 계정·세트 초안 나열 — 키 목록(`key()`)으로만 찾고 다른 계정 값을 읽지 않는다. */
export function listDraftsForSet(storage: KeyValueStorage, userId: string, setId: string): DraftRecord[] {
  const prefix = `${DRAFT_KEY_PREFIX}.${encodeKeyPart(userId)}.${encodeKeyPart(setId)}.`;
  const out: DraftRecord[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key === null || !key.startsWith(prefix)) continue;
    let questionId: string;
    try {
      questionId = decodeURIComponent(key.slice(prefix.length));
    } catch {
      continue; // 깨진 인코딩 키는 건너뛴다
    }
    const entry = readDraft(storage, userId, setId, questionId);
    if (entry) out.push({ questionId, entry });
  }
  return out;
}

export type DraftRecordResult = 'saved' | 'none' | 'failed';

/** 로컬 선택을 초안으로 기록 — `saved`: 초안 존재, `none`: 서버 확인값과 같아 불필요, `failed`: 저장 불가(예외·미열기). */
export function recordDraft(
  storage: KeyValueStorage | null,
  userId: string,
  setId: string,
  questionId: string,
  response: ItemResponse,
  base: ItemResponse,
): DraftRecordResult {
  if (!storage) return 'failed';
  try {
    return saveDraft(storage, userId, setId, questionId, response, base) === null ? 'none' : 'saved';
  } catch {
    return 'failed';
  }
}

/** PATCH 성공 후 처리 — 초안이 방금 보낸 response와 같을 때만 제거한다(그 사이 새 선택은 보존). */
export function completeDraftSend(
  storage: KeyValueStorage | null,
  userId: string,
  setId: string,
  questionId: string,
  sent: ItemResponse,
): void {
  if (!storage) return;
  try {
    const current = readDraft(storage, userId, setId, questionId);
    if (current && responsesEqual(current.response, sent)) removeDraft(storage, userId, setId, questionId);
  } catch {
    // 초안 정리 실패는 재동기화에서 다시 시도한다
  }
}

export interface ConflictItem {
  questionId: string;
  server: ItemResponse;
  local: ItemResponse;
}

export interface SyncPlan {
  applied: string[];
  send: Array<{ questionId: string; response: ItemResponse }>;
  conflict: ConflictItem[];
}

/** 초안 + 서버 세트 → applied(제거)/send(재전송)/conflict(사용자 선택) — 자동 덮어쓰기 금지. */
export function planDrafts(drafts: DraftRecord[], serverSet: StudyActiveSet): SyncPlan {
  const plan: SyncPlan = { applied: [], send: [], conflict: [] };
  for (const { questionId, entry } of drafts) {
    const item = serverSet.items.find((i) => i.questionId === questionId);
    if (!item) {
      plan.applied.push(questionId); // 세트에 없는 문제 초안은 보낼 수 없으므로 버린다
      continue;
    }
    const kind = classifyDraft(entry, item.response);
    if (kind === 'applied') plan.applied.push(questionId);
    else if (kind === 'send') plan.send.push({ questionId, response: entry.response });
    else plan.conflict.push({ questionId, server: item.response, local: entry.response });
  }
  return plan;
}

/** 세트 초안 전체 제거(제출 완료·포기 시) — 초안 키만 제거한다. */
export function clearSetDrafts(storage: KeyValueStorage | null, userId: string, setId: string): void {
  if (!storage) return;
  try {
    for (const d of listDraftsForSet(storage, userId, setId)) removeDraft(storage, userId, setId, d.questionId);
  } catch {
    // 정리 실패는 무시한다 — 다음 동기화에서 다시 정리된다
  }
}

/** 탭 상태 복원 — 계정·세트별로만, 손상·예외는 null. */
export function loadTabState(userId: string, setId: string): TabState | null {
  const storage = openTabStorage();
  if (!storage) return null;
  try {
    return readTabState(storage, userId, setId);
  } catch {
    return null;
  }
}

export function persistTabState(userId: string, setId: string, state: TabState): void {
  const storage = openTabStorage();
  if (!storage) return;
  try {
    saveTabState(storage, userId, setId, state);
  } catch {
    // 쿼터·사생활 모드 — 탭 위치 복구 포기, 앱은 계속 동작
  }
}

export function dropTabState(userId: string, setId: string): void {
  const storage = openTabStorage();
  if (!storage) return;
  try {
    clearTabState(storage, userId, setId);
  } catch {
    // 무시
  }
}
