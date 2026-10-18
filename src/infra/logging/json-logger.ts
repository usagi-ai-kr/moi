/**
 * ADR-0006 Worker 호환 JSON 로그 어댑터 — 화이트리스트 계약.
 *
 * 선택 근거(ADR-0016): pino는 Workers에서 `pino.transport()`/thread-stream 없이 사용해야 하고
 * redact는 지정 키 제거만 가능해 "허용 필드만 출력"의 화이트리스트 강제가 어긋난다.
 * 본 어댑터는 level/msg/requestId/outcome 4개 필드만 직렬화해 구조적으로 원문 유입이 불가능하며,
 * 감사 가능한 20여 줄로 동일 로그 계약(1행 1 JSON)을 만족한다.
 */

export type JsonLogLevel = 'info' | 'warn' | 'error';

export interface JsonLogger {
  info(msg: string, outcome?: string): void;
  warn(msg: string, outcome?: string): void;
  error(msg: string, outcome?: string): void;
}

export type JsonLogSink = (line: string) => void;

/** requestId 상관관계 + 화이트리스트 필드만 출력한다. 기본 sink는 console.log(Workers 호환). */
export function createJsonLogger(requestId: string, sink: JsonLogSink = (line) => console.log(line)): JsonLogger {
  const emit = (level: JsonLogLevel, msg: string, outcome?: string): void => {
    const entry: { level: JsonLogLevel; msg: string; requestId: string; outcome?: string } = { level, msg, requestId };
    if (outcome !== undefined) entry.outcome = outcome;
    sink(JSON.stringify(entry));
  };
  return {
    info: (msg, outcome) => emit('info', msg, outcome),
    warn: (msg, outcome) => emit('warn', msg, outcome),
    error: (msg, outcome) => emit('error', msg, outcome),
  };
}
