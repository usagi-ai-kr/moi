import { describe, expect, it } from 'vitest';
import {
  canStartRecheck,
  finishRecheck,
  nextRetryAt,
  recheckDueAt,
  startRecheck,
} from '@/domain/reports/recheck';
import { MAX_RECHECK_ATTEMPTS, RETRY_DELAY_MS } from '@/domain/reports/thresholds';
import type { RecheckState } from '@/domain/reports/types';

// 이슈 #53 — 재검수 상태 전이·중복/재시도 보호(ADR-0021: MAX 3회·24h 간격·순수 전이).
const NOW = 1_000_000_000_000;
const queued: RecheckState = { status: 'queued', attempts: 0, lastAttemptAt: null, startedAt: null };

describe('recheck state', () => {
  it('queued → start(running, attempts=1, startedAt=now)', () => {
    const next = startRecheck(queued, { now: NOW });
    expect(next).toMatchObject({ status: 'running', attempts: 1, startedAt: NOW });
    expect(canStartRecheck(queued, { now: NOW })).toBe(true);
  });

  it('running 중 start → null(중복 실행 보호)', () => {
    const running: RecheckState = { status: 'running', attempts: 1, lastAttemptAt: null, startedAt: NOW };
    expect(canStartRecheck(running, { now: NOW })).toBe(false);
    expect(startRecheck(running, { now: NOW })).toBeNull();
  });

  it('failed + 24h 미만 → null, 24h 이상 → running·attempts=2', () => {
    const failed: RecheckState = { status: 'failed', attempts: 1, lastAttemptAt: NOW, startedAt: NOW };
    expect(startRecheck(failed, { now: NOW + RETRY_DELAY_MS - 1 })).toBeNull();
    expect(canStartRecheck(failed, { now: NOW + RETRY_DELAY_MS - 1 })).toBe(false);
    const next = startRecheck(failed, { now: NOW + RETRY_DELAY_MS });
    expect(next).toMatchObject({ status: 'running', attempts: 2, startedAt: NOW + RETRY_DELAY_MS });
    expect(canStartRecheck(failed, { now: NOW + RETRY_DELAY_MS })).toBe(true);
  });

  it('attempts 3에서 failed → start null(횟수 소진)', () => {
    const failed: RecheckState = {
      status: 'failed',
      attempts: MAX_RECHECK_ATTEMPTS,
      lastAttemptAt: NOW,
      startedAt: NOW,
    };
    expect(startRecheck(failed, { now: NOW + RETRY_DELAY_MS * 2 })).toBeNull();
    expect(nextRetryAt(failed)).toBeNull();
    expect(recheckDueAt(failed, { now: NOW + RETRY_DELAY_MS * 2 })).toBeNull();
  });

  it('succeeded → start null', () => {
    const done: RecheckState = { status: 'succeeded', attempts: 1, lastAttemptAt: null, startedAt: NOW };
    expect(canStartRecheck(done, { now: NOW })).toBe(false);
    expect(startRecheck(done, { now: NOW })).toBeNull();
  });

  it('finish는 running만; failed는 lastAttemptAt 갱신, succeeded 종료', () => {
    const running: RecheckState = { status: 'running', attempts: 2, lastAttemptAt: NOW, startedAt: NOW + 1 };
    const failed = finishRecheck(running, { now: NOW + 2, outcome: 'failed' });
    expect(failed).toMatchObject({ status: 'failed', attempts: 2, lastAttemptAt: NOW + 2 });
    const done = finishRecheck(running, { now: NOW + 2, outcome: 'succeeded' });
    expect(done).toMatchObject({ status: 'succeeded', attempts: 2 });
    expect(finishRecheck(queued, { now: NOW, outcome: 'failed' })).toBeNull();
    expect(finishRecheck({ ...queued, status: 'succeeded' }, { now: NOW, outcome: 'failed' })).toBeNull();
    expect(
      finishRecheck({ ...queued, status: 'failed' }, { now: NOW, outcome: 'succeeded' }),
    ).toBeNull();
  });

  it('중복/재시도 경계: 경계 시각 포함·attempts는 start에서만 증가', () => {
    const failed: RecheckState = { status: 'failed', attempts: 2, lastAttemptAt: NOW, startedAt: NOW };
    expect(canStartRecheck(failed, { now: NOW + RETRY_DELAY_MS })).toBe(true);
    expect(canStartRecheck(failed, { now: NOW + RETRY_DELAY_MS - 1 })).toBe(false);
    const running = startRecheck(failed, { now: NOW + RETRY_DELAY_MS })!;
    expect(running.attempts).toBe(3);
    const refailed = finishRecheck(running, { now: NOW + RETRY_DELAY_MS + 5, outcome: 'failed' })!;
    expect(refailed.attempts).toBe(3);
    expect(refailed.lastAttemptAt).toBe(NOW + RETRY_DELAY_MS + 5);
  });

  it('due/ retry: queued는 now, 과거면 now, 미래면 예약 시각', () => {
    expect(recheckDueAt(queued, { now: NOW })).toBe(NOW);
    const failed: RecheckState = { status: 'failed', attempts: 1, lastAttemptAt: NOW, startedAt: NOW };
    expect(nextRetryAt(failed)).toBe(NOW + RETRY_DELAY_MS);
    expect(recheckDueAt(failed, { now: NOW })).toBe(NOW + RETRY_DELAY_MS);
    expect(recheckDueAt(failed, { now: NOW + RETRY_DELAY_MS + 1 })).toBe(NOW + RETRY_DELAY_MS + 1);
    const running: RecheckState = { status: 'running', attempts: 1, lastAttemptAt: null, startedAt: NOW };
    expect(recheckDueAt(running, { now: NOW })).toBeNull();
  });
});
