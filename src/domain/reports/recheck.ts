import { MAX_RECHECK_ATTEMPTS, RETRY_DELAY_MS } from './thresholds';
import type {
  FinishRecheckOptions,
  RecheckState,
  StartRecheckOptions,
} from './types';

/**
 * 일일 AI 재검수 순수 상태 전이 (이슈 #53, ADR-0021).
 * - 중복 실행 없이 재시도: running 중 start 금지.
 * - attempts는 startRecheck에서만 증가, 실패 후 24h 전 재시작 금지.
 * - 순수·결정적: 외부 패키지·DB·네트워크 의존 금지.
 */

/** 시작 가능 여부 — queued true, failed는 횟수·간격 충족 시만, running/succeeded false. */
export function canStartRecheck(state: RecheckState, opts: { readonly now: number }): boolean {
  switch (state.status) {
    case 'queued':
      return true;
    case 'failed':
      if (state.attempts >= MAX_RECHECK_ATTEMPTS) return false;
      if (state.lastAttemptAt === null) return true;
      return opts.now - state.lastAttemptAt >= RETRY_DELAY_MS;
    case 'running':
    case 'succeeded':
      return false;
  }
}

/** 시작 — 허용되면 running·attempts+1·startedAt=now, 아니면 null. */
export function startRecheck(state: RecheckState, opts: StartRecheckOptions): RecheckState | null {
  void opts.runId;
  if (!canStartRecheck(state, { now: opts.now })) return null;
  return { ...state, status: 'running', attempts: state.attempts + 1, startedAt: opts.now };
}

/** 종료 — running만 전이, 아니면 null. failed는 lastAttemptAt=now. */
export function finishRecheck(state: RecheckState, opts: FinishRecheckOptions): RecheckState | null {
  void opts.reason;
  if (state.status !== 'running') return null;
  if (opts.outcome === 'succeeded') return { ...state, status: 'succeeded' };
  return { ...state, status: 'failed', lastAttemptAt: opts.now };
}

/** 다음 재시도 가능 시각 — failed만 epoch ms, 소진/그 외는 null. */
export function nextRetryAt(state: RecheckState): number | null {
  if (state.status !== 'failed') return null;
  if (state.attempts >= MAX_RECHECK_ATTEMPTS) return null;
  if (state.lastAttemptAt === null) return 0;
  return state.lastAttemptAt + RETRY_DELAY_MS;
}

/** 재검수 예정 시각 — queued는 now, failed는 max(재시도 시각, now), 그 외 null. */
export function recheckDueAt(state: RecheckState, opts: { readonly now: number }): number | null {
  if (state.status === 'queued') return opts.now;
  if (state.status === 'failed') {
    const at = nextRetryAt(state);
    if (at === null) return null;
    return at <= opts.now ? opts.now : at;
  }
  return null;
}
