import type { KyInstance } from 'ky';

/** 테스트 주입용 최소 인터페이스 — RTL 테스트에서 가짜 클라이언트로 교체한다. */
export type ApiClient = Pick<KyInstance, 'get' | 'post' | 'patch'>;
