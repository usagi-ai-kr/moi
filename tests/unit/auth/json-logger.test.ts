import { describe, expect, it, vi } from 'vitest';
import { createJsonLogger } from '@/infra/logging/json-logger';

// ADR-0006 로그 계약: 허용 필드(level/msg/requestId/outcome)만 출력하고
// 토큰/쿠키/코드/시크릿/sub 원문은 구조적으로 출력될 수 없다(화이트리스트).
describe('JSON 로그 어댑터 (화이트리스트)', () => {
  it('level/msg/requestId/outcome만 JSON으로 출력한다', () => {
    const sink = vi.fn();
    const logger = createJsonLogger('req-123', sink);

    logger.info('kakao_login_complete', 'success');
    logger.warn('kakao_login_rejected', 'invalid_state');
    logger.error('kakao_login_failed', 'token_exchange_failed');

    expect(sink).toHaveBeenCalledTimes(3);
    const lines = sink.mock.calls.map((call) => JSON.parse(call[0] as string));
    expect(lines[0]).toEqual({ level: 'info', msg: 'kakao_login_complete', requestId: 'req-123', outcome: 'success' });
    expect(lines[1]).toEqual({ level: 'warn', msg: 'kakao_login_rejected', requestId: 'req-123', outcome: 'invalid_state' });
    expect(lines[2]).toEqual({ level: 'error', msg: 'kakao_login_failed', requestId: 'req-123', outcome: 'token_exchange_failed' });
  });

  it('outcome이 없는 이벤트도 출력한다', () => {
    const sink = vi.fn();
    const logger = createJsonLogger('req-1', sink);

    logger.info('kakao_login_started');

    expect(JSON.parse(sink.mock.calls[0][0] as string)).toEqual({
      level: 'info',
      msg: 'kakao_login_started',
      requestId: 'req-1',
    });
  });

  it('한 줄당 하나의 JSON 객체다(파싱 가능·다중 필드 주입 불가)', () => {
    const sink = vi.fn();
    const logger = createJsonLogger('req-2', sink);

    logger.warn('msg-with-"quotes"-and-\\-and\nnewline', 'outcome');

    const raw = sink.mock.calls[0][0] as string;
    expect(raw.split('\n')).toHaveLength(1);
    expect(() => JSON.parse(raw)).not.toThrow();
    const parsed = JSON.parse(raw) as { msg: string };
    expect(parsed.msg).toBe('msg-with-"quotes"-and-\\-and\nnewline');
  });
});
